import GrataDomumKit
import SwiftUI

struct HouseTabs: View {
    let snapshot: Snapshot
    @Environment(HouseSession.self) private var session
    @SceneStorage("grata.tab") private var tab = "home"
    @State private var pinID = ""
    @State private var eventID = ""

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                HomeScreen(
                    snapshot: snapshot,
                    showItinerary: { id in
                        eventID = id
                        tab = "itinerary"
                    }, showGuide: { tab = "guide" })
            }
            .tabItem { Label("Home", systemImage: "house") }
            .tag("home")

            NavigationStack {
                ItineraryScreen(snapshot: snapshot, selectedEventID: eventID)
            }
            .tabItem { Label("Itinerary", systemImage: "calendar") }
            .tag("itinerary")

            NavigationStack {
                MapScreen(snapshot: snapshot, pinID: $pinID)
            }
            .tabItem { Label("House Map", systemImage: "map") }
            .tag("map")

            NavigationStack {
                GuideScreen(snapshot: snapshot) { id in
                    pinID = id
                    tab = "map"
                }
            }
            .tabItem { Label("Need Something?", systemImage: "questionmark.circle") }
            .tag("guide")
        }
        .tint(DashboardPalette(theme: snapshot.theme).accent)
        .environment(session)
        .onAppear {
            #if DEBUG
                if HousePreview.isActive,
                    let initialTab = ProcessInfo.processInfo.environment["GRATA_PREVIEW_TAB"],
                    ["home", "itinerary", "map", "guide"].contains(initialTab)
                {
                    tab = initialTab
                }
            #endif
        }
    }
}
