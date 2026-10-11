import Foundation
import Network
import Observation

@MainActor
@Observable
public final class HouseSession {
    public let surface: Surface
    public private(set) var snapshot: Snapshot?
    public private(set) var phase: Phase = .loading
    public private(set) var offline = false
    public private(set) var outbox: [PendingNote] = []
    public enum Connection: Sendable {
        case disconnected, reconnecting, connected, revoked, incompatible
    }
    public private(set) var connection: Connection = .disconnected
    public private(set) var now = Date()
    private let mediaCache: HouseMediaCache
    private let storageDirectory: URL
    private let defaults: UserDefaults
    private let transport: URLSession
    private let persistToken: (String?) -> Void
    private var generation = UUID()
    private var refreshTask: Task<Void, Never>?
    private var refreshRequestID = UUID()
    private var liveTask: Task<Void, Error>?
    private var flushing = false
    private var active = true
    private var pairing = false
    private var mediaTask: Task<Void, Never>?
    private var noteTask: Task<Void, Never>?
    public var pairError = ""
    public var actionState: [String: ActionState] = [:]
    public var serverAddress: String

    public enum Phase: Sendable {
        case loading
        case unpaired
        case ready
    }

    public struct ActionState: Sendable, Equatable {
        public var pending: Bool
        public var message: String
    }

    private var token: String?
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "grata.network")
    private var pathOnline = true
    private var started = false

    public convenience init(surface: Surface) {
        let directory = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("GrataDomum", isDirectory: true)
        self.init(
            surface: surface, directory: directory, defaults: .standard,
            token: DeviceKeychain.load(), transport: .shared
        ) { value in
            if let value { DeviceKeychain.save(value) } else { DeviceKeychain.clear() }
        }
    }

    // Internal dependency injection keeps tests out of the real cache, defaults and keychain.
    init(
        surface: Surface, directory: URL, defaults: UserDefaults, token: String?,
        transport: URLSession, persistToken: @escaping (String?) -> Void = { _ in }
    ) {
        self.surface = surface
        storageDirectory = directory
        mediaCache = HouseMediaCache(directory: directory.appendingPathComponent("media"))
        self.defaults = defaults
        self.transport = transport
        self.persistToken = persistToken
        serverAddress = defaults.string(forKey: "grata.server") ?? ""
        self.token = token
        if token != nil, let cached = read(Snapshot.self, name: "snapshot") { snapshot = cached }
        if token != nil, let stored = read([PendingNote].self, name: "outbox") { outbox = stored }
    }

    public func run() async {
        if !started {
            started = true
            monitor.pathUpdateHandler = { [weak self] path in
                Task { @MainActor in self?.pathOnline = path.status == .satisfied }
            }
            monitor.start(queue: monitorQueue)
            if token == nil {
                phase = .unpaired
            } else if snapshot != nil {
                phase = .ready
                await refresh()
            } else {
                await refresh()
            }
        }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.watchLive() }
            group.addTask { await self.tick() }
            await group.waitForAll()
        }
    }

    public func pair(code: String, name: String) async {
        guard !pairing else { return }
        pairing = true
        defer { pairing = false }
        let cleaned = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !cleaned.isEmpty else {
            pairError = "Enter the pairing code from the home server."
            return
        }
        guard let base = HouseText.normalizeServer(serverAddress) else {
            pairError = "Enter the home server address, like http://192.168.1.20:8787."
            return
        }
        pairError = ""
        forget()
        defaults.set(base.absoluteString, forKey: "grata.server")
        serverAddress = base.absoluteString
        let client = HouseClient(baseURL: base, token: nil, session: transport)
        let attempt = generation
        do {
            let paired = try await client.pair(code: cleaned, name: name, surface: surface)
            guard attempt == generation else { return }
            token = paired.deviceToken
            persistToken(paired.deviceToken)
            // Redemption is complete. A failed first snapshot must offer refresh,
            // rather than presenting a second pairing attempt for a used code.
            phase = .loading
            await refresh()
        } catch let failure as HouseFailure {
            pairError = failure.message
            phase = .unpaired
        } catch {
            pairError = "The home server did not respond."
            phase = .unpaired
        }
    }

    public func forget() {
        generation = UUID()
        mediaTask?.cancel()
        mediaTask = nil
        refreshTask?.cancel()
        refreshTask = nil
        liveTask?.cancel()
        liveTask = nil
        noteTask?.cancel()
        noteTask = nil
        token = nil
        persistToken(nil)
        mediaCache.purge()
        defaults.removeObject(forKey: "grata.author")
        actionState = [:]
        connection = .disconnected
        snapshot = nil
        outbox = []
        phase = .unpaired
        offline = false
        remove("snapshot")
        remove("outbox")
    }

    public func postNote(authorName: String, body: String) async -> String {
        guard surface == .ipad, snapshot?.device.canPostNotes == true, connection != .incompatible
        else {
            return "Notes are not available on this display."
        }
        let note = PendingNote(
            clientRequestId: UUID().uuidString,
            authorName: authorName.trimmingCharacters(in: .whitespacesAndNewlines),
            body: body.trimmingCharacters(in: .whitespacesAndNewlines),
            createdAt: ISO8601DateFormatter().string(from: Date()),
            status: "pending",
            error: ""
        )
        if note.authorName.isEmpty || note.body.isEmpty { return "Add your name and a note." }
        defaults.set(note.authorName, forKey: "grata.author")
        let attempt = generation
        remember(snapshot, outbox + [note])
        await flush()
        guard attempt == generation else {
            return "This display needs pairing again. The note was not confirmed."
        }
        if let kept = outbox.first(where: { $0.clientRequestId == note.clientRequestId }) {
            return kept.error.isEmpty ? "Not sent yet." : kept.error
        }
        await refresh()
        return ""
    }

    public func retryNote(_ clientRequestId: String) async {
        outbox = outbox.map { note in
            guard note.clientRequestId == clientRequestId else { return note }
            var copy = note
            copy.status = "pending"
            copy.error = ""
            return copy
        }
        remember(snapshot, outbox)
        await flush()
        await refresh()
    }

    public func discardNote(_ clientRequestId: String) {
        remember(snapshot, outbox.filter { $0.clientRequestId != clientRequestId })
    }

    public func savedAuthor() -> String {
        defaults.string(forKey: "grata.author") ?? ""
    }

    public func runAction(_ action: RoomAction, command: String, level: Int? = nil) async {
        guard !HousePreview.isActive else {
            actionState[action.id] = ActionState(
                pending: false, message: "Preview only. No device command was sent.")
            return
        }
        guard actionState[action.id]?.pending != true else { return }
        if !pathOnline || offline || connection != .connected || surface == .tv
            || action.availability != "ok"
            || snapshot?.actions.contains(where: { $0.id == action.id }) != true
        {
            actionState[action.id] = ActionState(
                pending: false, message: "This needs a connection. Nothing was changed.")
            return
        }
        actionState[action.id] = ActionState(pending: true, message: "")
        guard let client = makeClient() else {
            actionState[action.id] = ActionState(
                pending: false, message: "This needs a connection. Nothing was changed.")
            return
        }
        let attempt = generation
        do {
            try await client.runAction(id: action.id, command: command, level: level)
            guard attempt == generation else { return }
            actionState[action.id] = ActionState(pending: false, message: "")
            await refresh()
        } catch let failure as HouseFailure {
            guard attempt == generation else { return }
            if handleAuthorization(failure) { return }
            if failure.status == 0 {
                offline = true
                actionState[action.id] = ActionState(
                    pending: false,
                    message: "Couldn’t confirm the change. Check the device before trying again.")
            } else {
                actionState[action.id] = ActionState(pending: false, message: failure.message)
            }
        } catch {
            guard attempt == generation else { return }
            offline = true
            actionState[action.id] = ActionState(
                pending: false,
                message: "Couldn’t confirm the change. Check the device before trying again.")
        }
    }

    public func imageData(_ path: String) async -> Data? {
        guard !path.isEmpty, let token, let household = snapshot?.household.id,
            let client = makeClient(), client.authenticatedMediaURL(path) != nil
        else { return nil }
        let namespace = "\(client.baseURL.absoluteString)|\(household)|\(token)"
        if let cached = mediaCache.read(namespace: namespace, path: path) { return cached }
        let attempt = generation
        do {
            let data = try await client.imageData(path)
            guard attempt == generation else { return nil }
            mediaCache.write(data, namespace: namespace, path: path)
            return data
        } catch let failure as HouseFailure {
            if attempt == generation { _ = handleAuthorization(failure) }
            return nil
        } catch { return nil }
    }

    public func refresh() async {
        guard active, connection != .incompatible else { return }
        if let task = refreshTask {
            await task.value
            return
        }
        let requestID = UUID()
        refreshRequestID = requestID
        let task = Task { await performRefresh() }
        refreshTask = task
        await withTaskCancellationHandler(
            operation: { await task.value }, onCancel: { task.cancel() })
        if refreshRequestID == requestID { refreshTask = nil }
    }

    private func performRefresh() async {
        let attempt = generation
        guard let client = makeClient(), token != nil else {
            phase = .unpaired
            return
        }
        do {
            let next = try await client.snapshot()
            guard attempt == generation else { return }
            if let previous = snapshot, previous.household.id != next.household.id {
                outbox = []
                mediaCache.purge()
                defaults.removeObject(forKey: "grata.author")
            }
            if !next.device.canPostNotes {
                outbox = outbox.map { note in
                    var failed = note
                    failed.status = "failed"
                    failed.error = "Notes are no longer available on this display."
                    return failed
                }
            }
            remember(next, outbox)
            phase = .ready
            offline = false
            connection = .connected
            if mediaTask == nil {
                let paths = Set(
                    ([next.visit?.coverURL ?? "", next.map.imageURL]
                        + (next.visit?.guests.map(\.avatarURL) ?? [])
                        + next.map.pins.map(\.photoURL) + next.guide.map(\.photoURL)).filter {
                            !$0.isEmpty
                        })
                mediaTask = Task { [weak self] in
                    for path in paths {
                        guard !Task.isCancelled, let self, self.generation == attempt else {
                            return
                        }
                        _ = await self.imageData(path)
                    }
                    if let self, self.generation == attempt, !Task.isCancelled {
                        self.mediaTask = nil
                    }
                }
            }
            if noteTask == nil {
                noteTask = Task { [weak self] in
                    await self?.flush()
                    if let self, self.generation == attempt { self.noteTask = nil }
                }
            }
        } catch let failure as HouseFailure {
            guard attempt == generation, !Task.isCancelled else { return }
            if handleAuthorization(failure) { return }
            connection = .disconnected
            offline = true
            phase = snapshot == nil ? .loading : .ready
            if snapshot == nil { pairError = failure.message }
        } catch {
            guard attempt == generation, !Task.isCancelled else { return }
            offline = true
            connection = .disconnected
            phase = snapshot == nil ? .loading : .ready
        }
    }

    private func flush() async {
        guard !flushing, connection != .incompatible, snapshot?.device.canPostNotes == true,
            let client = makeClient()
        else { return }
        flushing = true
        defer { flushing = false }
        let attempt = generation
        for note in outbox where note.status == "pending" {
            var updated: PendingNote? = note
            do {
                try await client.postNote(
                    clientRequestId: note.clientRequestId, authorName: note.authorName,
                    body: note.body)
                updated = nil
            } catch let failure as HouseFailure {
                guard attempt == generation else { return }
                if handleAuthorization(failure) { return }
                updated?.status =
                    failure.status == 0 || failure.status >= 500 || failure.status == 429
                    ? "pending" : "failed"
                updated?.error =
                    failure.status == 0
                    ? "Not sent yet. It will retry when the house is back." : failure.message
            } catch {
                updated?.error = "Not sent yet. It will retry when the house is back."
            }
            guard attempt == generation else { return }
            // Merge against current queue so notes created/discarded while awaiting are preserved.
            if let index = outbox.firstIndex(where: { $0.id == note.id }) {
                if let updated { outbox[index] = updated } else { outbox.remove(at: index) }
                remember(snapshot, outbox)
            }
        }
    }

    @discardableResult
    private func handleAuthorization(_ failure: HouseFailure) -> Bool {
        if failure.status == 401 {
            forget()
            connection = .revoked
            pairError = "This display needs to be paired again."
            return true
        }
        if failure.status == 426 {
            connection = .incompatible
            pairError = "Update this app to connect to the home server."
            return true
        }
        return false
    }

    public func setActive(_ value: Bool) {
        active = value
        if !value {
            mediaTask?.cancel()
            mediaTask = nil
            refreshTask?.cancel()
            refreshTask = nil
            liveTask?.cancel()
            liveTask = nil
            noteTask?.cancel()
            noteTask = nil
        }
        if value { Task { await refresh() } }
    }

    private func tick() async {
        while !Task.isCancelled {
            if active {
                now = Date()
                await refresh()
            }
            do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
        }
    }

    private func watchLive() async {
        var backoff: Double = 2
        while !Task.isCancelled {
            guard active, token != nil, connection != .incompatible, let client = makeClient()
            else {
                try? await Task.sleep(nanoseconds: 400_000_000)
                continue
            }
            let attempt = generation
            do {
                await refresh()
                if connection == .connected { backoff = 2 }
                guard generation == attempt, connection != .incompatible else { continue }
                let listener = Task {
                    try await client.listen { [weak self] in
                        guard let self, await self.generation == attempt else { return }
                        await self.refresh()
                    }
                }
                liveTask = listener
                try await withTaskCancellationHandler(
                    operation: { try await listener.value }, onCancel: { listener.cancel() })
                liveTask = nil
            } catch {
                guard !Task.isCancelled else { return }
                if attempt == generation, active {
                    if let failure = error as? HouseFailure, handleAuthorization(failure) {
                        continue
                    }
                    connection = .reconnecting
                    offline = true
                }
            }
            let delay = backoff * Double.random(in: 0.8...1.2)
            backoff = min(30, backoff * 2)
            do { try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) } catch { return }
        }
    }

    private func makeClient() -> HouseClient? {
        guard let address = defaults.string(forKey: "grata.server"),
            let base = HouseText.normalizeServer(address)
        else { return nil }
        return HouseClient(baseURL: base, token: token, session: transport)
    }

    private func remember(_ next: Snapshot?, _ pending: [PendingNote]) {
        snapshot = next
        outbox = pending
        if let next { write(next, name: "snapshot") }
        write(pending, name: "outbox")
    }

    private func directory() -> URL {
        try? FileManager.default.createDirectory(
            at: storageDirectory, withIntermediateDirectories: true)
        return storageDirectory
    }

    private func write<T: Encodable>(_ value: T, name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: directory().appendingPathComponent("\(name).json"), options: .atomic)
    }

    private func read<T: Decodable>(_ type: T.Type, name: String) -> T? {
        let url = directory().appendingPathComponent("\(name).json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func remove(_ name: String) {
        try? FileManager.default.removeItem(at: directory().appendingPathComponent("\(name).json"))
    }
}
