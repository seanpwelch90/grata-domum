import Foundation
import Observation

/// Candidate state stays local until the user explicitly pairs the display.
@MainActor @Observable
public final class ServerOnboarding {
    public var address = "" {
        didSet {
            if address != oldValue && !updatingResolvedAddress {
                cancelCheck()
                selected = nil
            }
        }
    }
    public let discovery = ServerDiscovery()
    public private(set) var checking = false
    public private(set) var health: ServerHealth?
    public private(set) var checkedURL: URL?
    public private(set) var message = ""
    private var selected: NearbyServer?
    private let probe: any ServerProbing
    private let resolver: any ServerResolving
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private var updatingResolvedAddress = false

    public init(
        probe: any ServerProbing = ServerProbe(),
        resolver: (any ServerResolving)? = nil
    ) {
        self.probe = probe
        self.resolver = resolver ?? BonjourServerResolver()
    }

    public var canPair: Bool { health?.setupRequired == false && checkedURL != nil && !checking }

    public func select(_ server: NearbyServer) {
        discovery.stop()
        cancelCheck()
        selected = server
        check()
    }

    public func check() {
        cancelCheck()
        discovery.stop()
        let attempt = generation
        let selected = selected
        let manualAddress = address
        checking = true
        message =
            selected == nil
            ? "Checking the connection…" : "Connecting to \(selected?.name ?? "home server")…"
        task = Task { [weak self, probe, resolver] in
            do {
                let url: URL
                if let selected {
                    url = try await resolver.resolve(selected)
                } else {
                    guard let manual = ServerAddress.manual(manualAddress) else {
                        throw ServerConnectionError.invalidAddress
                    }
                    url = manual
                }
                try Task.checkCancellation()
                let result = try await probe.check(url, allowLegacy: selected == nil)
                guard let self, self.generation == attempt, !Task.isCancelled else { return }
                // Address edits invalidate checks. Commit the resolved candidate before
                // publishing health; observers never see ready state for a different URL.
                self.updatingResolvedAddress = true
                self.address = url.absoluteString
                self.updatingResolvedAddress = false
                self.selected = selected
                self.health = result
                self.checkedURL = url
                self.checking = false
                self.message =
                    result.setupRequired
                    ? "Finish setting up this server in a browser, then check again."
                    : result.legacy
                        ? "Older home server found. Ready to pair using a code."
                        : "Ready to pair. Enter the code from Displays on your home server."
            } catch {
                guard let self, self.generation == attempt, !Task.isCancelled else { return }
                self.checking = false
                self.message = error.localizedDescription
            }
        }
    }

    public func stop() {
        discovery.stop()
        cancelCheck()
    }

    private func cancelCheck() {
        generation = UUID()
        task?.cancel()
        task = nil
        health = nil
        checkedURL = nil
        checking = false
        message = ""
    }
}
