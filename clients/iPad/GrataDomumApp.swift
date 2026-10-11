import GrataDomumKit
import SwiftUI

@main
struct GrataDomumApp: App {
    @State private var session = HouseSession(surface: .ipad)

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
    }
}

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(HouseSession.self) private var session

    var body: some View {
        Group {
            #if DEBUG
                if let preview = HousePreview.snapshot {
                    HouseTabs(snapshot: preview)
                } else {
                    liveContent
                }
            #else
                liveContent
            #endif
        }
    }
    private var liveContent: some View {
        Group {
            if session.phase == .unpaired || (session.snapshot == nil && session.phase != .loading)
            {
                ServerOnboardingView(displayName: "iPad")
            } else if let snapshot = session.snapshot {
                HouseTabs(snapshot: snapshot)
            } else {
                VStack(spacing: 24) {
                    if session.pairError.isEmpty {
                        ProgressView("Opening the house…")
                    } else {
                        Text("Let’s get you connected").font(.largeTitle.bold())
                        Text(session.pairError)
                        Button("Try again") { Task { await session.refresh() } }
                    }
                }.padding(32)
            }
        }
        .task { await session.run() }
        .onChange(of: scenePhase) { _, phase in session.setActive(phase == .active) }
    }
}
