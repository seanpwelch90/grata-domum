import Foundation
import Network
import Observation
import dnssd

public struct NearbyServer: Identifiable, Equatable, Sendable {
    public let name: String
    public let type: String
    public let domain: String
    public let interfaceIndex: UInt32
    public let scheme: String
    public var id: String { "\(name)|\(type)|\(domain)|\(interfaceIndex)" }
    public var location: String { "\(domain) · Network \(interfaceIndex)" }

    static func scheme(from record: NWTXTRecord) -> String? {
        // Required, bounded metadata. Do not infer HTTP for an unknown advertisement.
        guard record.data.count <= 1024, record.dictionary.count <= 16,
            case .string(let api) = record.getEntry(for: "api"), api.utf8.count <= 3,
            Int(api).map({ $0 > 0 }) == true,
            case .string("/") = record.getEntry(for: "path"),
            case .string(let scheme) = record.getEntry(for: "scheme"),
            scheme == "http" || scheme == "https"
        else { return nil }
        return scheme
    }
}

/// Foreground-only system Bonjour browsing. Never touches the paired session.
@MainActor @Observable
public final class ServerDiscovery {
    public private(set) var servers: [NearbyServer] = []
    public private(set) var searching = false
    public private(set) var message = ""
    private var browser: NWBrowser?
    private var deadline: Task<Void, Never>?
    private var generation = UUID()

    public init() {}

    public func search() {
        stop()
        servers = []
        message = "Looking for home servers…"
        searching = true
        let attempt = generation
        let browser = NWBrowser(
            for: .bonjourWithTXTRecord(type: "_grata-domum._tcp", domain: "local."),
            using: .tcp)
        self.browser = browser
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in
                guard let self, self.generation == attempt else { return }
                self.update(results)
            }
        }
        browser.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                guard let self, self.generation == attempt else { return }
                switch state {
                case .failed, .waiting:
                    self.stop()
                    self.message =
                        "Couldn’t search this network. Check local network access in Settings, or enter an address manually."
                default: break
                }
            }
        }
        browser.start(queue: .main)
        deadline = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(10)) } catch { return }
            guard let self, self.generation == attempt else { return }
            self.stop()
            self.message =
                self.servers.isEmpty
                ? "No home servers found. Check the server and network, or enter an address manually."
                : "Choose your home server, or search again to refresh this list."
        }
    }

    public func stop() {
        generation = UUID()
        deadline?.cancel()
        deadline = nil
        browser?.cancel()
        browser = nil
        searching = false
    }

    func update(_ results: Set<NWBrowser.Result>) {
        let found = results.compactMap { result -> NearbyServer? in
            guard case .service(let name, let type, let domain, let interface) = result.endpoint,
                name.utf8.count <= 255, domain == "local.",
                type.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == "_grata-domum._tcp",
                case .bonjour(let record) = result.metadata,
                let scheme = NearbyServer.scheme(from: record)
            else { return nil }
            return NearbyServer(
                name: name, type: type, domain: domain,
                interfaceIndex: interface.map { UInt32($0.index) } ?? 0, scheme: scheme)
        }
        servers = Dictionary(found.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            .values.sorted { $0.id < $1.id }
    }
}

@MainActor
public protocol ServerResolving {
    func resolve(_ server: NearbyServer) async throws -> URL
}

/// DNS-SD resolves the SRV target without opening a TCP connection or losing the
/// hostname required by HTTPS. DNSServiceSetDispatchQueue delivers on the main queue.
@MainActor
public struct BonjourServerResolver: ServerResolving {
    public init() {}
    public func resolve(_ server: NearbyServer) async throws -> URL {
        let request = ServiceResolution()
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await request.resolve(server)
        } onCancel: {
            Task { @MainActor in request.finish(.failure(CancellationError())) }
        }
    }
}

@MainActor
private final class ServiceResolution {
    private var reference: DNSServiceRef?
    private var continuation: CheckedContinuation<URL, Error>?
    private var timeout: Task<Void, Never>?
    private var scheme = ""

    func resolve(_ server: NearbyServer) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            guard !Task.isCancelled else {
                continuation.resume(throwing: CancellationError())
                return
            }
            self.continuation = continuation
            scheme = server.scheme
            let error = DNSServiceResolve(
                &reference, 0, server.interfaceIndex, server.name, server.type, server.domain,
                { _, _, _, error, _, host, port, _, _, context in
                    guard let context else { return }
                    MainActor.assumeIsolated {
                        let request = Unmanaged<ServiceResolution>.fromOpaque(context)
                            .takeUnretainedValue()
                        guard error == kDNSServiceErr_NoError, let host,
                            let url = ServerAddress.origin(
                                host: String(cString: host), port: Int(UInt16(bigEndian: port)),
                                scheme: request.scheme)
                        else {
                            request.finish(.failure(ServerConnectionError.unreachable))
                            return
                        }
                        request.finish(.success(url))
                    }
                }, Unmanaged.passUnretained(self).toOpaque())
            guard error == kDNSServiceErr_NoError, let reference,
                DNSServiceSetDispatchQueue(reference, .main) == kDNSServiceErr_NoError
            else {
                finish(.failure(ServerConnectionError.unreachable))
                return
            }
            timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                self?.finish(.failure(ServerConnectionError.unreachable))
            }
        }
    }

    func finish(_ result: Result<URL, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        timeout?.cancel()
        timeout = nil
        if let reference { DNSServiceRefDeallocate(reference) }
        reference = nil
        continuation.resume(with: result)
    }
}

public enum ServerAddress {
    public static func manual(_ raw: String) -> URL? {
        guard let url = HouseText.normalizeServer(raw),
            let components = URLComponents(
                url: url, resolvingAgainstBaseURL: false),
            components.user == nil, components.password == nil,
            components.query == nil, components.fragment == nil,
            components.path.isEmpty || components.path == "/",
            let host = components.host, !host.isEmpty,
            components.port.map({ (1...65535).contains($0) }) ?? true
        else { return nil }
        return url
    }

    static func origin(host: String, port: Int, scheme: String) -> URL? {
        guard (1...65535).contains(port), scheme == "http" || scheme == "https",
            !host.isEmpty, host.utf8.count <= 255,
            !host.contains(where: { $0.isWhitespace || "/\\@?#".contains($0) })
        else { return nil }
        var components = URLComponents()
        components.scheme = scheme
        // Remove the absolute DNS root dot for URLSession certificate matching.
        components.host = host.hasSuffix(".") ? String(host.dropLast()) : host
        components.port = port
        guard let url = components.url else { return nil }
        return manual(url.absoluteString)
    }
}
