import GrataDomumKit
import SwiftUI

struct TVWelcome: View {
    let snapshot: Snapshot
    @Environment(HouseSession.self) private var session
    @State private var maintenance = false
    @State private var selectedTab = "welcome"
    private var palette: DashboardPalette { DashboardPalette(theme: snapshot.theme) }
    private var zone: TimeZone { HouseText.timeZone(snapshot.timeZone) }

    var body: some View {
        TabView(selection: $selectedTab) {
            welcome.tabItem { Label("Welcome", systemImage: "house") }.tag("welcome")
            HouseScreen(theme: snapshot.theme) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text("Time together").font(HouseFont.font(size: 48, design: .serif))
                        if remainingEvents.isEmpty {
                            Text("Nothing planned. Make yourself at home.")
                        }
                        ForEach(remainingEvents) { event in
                            eventEntry(event).focusable()
                        }
                    }.padding(60).frame(maxWidth: 1300)
                        .frame(maxWidth: .infinity)
                }
            }.tabItem { Label("Itinerary", systemImage: "calendar") }.tag("itinerary")
            HouseScreen(theme: snapshot.theme) {
                VStack(alignment: .leading, spacing: 28) {
                    Text("Display settings").font(HouseFont.font(size: 48, design: .serif))
                    Text("Manage this Apple TV’s connection to your house.")
                    Button("Connection and pairing") { maintenance = true }
                    Button("Back to welcome") { selectedTab = "welcome" }
                }.padding(60)
            }.tabItem { Label("Settings", systemImage: "gearshape") }.tag("settings")
        }
        .tint(palette.accent)
        .onAppear {
            #if DEBUG
                if HousePreview.isActive,
                    let tab = ProcessInfo.processInfo.environment["GRATA_PREVIEW_TAB"],
                    ["welcome", "itinerary", "settings"].contains(tab)
                {
                    selectedTab = tab
                }
            #endif
        }
        .sheet(isPresented: $maintenance) { DisplayMaintenance() }
    }
    private var welcome: some View {
        HouseScreen(theme: snapshot.theme) {
            GeometryReader { geometry in
                VStack(alignment: .leading, spacing: 26) {
                    HStack {
                        Text(snapshot.household.name).font(
                            HouseFont.font(size: 28, weight: .semibold, design: .rounded))
                        Spacer()
                        if !snapshot.device.roomName.isEmpty {
                            Text(snapshot.device.roomName).font(HouseFont.font(size: 24))
                                .foregroundStyle(
                                    palette.muted)
                        }
                    }
                    HStack(spacing: 24) {
                        hero.frame(maxWidth: .infinity, maxHeight: .infinity)
                        VStack(spacing: 24) {
                            HStack(spacing: 24) {
                                clockTile
                                if snapshot.weather != nil {
                                    DashboardWeather(
                                        weather: snapshot.weather, large: true,
                                        timeZone: snapshot.timeZone, theme: snapshot.theme)
                                }
                            }.frame(height: snapshot.weather?.stale == true ? 410 : 360)
                            HStack(alignment: .top, spacing: 24) {
                                if let wifi = snapshot.wifi {
                                    wifiTile(wifi).frame(maxWidth: .infinity, maxHeight: .infinity)
                                }
                                plans.frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }.frame(width: (geometry.size.width - 160) * 0.59)
                    }.frame(maxHeight: .infinity)
                    HStack {
                        if session.connection == .incompatible {
                            Text("Update this app to reconnect").font(HouseFont.font(size: 22))
                        } else if session.offline {
                            Text(
                                "Saved information · \(HouseText.shortStamp(snapshot.syncedAt, timeZone: zone))"
                            ).font(HouseFont.font(size: 22))
                        } else if snapshot.showNotesOnTV, let note = snapshot.notes.first {
                            Text("\(note.authorName): \(note.body)").font(HouseFont.font(size: 22))
                                .lineLimit(2)
                        }
                        Spacer()
                    }.frame(height: 46)
                }.padding(.horizontal, 68).padding(.vertical, 36)
                    .frame(width: geometry.size.width, height: geometry.size.height)
            }
        }
    }
    private var hero: some View {
        DashboardTile(fill: palette.hero, padding: 36, ink: palette.heroInk) {
            VStack(alignment: .leading, spacing: 22) {
                WelcomeHeading(guests: snapshot.visit?.guests ?? [], large: true)
                GuestAvatarGroup(
                    guests: snapshot.visit?.guests ?? [], theme: snapshot.theme, size: 56)
                Text(
                    snapshot.visit?.message.isEmpty == false
                        ? snapshot.visit?.message ?? ""
                        : "We're so glad you're here. Settle in and stay a while."
                )
                .font(HouseFont.font(size: 27)).fixedSize(horizontal: false, vertical: true)
                WelcomeArtwork(snapshot: snapshot).frame(maxHeight: .infinity)
            }
        }
    }
    private var clockTile: some View {
        DashboardTile(fill: palette.comfort, padding: 28, ink: palette.surfaceInk) {
            VStack(alignment: .leading, spacing: 24) {
                HStack(alignment: .center, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(day).font(HouseFont.font(size: 32, design: .serif))
                        Text(date).font(HouseFont.font(size: 24)).foregroundStyle(
                            palette.surfaceMuted)
                    }.fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    clockFace.frame(width: 112, height: 112)
                }
                Spacer(minLength: 0)
                Rectangle().fill(palette.surfaceInk.opacity(0.16)).frame(height: 1)
                    .accessibilityHidden(true)
                Text(clock).font(HouseFont.font(size: 60, weight: .medium, design: .rounded))
                    .monospacedDigit().minimumScaleFactor(0.8).lineLimit(1)
                    .modifier(GentleNumericChange(value: clock))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(clock), \(day), \(date)")
        }
    }
    private var clockFace: some View {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.hour, .minute], from: session.now)
        let minute = Double(parts.minute ?? 0)
        let hour = Double((parts.hour ?? 0) % 12)
        return ZStack {
            Circle().fill(palette.surface)
                .shadow(color: palette.surfaceInk.opacity(0.07), radius: 5, y: 3)
            ForEach(0..<12) { tick in
                Capsule().fill(palette.surfaceMuted)
                    .frame(width: tick % 3 == 0 ? 3 : 2, height: tick % 3 == 0 ? 9 : 4)
                    .offset(y: -44)
                    .rotationEffect(.degrees(Double(tick) * 30))
            }
            Capsule().fill(palette.surfaceInk).frame(width: 5, height: 28)
                .offset(y: -11).rotationEffect(.degrees(hour * 30 + minute * 0.5))
            Capsule().fill(palette.surfaceInk).frame(width: 3, height: 39)
                .offset(y: -16).rotationEffect(.degrees(minute * 6))
            Circle().fill(palette.surfaceInk).frame(width: 9, height: 9)
        }
        .accessibilityHidden(true)
    }
    private func wifiTile(_ wifi: WiFiInfo) -> some View {
        DashboardTile(fill: palette.surface, padding: 24, ink: palette.surfaceInk) {
            VStack(alignment: .leading, spacing: 18) {
                Label("Wi-Fi", systemImage: "wifi")
                    .font(HouseFont.font(size: 32, weight: .semibold, design: .rounded))
                Text(wifi.ssid).font(HouseFont.font(size: 24)).fixedSize(
                    horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if let code = QRImage.make(wifi.qrPayload) {
                    Image(decorative: code, scale: 1).resizable().interpolation(.none)
                        .frame(width: 220, height: 220).padding(20).background(.white)
                        .frame(maxWidth: .infinity)
                        .accessibilityLabel("Wi-Fi QR code for \(wifi.ssid)")
                }
                Text("Scan to join Wi-Fi").font(HouseFont.font(size: 24))
                    .foregroundStyle(palette.surfaceMuted)
                Spacer(minLength: 0)
            }
        }
    }
    private var plans: some View {
        DashboardTile(fill: palette.peach, padding: 24, ink: palette.surfaceInk) {
            VStack(alignment: .leading, spacing: 18) {
                Label("Time together", systemImage: "calendar")
                    .font(HouseFont.font(size: 30, weight: .semibold, design: .rounded))
                if remainingEvents.isEmpty {
                    Image(systemName: "cup.and.saucer").font(HouseFont.font(size: 48))
                        .foregroundStyle(palette.accent).accessibilityHidden(true)
                    Text("Nothing planned.").font(HouseFont.font(size: 28, weight: .semibold))
                    Text("Make yourself at home.").font(HouseFont.font(size: 24))
                }
                ForEach(Array(remainingEvents.prefix(2))) {
                    event in
                    eventEntry(event, compact: true)
                }
                Spacer(minLength: 0)
                Text("More in the Itinerary tab").font(HouseFont.font(size: 22))
                    .foregroundStyle(palette.surfaceMuted)
            }
        }
    }
    private func eventEntry(_ event: VisitEvent, compact: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(event.title).font(
                HouseFont.font(size: compact ? 25 : 32, weight: .semibold, design: .rounded)
            )
            .lineLimit(compact ? 2 : nil)
            Text(eventDay(event) + " · " + HouseText.eventWhen(event, timeZone: zone))
                .font(HouseFont.font(size: compact ? 22 : 26, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
            if !event.location.isEmpty {
                Label(event.location, systemImage: "mappin.circle.fill")
                    .font(HouseFont.font(size: compact ? 22 : 26)).lineLimit(compact ? 1 : nil)
                    .foregroundStyle(palette.surfaceMuted)
            }
            if !compact && !event.notes.isEmpty { Text(event.notes).font(HouseFont.font(size: 26)) }
        }
        .padding(compact ? 16 : 28).frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(palette.surfaceInk)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 20))
    }
    private func eventDay(_ event: VisitEvent) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        var date = formatter.date(from: event.eventDate)
        if !event.allDay, let raw = event.startsAt {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            date = iso.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) ?? date
        }
        formatter.setLocalizedDateFormatFromTemplate("MMMd")
        return date.map { formatter.string(from: $0) } ?? event.eventDate
    }
    private var remainingEvents: [VisitEvent] {
        let groups = HouseText.groupedEvents(snapshot.events, timeZone: zone, now: session.now)
        return (groups.today + groups.upcoming).filter { event in
            if event.allDay { return true }
            guard let raw = event.endsAt ?? event.startsAt else { return true }
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return
                (formatter.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) ?? session.now)
                >= session.now
        }
    }
    private func formatted(_ template: String) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = zone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: session.now)
    }
    private var clock: String { formatted("jm") }
    private var day: String { formatted("EEEE") }
    private var date: String { formatted("MMMMd") }
}
