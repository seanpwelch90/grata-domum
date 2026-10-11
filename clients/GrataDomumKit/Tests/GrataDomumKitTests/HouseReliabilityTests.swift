import Foundation
import XCTest

@testable import GrataDomumKit

private final class StubProtocol: URLProtocol {
    static var reply: (URLRequest) throws -> (Int, Data) = { _ in (500, Data()) }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data) = try Self.reply(request)
            guard let url = request.url,
                let response = HTTPURLResponse(
                    url: url, statusCode: status, httpVersion: nil, headerFields: nil)
            else { return }
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@MainActor
final class HouseReliabilityTests: XCTestCase {
    private func fixture() -> Snapshot {
        Snapshot(
            apiVersion: 1, syncedAt: "2026-12-24T12:00:00Z", timeZone: "America/New_York",
            household: .init(id: "fictional-house", name: "Sample Home"),
            device: .init(
                id: "sample-ipad", name: "Guest room", surface: .ipad, roomId: "sample-room",
                roomName: "Guest room", canPostNotes: true),
            visit: nil,
            theme: .init(
                id: "default", name: "Welcome Home", background: "#fff",
                backgroundSecondary: "#eee", text: "#111", textSecondary: "#333", accent: "#234",
                accentText: "#fff", surface: "#fff", surfaceText: "#111", surfaceMuted: "#333",
                motion: "none", greetingStyle: "plain"),
            wifi: nil, location: nil, weather: nil,
            actions: [
                .init(
                    id: "sample-light", label: "Lamp", kind: "toggle", availability: "ok",
                    power: "off", brightness: nil, message: "")
            ],
            events: [], map: .init(imageURL: "", pins: []), guide: [], notes: [],
            showNotesOnTV: false)
    }

    private func environment() throws -> (URL, UserDefaults, URLSession) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let suite = "grata.tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.set("http://sample.invalid:8787", forKey: "grata.server")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let transport = URLSession(configuration: config)
        addTeardownBlock {
            transport.invalidateAndCancel()
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: root)
        }
        return (root, defaults, transport)
    }

    func testSharedContractFixturesDecode() throws {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let directory = root.appendingPathComponent("contracts/fixtures")
        let files = try FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        )
        .filter { $0.pathExtension == "json" && $0.lastPathComponent != "manifest.json" }
        XCTAssertGreaterThanOrEqual(files.count, 7)
        for file in files {
            let snapshot = try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: file))
            XCTAssertEqual(snapshot.apiVersion, 1, file.lastPathComponent)
            XCTAssertEqual(snapshot.household.id, "fixture-house", file.lastPathComponent)
        }
    }

    func testDurableMediaNamespaceBudgetAndPurge() throws {
        let (root, _, _) = try environment()
        var cache = HouseMediaCache(directory: root.appendingPathComponent("media"))
        cache.budget = 6
        cache.write(Data([1, 2, 3, 4]), namespace: "house-a", path: "map?v=1")
        let restarted = HouseMediaCache(directory: cache.directory)
        XCTAssertEqual(restarted.read(namespace: "house-a", path: "map?v=1"), Data([1, 2, 3, 4]))
        XCTAssertNil(restarted.read(namespace: "house-b", path: "map?v=1"))
        XCTAssertNil(restarted.read(namespace: "house-a", path: "map?v=2"))
        cache.write(Data([5, 6, 7, 8]), namespace: "house-a", path: "cover")
        let files = try FileManager.default.contentsOfDirectory(
            at: cache.directory, includingPropertiesForKeys: nil)
        XCTAssertEqual(files.count, 1)
        cache.purge()
        XCTAssertNil(restarted.read(namespace: "house-a", path: "cover"))
    }

    func testMediaRejectsDifferentOrigin() throws {
        let base = try XCTUnwrap(URL(string: "http://sample.invalid:8787"))
        let client = HouseClient(baseURL: base, token: "fictional-token")
        XCTAssertNotNil(client.authenticatedMediaURL("/api/v1/media/map?v=2"))
        XCTAssertNil(client.authenticatedMediaURL("https://sample.invalid:8787/map"))
        XCTAssertNil(client.authenticatedMediaURL("http://other.invalid:8787/map"))
        XCTAssertNil(client.authenticatedMediaURL("http://sample.invalid:9999/map"))
        XCTAssertNil(client.authenticatedMediaURL("http://user:secret@sample.invalid:8787/map"))
    }

    func testColdRestartKeepsPendingIDAndRevocationPurgesHousehold() async throws {
        let (root, defaults, transport) = try environment()
        let data = try JSONEncoder().encode(fixture())
        StubProtocol.reply = { request in
            if request.url?.path == "/api/v1/snapshot" { return (200, data) }
            throw URLError(.notConnectedToInternet)
        }
        let first = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
            transport: transport)
        await first.refresh()
        _ = await first.postNote(authorName: "Avery", body: "Tea please")
        let id = try XCTUnwrap(first.outbox.first?.id)
        XCTAssertEqual(first.outbox.first?.status, "pending")
        StubProtocol.reply = { _ in throw URLError(.notConnectedToInternet) }
        let restarted = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
            transport: transport)
        await restarted.refresh()
        XCTAssertEqual(restarted.snapshot?.household.id, "fictional-house")
        XCTAssertEqual(restarted.outbox.first?.id, id)
        XCTAssertTrue(restarted.offline)
        StubProtocol.reply = { _ in (401, Data()) }
        await restarted.refresh()
        XCTAssertNil(restarted.snapshot)
        XCTAssertTrue(restarted.outbox.isEmpty)
        XCTAssertEqual(restarted.savedAuthor(), "")
        XCTAssertEqual(restarted.connection, .revoked)
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: root.appendingPathComponent("snapshot.json").path))
    }

    func testRevokedNoteIsNotReportedAsSent() async throws {
        let (root, defaults, transport) = try environment()
        let data = try JSONEncoder().encode(fixture())
        StubProtocol.reply = { request in
            if request.url?.path == "/api/v1/notes" { return (401, Data()) }
            return (200, data)
        }
        let session = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
            transport: transport)
        await session.refresh()
        let error = await session.postNote(authorName: "Avery", body: "Tea please")
        XCTAssertFalse(error.isEmpty)
        XCTAssertEqual(session.connection, .revoked)
    }

    func testPermissionFailureStopsAutomaticRetryAndVersionBlocksWrites() async throws {
        let (root, defaults, transport) = try environment()
        let data = try JSONEncoder().encode(fixture())
        var noteCalls = 0
        StubProtocol.reply = { request in
            if request.url?.path == "/api/v1/notes" {
                noteCalls += 1
                return (403, Data())
            }
            return (200, data)
        }
        let session = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
            transport: transport)
        await session.refresh()
        _ = await session.postNote(authorName: "Avery", body: "Tea please")
        XCTAssertEqual(session.outbox.first?.status, "failed")
        await session.refresh()
        XCTAssertEqual(noteCalls, 1)
        StubProtocol.reply = { _ in (426, Data()) }
        await session.refresh()
        XCTAssertEqual(session.connection, .incompatible)
        XCTAssertNotNil(session.snapshot)
        _ = await session.postNote(authorName: "Avery", body: "Another note")
        XCTAssertEqual(session.outbox.count, 1)
    }

    func testNewHouseholdDoesNotInheritQueueOrAuthor() async throws {
        let (root, defaults, transport) = try environment()
        let firstData = try JSONEncoder().encode(fixture())
        StubProtocol.reply = { request in
            if request.url?.path == "/api/v1/notes" { throw URLError(.notConnectedToInternet) }
            return (200, firstData)
        }
        let session = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
            transport: transport)
        await session.refresh()
        _ = await session.postNote(authorName: "Avery", body: "Tea please")
        XCTAssertEqual(session.outbox.count, 1)
        var next = fixture()
        next.household.id = "another-fictional-house"
        let nextData = try JSONEncoder().encode(next)
        StubProtocol.reply = { _ in (200, nextData) }
        await session.refresh()
        XCTAssertTrue(session.outbox.isEmpty)
        XCTAssertEqual(session.savedAuthor(), "")
        XCTAssertEqual(session.snapshot?.household.id, "another-fictional-house")
    }

    #if DEBUG
        func testPreviewCannotSendPhysicalActionEvenWithPairedSession() async throws {
            let (root, defaults, transport) = try environment()
            let snapshot = fixture()
            let data = try JSONEncoder().encode(snapshot)
            var actionCalls = 0
            StubProtocol.reply = { request in
                if request.url?.path.hasPrefix("/api/v1/actions/") == true { actionCalls += 1 }
                return (200, data)
            }
            let session = HouseSession(
                surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
                transport: transport)
            await session.refresh()
            let key = "GRATA_PREVIEW_SNAPSHOT"
            let previous = ProcessInfo.processInfo.environment[key]
            setenv(key, "/fictional-preview.json", 1)
            defer {
                if let previous { setenv(key, previous, 1) } else { unsetenv(key) }
            }
            let action = try XCTUnwrap(snapshot.actions.first)
            await session.runAction(action, command: "toggle")
            XCTAssertEqual(actionCalls, 0)
            XCTAssertEqual(
                session.actionState[action.id]?.message, "Preview only. No device command was sent."
            )
            XCTAssertTrue(session.outbox.isEmpty)
        }

    #endif

    func testConcurrentActionDoesNotSubmitTwice() async throws {
        let (root, defaults, transport) = try environment()
        let snapshot = fixture()
        let data = try JSONEncoder().encode(snapshot)
        let received = expectation(description: "action received")
        let release = DispatchSemaphore(value: 0)
        var calls = 0
        StubProtocol.reply = { request in
            if request.url?.path.hasPrefix("/api/v1/actions/") == true {
                calls += 1
                received.fulfill()
                _ = release.wait(timeout: .now() + 2)
                return (200, Data("{}".utf8))
            }
            return (200, data)
        }
        let session = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
            transport: transport)
        await session.refresh()
        let action = try XCTUnwrap(snapshot.actions.first)
        let first = Task { await session.runAction(action, command: "toggle") }
        await fulfillment(of: [received], timeout: 1)
        await session.runAction(action, command: "toggle")
        release.signal()
        await first.value
        XCTAssertEqual(calls, 1)
    }

    func testActionTimeoutNeverReplaysAndReportsUnknown() async throws {
        let (root, defaults, transport) = try environment()
        let snapshot = fixture()
        let data = try JSONEncoder().encode(snapshot)
        var actionCalls = 0
        StubProtocol.reply = { request in
            if request.url?.path.hasPrefix("/api/v1/actions/") == true {
                actionCalls += 1
                throw URLError(.timedOut)
            }
            return (200, data)
        }
        let session = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: "fictional-token",
            transport: transport)
        await session.refresh()
        let action = try XCTUnwrap(snapshot.actions.first)
        await session.runAction(action, command: "toggle")
        XCTAssertEqual(actionCalls, 1)
        XCTAssertTrue(session.actionState[action.id]?.message.contains("Couldn’t confirm") == true)
        await session.refresh()
        XCTAssertEqual(actionCalls, 1)
        XCTAssertTrue(session.outbox.isEmpty)
    }
}
