import SwiftUI

/// Native guest enrollment only; all host management stays on the server.
public struct ServerOnboardingView: View {
    @Environment(HouseSession.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var onboarding = ServerOnboarding()
    @State private var code = ""
    @State private var name = ""
    @State private var pending = false
    @State private var initialized = false
    private let displayName: String

    public init(displayName: String) { self.displayName = displayName }

    public var body: some View {
        @Bindable var onboarding = onboarding
        NavigationStack {
            Form {
                Section("Find your home server") {
                    Text("Allow local network access so we can find your home server.")
                    Button(onboarding.discovery.searching ? "Searching…" : "Find nearby servers") {
                        onboarding.stop()
                        onboarding.discovery.search()
                    }
                    .disabled(pending || onboarding.discovery.searching)
                    if !onboarding.discovery.message.isEmpty {
                        Text(onboarding.discovery.message)
                    }
                    ForEach(onboarding.discovery.servers) { server in
                        Button {
                            onboarding.select(server)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(server.name)
                                Text(server.location).font(.caption)
                            }
                        }
                        .disabled(pending)
                    }
                }
                Section("Enter address manually") {
                    addressField
                    Button(onboarding.checking ? "Checking…" : "Check connection") {
                        onboarding.check()
                    }
                    .disabled(pending || onboarding.checking || onboarding.address.isEmpty)
                    if !onboarding.message.isEmpty {
                        Text(onboarding.message)
                            .accessibilityLabel(onboarding.message)
                    }
                }
                Section("This \(displayName)") {
                    TextField("Display name", text: $name)
                    codeField
                    Text(
                        "Open Displays on your home server to get a pairing code. After pairing, choose this display’s room there."
                    )
                    if !session.pairError.isEmpty {
                        Text(session.pairError).foregroundStyle(.red)
                    }
                    Button(pending ? "Pairing…" : "Pair this \(displayName)") {
                        guard let url = onboarding.checkedURL, onboarding.canPair else { return }
                        pending = true
                        session.serverAddress = url.absoluteString
                        Task {
                            await session.pair(code: code, name: name)
                            pending = false
                        }
                    }
                    .disabled(
                        pending || !onboarding.canPair
                            || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("Connect to your home")
            .disabled(pending)
        }
        .onAppear {
            guard !initialized else { return }
            initialized = true
            onboarding.address = session.serverAddress
            name = displayName
        }
        .onDisappear { onboarding.stop() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { onboarding.stop() }
        }
    }

    private var addressField: some View {
        @Bindable var onboarding = onboarding
        return TextField("http://home-server.local:8787", text: $onboarding.address)
            #if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            #endif
    }

    private var codeField: some View {
        TextField("Pairing code", text: $code)
            #if os(iOS)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
            #endif
    }
}
