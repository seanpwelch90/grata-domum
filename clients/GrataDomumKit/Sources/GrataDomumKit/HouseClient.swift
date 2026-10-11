import Foundation

public struct HouseClient: Sendable {
    public var baseURL: URL
    public var token: String?
    public var session: URLSession

    public init(baseURL: URL, token: String?, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    public func pair(code: String, name: String, surface: Surface) async throws -> PairingResult {
        try await send(
            PairingResult.self, method: "POST", path: "/api/v1/pair",
            body: [
                "code": code,
                "name": name,
                "surface": surface.rawValue,
            ], authenticated: false)
    }

    public func snapshot() async throws -> Snapshot {
        try await send(
            Snapshot.self, method: "GET", path: "/api/v1/snapshot", body: nil, authenticated: true)
    }

    public func postNote(clientRequestId: String, authorName: String, body: String) async throws {
        let _: NoteAck = try await send(
            NoteAck.self, method: "POST", path: "/api/v1/notes",
            body: [
                "clientRequestId": clientRequestId,
                "authorName": authorName,
                "body": body,
            ], authenticated: true)
    }

    public func runAction(id: String, command: String, level: Int?) async throws {
        var payload: [String: Any] = ["command": command]
        if let level { payload["level"] = level }
        let _: ActionAck = try await send(
            ActionAck.self, method: "POST", path: "/api/v1/actions/\(id)", body: payload,
            authenticated: true)
    }

    public func imageData(_ path: String) async throws -> Data {
        guard let url = authenticatedMediaURL(path) else {
            throw HouseFailure(message: "That image address is not valid.", status: 0)
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(
            for: request, delegate: MediaOriginDelegate(origin: baseURL))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw HouseFailure(message: "That image is not there.", status: status)
        }
        return data
    }

    public func listen(onEvent: @Sendable () async -> Void) async throws {
        guard let url = absolute("/api/v1/live") else {
            throw HouseFailure(message: "The home server address is not valid.", status: 0)
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 60 * 60
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (bytes, response) = try await session.bytes(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            throw HouseFailure(
                message: status == 401
                    ? "This display is not paired." : "The live connection stopped.", status: status
            )
        }
        for try await line in bytes.lines where line.hasPrefix("data:") {
            await onEvent()
        }
    }

    private func send<T: Decodable>(
        _ type: T.Type, method: String, path: String, body: [String: Any]?, authenticated: Bool
    ) async throws -> T {
        guard let url = absolute(path) else {
            throw HouseFailure(message: "The home server address is not valid.", status: 0)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("1", forHTTPHeaderField: "Grata-API-Version")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated, let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw HouseFailure(message: "The home server did not respond.", status: 0)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(status) {
            throw HouseFailure(message: message(from: data, status: status), status: status)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw HouseFailure(
                message: "The home server sent something unexpected.", status: status)
        }
    }

    func authenticatedMediaURL(_ path: String) -> URL? {
        guard let url = absolute(path), url.scheme == baseURL.scheme,
            url.host == baseURL.host, url.port == baseURL.port,
            url.user == nil, url.password == nil
        else { return nil }
        return url
    }

    private func absolute(_ path: String) -> URL? {
        if path.hasPrefix("http://") || path.hasPrefix("https://") { return URL(string: path) }
        let root =
            baseURL.absoluteString.hasSuffix("/")
            ? String(baseURL.absoluteString.dropLast()) : baseURL.absoluteString
        return URL(string: root + (path.hasPrefix("/") ? path : "/" + path))
    }

    private func message(from data: Data, status: Int) -> String {
        struct Envelope: Decodable { var error: Payload }
        struct Payload: Decodable { var message: String }
        if let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
            !envelope.error.message.isEmpty
        {
            return envelope.error.message
        }
        if status == 401 { return "This display is not paired." }
        return "Something went wrong."
    }
}

private struct NoteAck: Decodable { var id: String? }
private struct ActionAck: Decodable { var id: String? }

/// Authenticated media must never follow a redirect to a different origin.
private final class MediaOriginDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let origin: URL
    init(origin: URL) { self.origin = origin }
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        guard let url = request.url, url.scheme == origin.scheme, url.host == origin.host,
            url.port == origin.port, url.user == nil, url.password == nil
        else {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }
}
