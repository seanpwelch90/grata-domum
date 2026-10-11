import Foundation
import Network
import XCTest

@testable import GrataDomumKit

private actor ControlledProbe: ServerProbing {
    var requests: [(URL, Bool)] = []
    var pending: [CheckedContinuation<ServerHealth, Error>] = []

    func check(_ origin: URL, allowLegacy: Bool) async throws -> ServerHealth {
        requests.append((origin, allowLegacy))
        return try await withCheckedThrowingContinuation { pending.append($0) }
    }

    func complete(_ result: Result<ServerHealth, Error>, index: Int = 0) {
        pending[index].resume(with: result)
    }
}

@MainActor
private struct FixedResolver: ServerResolving {
    let origin: URL
    func resolve(_ server: NearbyServer) async throws -> URL { origin }
}

private final class HealthProtocol: URLProtocol {
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
final class ServerOnboardingTests: XCTestCase {
    private let valid = Data(
        """
        {"apiVersion":1,"status":"ok","setupRequired":false,"product":"grata-domum",
        "serverId":"12345678-1234-4234-8234-123456789012"}
        """.utf8)

    private func ready() throws -> ServerHealth {
        try ServerHealth.validate(valid, allowLegacy: false)
    }

    private func waitUntil(_ predicate: () async -> Bool) async throws {
        for _ in 0..<100 {
            if await predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Timed out waiting for test operation")
    }

    func testOriginValidationAndTXTContract() throws {
        XCTAssertNotNil(ServerAddress.manual("home-server.local:8790"))
        XCTAssertNotNil(ServerAddress.manual("http://[::1]:8787"))
        XCTAssertEqual(
            ServerAddress.origin(host: "test.local.", port: 443, scheme: "https")?.host,
            "test.local")
        for address in [
            "", "ftp://home.local", "http://user:secret@home.local", "http://home.local/path",
            "http://home.local?token=secret", "http://home.local#fragment", "http://home.local:0",
            "http://home.local:99999",
        ] {
            XCTAssertNil(ServerAddress.manual(address), address)
        }
        XCTAssertNil(ServerAddress.origin(host: "test.local/path", port: 80, scheme: "http"))
        XCTAssertEqual(
            NearbyServer.scheme(from: NWTXTRecord(["api": "1", "scheme": "https", "path": "/"])),
            "https")
        for record in [
            [:], ["api": "invalid", "scheme": "http", "path": "/"],
            ["api": "1", "scheme": "ftp", "path": "/"],
            ["api": "1", "scheme": "https", "path": "/admin"],
        ] {
            XCTAssertNil(NearbyServer.scheme(from: NWTXTRecord(record)))
        }
        // A future API advertisement remains selectable so HTTP can explain
        // the version mismatch instead of presenting an empty network list.
        XCTAssertEqual(
            NearbyServer.scheme(from: NWTXTRecord(["api": "2", "scheme": "http", "path": "/"])),
            "http")
        let a = NearbyServer(
            name: "Same label", type: "_grata-domum._tcp", domain: "local.", interfaceIndex: 1,
            scheme: "http")
        let b = NearbyServer(
            name: a.name, type: a.type, domain: a.domain, interfaceIndex: 2, scheme: "http")
        XCTAssertNotEqual(a.id, b.id)
    }

    func testHealthCompatibilityAndStrictJSON() throws {
        XCTAssertFalse(try ready().setupRequired)
        let legacy = Data("{\"apiVersion\":1,\"status\":\"ok\",\"setupRequired\":false}".utf8)
        XCTAssertTrue(try ServerHealth.validate(legacy, allowLegacy: true).legacy)
        XCTAssertThrowsError(try ServerHealth.validate(legacy, allowLegacy: false))
        for data in [
            Data(), Data("{}".utf8), Data(repeating: 32, count: 16_385),
            Data(
                String(decoding: valid, as: UTF8.self).replacingOccurrences(
                    of: "grata-domum", with: "other-product"
                ).utf8),
            Data(
                String(decoding: valid, as: UTF8.self).replacingOccurrences(
                    of: "\"apiVersion\":1", with: "\"apiVersion\":2"
                ).utf8),
            Data(
                String(decoding: valid, as: UTF8.self).replacingOccurrences(
                    of: "12345678-1234-4234-8234-123456789012", with: "not-an-id"
                ).utf8),
        ] {
            XCTAssertThrowsError(try ServerHealth.validate(data, allowLegacy: true))
        }
    }

    func testHealthRequestIsTokenCookieAndCredentialFreeAndSizeBounded() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [HealthProtocol.self]
        config.httpAdditionalHeaders = [
            "Authorization": "must-not-send", "Cookie": "must-not-send",
        ]
        let expected = valid
        HealthProtocol.reply = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/health")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
            return (200, expected)
        }
        let probe = ServerProbe(configuration: config)
        let url = try XCTUnwrap(URL(string: "http://test.invalid:8787"))
        let health = try await probe.check(url, allowLegacy: false)
        XCTAssertEqual(health.product, "grata-domum")
        HealthProtocol.reply = { _ in (200, Data(repeating: 32, count: 16_385)) }
        do {
            _ = try await probe.check(url, allowLegacy: true)
            XCTFail("Oversized response accepted")
        } catch { XCTAssertEqual(error as? ServerConnectionError, .unexpected) }
        HealthProtocol.reply = { _ in (302, Data()) }
        do {
            _ = try await probe.check(url, allowLegacy: true)
            XCTFail("Redirect accepted")
        } catch { XCTAssertEqual(error as? ServerConnectionError, .unexpected) }
    }

    func testAddressChangeAndDismissRejectLateChecks() async throws {
        let probe = ControlledProbe()
        let model = ServerOnboarding(probe: probe)
        model.address = "http://first.invalid:8787"
        model.check()
        try await waitUntil { await probe.requests.count == 1 }
        model.address = "http://second.invalid:8787"
        await probe.complete(.success(try ready()))
        await Task.yield()
        XCTAssertFalse(model.canPair)
        XCTAssertNil(model.checkedURL)
        model.check()
        try await waitUntil { await probe.requests.count == 2 }
        model.stop()
        await probe.complete(.success(try ready()), index: 1)
        await Task.yield()
        XCTAssertFalse(model.canPair)
        XCTAssertNil(model.health)
    }

    func testSelectedServiceRequiresProductAndPublishesOnlyResolvedOrigin() async throws {
        let probe = ControlledProbe()
        let origin = try XCTUnwrap(URL(string: "https://chosen.local:443"))
        let model = ServerOnboarding(probe: probe, resolver: FixedResolver(origin: origin))
        model.address = "http://previous.invalid"
        model.select(
            NearbyServer(
                name: "Home server", type: "_grata-domum._tcp", domain: "local.", interfaceIndex: 0,
                scheme: "https"))
        try await waitUntil { await probe.requests.count == 1 }
        let requests = await probe.requests
        XCTAssertEqual(requests[0].0, origin)
        XCTAssertFalse(requests[0].1)
        await probe.complete(.success(try ready()))
        try await waitUntil { model.canPair }
        XCTAssertEqual(model.checkedURL, origin)
        XCTAssertEqual(model.address, origin.absoluteString)
        model.address = "http://changed.invalid"
        XCTAssertFalse(model.canPair)
    }

    func testSetupRequiredAndFailuresNeverEnablePairing() async throws {
        let probe = ControlledProbe()
        let model = ServerOnboarding(probe: probe)
        model.address = "test.invalid:8787"
        model.check()
        try await waitUntil { await probe.requests.count == 1 }
        let setup = ServerHealth(
            apiVersion: 1, status: "ok", setupRequired: true, product: "grata-domum",
            serverId: UUID().uuidString)
        await probe.complete(.success(setup))
        try await waitUntil { !model.checking }
        XCTAssertFalse(model.canPair)
        XCTAssertTrue(model.message.contains("Finish setting up"))
        model.check()
        try await waitUntil { await probe.requests.count == 2 }
        await probe.complete(.failure(ServerConnectionError.incompatible), index: 1)
        try await waitUntil { !model.checking }
        XCTAssertFalse(model.canPair)
        XCTAssertTrue(model.message.contains("Update"))
    }

    func testPairingKeepsAuthorizationWhenFirstSnapshotFails() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite = "grata.onboarding.tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [HealthProtocol.self]
        let transport = URLSession(configuration: config)
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: root)
            transport.invalidateAndCancel()
        }
        var savedToken: String?
        let session = HouseSession(
            surface: .ipad, directory: root, defaults: defaults, token: nil, transport: transport
        ) {
            savedToken = $0
        }
        session.serverAddress = "http://fictional.invalid:8787"
        var redemptionCount = 0
        HealthProtocol.reply = { request in
            if request.url?.path == "/api/v1/pair" {
                redemptionCount += 1
                return (
                    200,
                    Data(
                        "{\"deviceId\":\"test-device\",\"deviceToken\":\"fictional-token\",\"surface\":\"ipad\",\"apiVersion\":1}"
                            .utf8)
                )
            }
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "Authorization"), "Bearer fictional-token")
            return (503, Data())
        }
        await session.pair(code: "TEST12", name: "Test iPad")
        XCTAssertEqual(savedToken, "fictional-token")
        XCTAssertEqual(session.phase, .loading)
        XCTAssertNil(session.snapshot)
        await session.refresh()
        XCTAssertEqual(redemptionCount, 1)
        XCTAssertEqual(savedToken, "fictional-token")
        session.forget()
    }

    #if os(macOS)
        func testLauncherDiscoveryAndRealHealth() async throws {
            guard let label = ProcessInfo.processInfo.environment["GRATA_TEST_SERVER_LABEL"] else {
                throw XCTSkip(
                    "Requires an isolated running discovery launcher; see onboarding evidence.")
            }
            let discovery = ServerDiscovery()
            discovery.search()
            defer { discovery.stop() }
            for _ in 0..<300 {
                if discovery.servers.contains(where: { $0.name == label }) { break }
                try await Task.sleep(for: .milliseconds(20))
            }
            let server = try XCTUnwrap(
                discovery.servers.first { $0.name == label }, discovery.message)
            let origin = try await BonjourServerResolver().resolve(server)
            XCTAssertEqual(origin.port, 18790)
            let health = try await ServerProbe().check(origin, allowLegacy: false)
            XCTAssertEqual(health.product, "grata-domum")
            XCTAssertNotNil(health.serverId.flatMap(UUID.init(uuidString:)))
            XCTAssertFalse(health.legacy)
        }

        func testSystemBonjourDiscoveryResolutionAndRemoval() async throws {
            guard ProcessInfo.processInfo.environment["GRATA_RUN_BONJOUR_TESTS"] == "1" else {
                throw XCTSkip(
                    "Opt-in LAN integration: GRATA_RUN_BONJOUR_TESTS=1 swift test --filter testSystemBonjour"
                )
            }
            let label = "Grata test \(UUID().uuidString)"
            let advertiser = Process()
            advertiser.executableURL = URL(fileURLWithPath: "/usr/bin/dns-sd")
            advertiser.arguments = [
                "-R", label, "_grata-domum._tcp", "local.", "18789", "api=1", "scheme=http",
                "path=/",
            ]
            advertiser.standardOutput = FileHandle.nullDevice
            advertiser.standardError = FileHandle.nullDevice
            try advertiser.run()
            defer { if advertiser.isRunning { advertiser.terminate() } }
            let discovery = ServerDiscovery()
            discovery.search()
            defer { discovery.stop() }
            for _ in 0..<300 {
                if discovery.servers.contains(where: { $0.name == label }) { break }
                try await Task.sleep(for: .milliseconds(20))
            }
            let server = try XCTUnwrap(
                discovery.servers.first { $0.name == label }, discovery.message)
            let origin = try await BonjourServerResolver().resolve(server)
            XCTAssertEqual(origin.port, 18789)
            XCTAssertEqual(origin.scheme, "http")
            XCTAssertTrue(
                origin.host?.hasSuffix(".local.") == true
                    || origin.host?.hasSuffix(".local") == true)
            advertiser.terminate()
            for _ in 0..<100 {
                if !discovery.servers.contains(where: { $0.name == label }) { break }
                try await Task.sleep(for: .milliseconds(20))
            }
            XCTAssertFalse(discovery.servers.contains(where: { $0.name == label }))
        }
    #endif
}
