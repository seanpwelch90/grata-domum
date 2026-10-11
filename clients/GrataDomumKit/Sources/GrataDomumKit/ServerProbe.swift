import Foundation

public enum ServerConnectionError: Error, LocalizedError, Equatable {
    case invalidAddress, unreachable, unexpected, incompatible, wrongProduct

    public var errorDescription: String? {
        switch self {
        case .invalidAddress:
            "Enter a server address, like http://home-server.local:8787. Use an address without a path, password or query."
        case .unreachable:
            "Couldn’t reach the home server. Check the address, server and network, then try again."
        case .unexpected: "The server sent an unexpected response. Check the address and try again."
        case .incompatible: "Update this app or the home server to connect."
        case .wrongProduct: "This address isn’t a compatible Grata Domum server."
        }
    }
}

public struct ServerHealth: Decodable, Equatable, Sendable {
    public let apiVersion: Int
    public let status: String
    public let setupRequired: Bool
    public let product: String?
    public let serverId: String?
    public var legacy: Bool { product == nil && serverId == nil }

    static func validate(_ data: Data, allowLegacy: Bool) throws -> ServerHealth {
        guard data.count <= 16_384,
            let health = try? JSONDecoder().decode(ServerHealth.self, from: data),
            health.status == "ok"
        else { throw ServerConnectionError.unexpected }
        guard health.apiVersion == 1 else { throw ServerConnectionError.incompatible }
        if health.legacy && allowLegacy { return health }
        guard health.product == "grata-domum", let serverId = health.serverId,
            UUID(uuidString: serverId) != nil
        else { throw ServerConnectionError.wrongProduct }
        return health
    }
}

public protocol ServerProbing: Sendable {
    func check(_ origin: URL, allowLegacy: Bool) async throws -> ServerHealth
}

public struct ServerProbe: ServerProbing {
    private let configuration: URLSessionConfiguration

    public init(configuration: URLSessionConfiguration = .ephemeral) {
        self.configuration = configuration
    }

    public func check(_ origin: URL, allowLegacy: Bool) async throws -> ServerHealth {
        guard ServerAddress.manual(origin.absoluteString) != nil else {
            throw ServerConnectionError.invalidAddress
        }
        let config = configuration.copy() as? URLSessionConfiguration ?? .ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.httpAdditionalHeaders = nil
        config.timeoutIntervalForResource = 5
        let session = URLSession(
            configuration: config, delegate: ProbeDelegate(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: origin.appendingPathComponent("api/v1/health"))
        request.timeoutInterval = 5
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                response.expectedContentLength <= 16_384
            else { throw ServerConnectionError.unexpected }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < 16_384 else { throw ServerConnectionError.unexpected }
                data.append(byte)
            }
            return try ServerHealth.validate(data, allowLegacy: allowLegacy)
        } catch let error as ServerConnectionError {
            throw error
        } catch {
            try Task.checkCancellation()
            throw ServerConnectionError.unreachable
        }
    }
}

/// Health never follows redirects or responds to authentication challenges.
private final class ProbeDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
            completionHandler(.performDefaultHandling, nil)
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
