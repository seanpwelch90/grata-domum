import GrataDomumKit
import SwiftUI

struct HomeScreen: View {
    let snapshot: Snapshot
    var showItinerary: (String) -> Void
    var showGuide: () -> Void
    @Environment(HouseSession.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var maintenance = false
    @State private var wifiExpanded = false
    @State private var guestsExpanded = false
    private var palette: DashboardPalette { DashboardPalette(theme: snapshot.theme) }
    private var zone: TimeZone { HouseText.timeZone(snapshot.timeZone) }

    var body: some View {
        HouseScreen(theme: snapshot.theme) {
            GeometryReader { geometry in
                let width = geometry.size.width
                let compact = width < 740 || typeSize.isAccessibilitySize
                let wide = width >= 1000 && !compact
                let gap: CGFloat = compact ? 16 : wide ? 24 : 20
                let margin: CGFloat = compact ? 16 : wide ? 32 : 24
                ScrollView {
                    VStack(alignment: .leading, spacing: gap) {
                        if session.connection == .incompatible {
                            Text(
                                "Update this app to reconnect. Saved house information is still available."
                            ).font(HouseFont.subheadline)
                        } else if session.offline {
                            Text(
                                "Showing saved information · Updated \(HouseText.shortStamp(snapshot.syncedAt, timeZone: zone))"
                            ).font(HouseFont.subheadline)
                        }
                        if wide {
                            let left = (width - margin * 2 - gap) * 0.64
                            HStack(alignment: .top, spacing: gap) {
                                hero(wide: true).frame(width: snapshot.wifi == nil ? nil : left)
                                    .accessibilitySortPriority(6)
                                wifi.accessibilitySortPriority(4)
                            }
                            HStack(alignment: .top, spacing: gap) {
                                if hasControls {
                                    RoomControls(snapshot: snapshot, columns: 2).frame(width: left)
                                        .accessibilitySortPriority(5)
                                }
                                plans.accessibilitySortPriority(3)
                            }
                            HStack(alignment: .top, spacing: gap) {
                                houseNote.frame(width: left).accessibilitySortPriority(2)
                                weather.accessibilitySortPriority(1)
                            }
                        } else {
                            hero(wide: !compact)
                            if hasControls {
                                RoomControls(snapshot: snapshot, columns: compact ? 1 : 2)
                            }
                            LazyVGrid(
                                columns: Array(
                                    repeating: GridItem(.flexible(), alignment: .top),
                                    count: compact ? 1 : 2), spacing: gap
                            ) {
                                wifi
                                plans
                                houseNote
                                weather
                            }
                        }
                    }.padding(margin)
                }

            }
        }
        .navigationTitle(snapshot.household.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button {
                maintenance = true
            } label: {
                Label("Display settings", systemImage: "gearshape")
            }
        }
        .sheet(isPresented: $maintenance) { DisplayMaintenance() }
        .sheet(isPresented: $wifiExpanded) {
            if let wifi = snapshot.wifi {
                VStack(spacing: 24) {
                    WifiCard(wifi: wifi, codeSide: 280)
                    Button("Done") { wifiExpanded = false }
                }.padding(32)
            }
        }
        .sheet(isPresented: $guestsExpanded) {
            NavigationStack {
                List(snapshot.visit?.guests ?? []) { Text($0.displayName).font(HouseFont.title2) }
                    .navigationTitle("Everyone’s here").toolbar {
                        Button("Done") { guestsExpanded = false }
                    }
            }
        }
    }
    private var hasControls: Bool { !snapshot.device.roomId.isEmpty && !snapshot.actions.isEmpty }
    @ViewBuilder private var wifi: some View {
        if let wifi = snapshot.wifi {
            Button {
                wifiExpanded = true
            } label: {
                WifiWidget(wifi: wifi, theme: snapshot.theme)
            }.buttonStyle(.plain).accessibilityHint("Open a larger Wi-Fi code")
        }
    }
    private var weather: some View {
        DashboardWeather(
            weather: snapshot.weather, timeZone: snapshot.timeZone, theme: snapshot.theme)
    }
    private func hero(wide: Bool) -> some View {
        DashboardTile(fill: palette.hero, padding: 24, ink: palette.heroInk) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 18) {
                    WelcomeHeading(guests: snapshot.visit?.guests ?? [])
                    Text(
                        snapshot.visit?.message.isEmpty == false
                            ? snapshot.visit?.message ?? ""
                            : "We're so glad you're here. Settle in and stay a while."
                    )
                    .font(HouseFont.title3).fixedSize(horizontal: false, vertical: true)
                    if !(snapshot.visit?.guests.isEmpty ?? true) {
                        Button {
                            guestsExpanded = true
                        } label: {
                            GuestAvatarGroup(
                                guests: snapshot.visit?.guests ?? [], theme: snapshot.theme,
                                size: 44)
                        }.buttonStyle(.plain).accessibilityLabel("See everyone staying here")
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
                if wide { WelcomeArtwork(snapshot: snapshot).frame(width: 140, height: 185) }
            }
        }
    }
    private var plans: some View {
        DashboardTile(fill: palette.peach, ink: palette.surfaceInk) {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Label("Time together", systemImage: "calendar")
                        .font(HouseFont.font(.title2, design: .rounded, weight: .semibold))
                    Spacer(minLength: 8)
                }
                if upcomingEvents.isEmpty {
                    Text("Nothing planned. Make yourself at home.").font(HouseFont.body)
                }
                ForEach(Array(upcomingEvents.prefix(3))) { event in
                    Button {
                        showItinerary(event.id)
                    } label: {
                        HStack(alignment: .top, spacing: 14) {
                            CalendarBadge(
                                date: eventDate(event), timeZone: zone, tint: palette.accent
                            )
                            .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(event.title)
                                    .font(
                                        HouseFont.font(
                                            .headline, design: .rounded, weight: .semibold)
                                    )
                                Text(HouseText.longDate(eventDate(event), timeZone: zone))
                                    .font(HouseFont.caption)
                                Text(HouseText.eventWhen(event, timeZone: zone))
                                    .font(HouseFont.subheadline.weight(.medium))
                                if !event.location.isEmpty {
                                    Label(event.location, systemImage: "mappin")
                                        .font(HouseFont.subheadline)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right")
                                .font(HouseFont.caption.weight(.semibold)).accessibilityHidden(true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.surface, in: RoundedRectangle(cornerRadius: 18))
                    }.buttonStyle(DashboardPressStyle())
                }
                Button {
                    showItinerary("")
                } label: {
                    HStack {
                        Text("See the full itinerary")
                        Spacer()
                        Image(systemName: "arrow.right").accessibilityHidden(true)
                    }.font(HouseFont.headline).frame(minHeight: 44)
                }.buttonStyle(.plain)
            }
        }
    }
    private var houseNote: some View {
        Button(action: showGuide) {
            DashboardTile(fill: palette.surface, ink: palette.surfaceInk) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        DashboardIcon("questionmark.bubble", tint: palette.accent)
                        Spacer()
                        Image(systemName: "arrow.up.right").font(HouseFont.title3)
                            .accessibilityHidden(true)
                    }
                    Text("Need a hand?").font(
                        HouseFont.font(.title2, design: .rounded, weight: .semibold))
                    Text("Find the little things that make a stay feel like home.").font(
                        HouseFont.body
                    )
                    .foregroundStyle(palette.surfaceMuted)
                }
            }
        }.buttonStyle(DashboardPressStyle())
    }
    private func eventDate(_ event: VisitEvent) -> Date {
        if event.allDay {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = zone
            return formatter.date(from: event.eventDate) ?? session.now
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return event.startsAt.flatMap {
            formatter.date(from: $0) ?? ISO8601DateFormatter().date(from: $0)
        } ?? session.now
    }
    private var upcomingEvents: [VisitEvent] {
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
}

struct RoomControls: View {
    let snapshot: Snapshot
    let columns: Int
    @State private var showAll = false
    @Environment(\.dynamicTypeSize) private var typeSize
    private var palette: DashboardPalette { DashboardPalette(theme: snapshot.theme) }

    var body: some View {
        DashboardTile(
            fill: palette.comfort,
            ink: palette.surfaceInk
        ) {
            VStack(alignment: .leading, spacing: 18) {
                let headerLayout =
                    typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                    : AnyLayout(HStackLayout(alignment: .firstTextBaseline))
                headerLayout {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Room comfort")
                            .font(HouseFont.font(.title2, design: .rounded, weight: .bold))
                        Text(
                            snapshot.device.roomName.isEmpty
                                ? "Your room" : snapshot.device.roomName
                        )
                        .font(HouseFont.subheadline)
                    }
                    Spacer()
                    if HousePreview.isActive {
                        Text("Preview · controls disabled").font(HouseFont.caption)
                            .multilineTextAlignment(
                                .trailing)
                    }
                }
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.flexible(), alignment: .top), count: columns),
                    spacing: 12
                ) {
                    ForEach(showAll ? snapshot.actions : Array(snapshot.actions.prefix(4))) {
                        action in
                        RoomActionTile(
                            action: action, accent: palette.accent, surface: palette.surface)
                    }
                }
                if snapshot.actions.count > 4 {
                    Button(
                        showAll
                            ? "Show fewer controls"
                            : "All room controls (\(snapshot.actions.count))"
                    ) {
                        showAll.toggle()
                    }.font(HouseFont.headline).tint(palette.accent)
                }
            }
        }
    }
}

struct RoomActionTile: View {
    let action: RoomAction
    let accent: Color
    let surface: Color
    @State private var brightnessExpanded = false
    @Environment(HouseSession.self) private var session
    @State private var level: Double
    @State private var edited = false

    init(action: RoomAction, accent: Color, surface: Color) {
        self.surface = surface
        self.action = action
        self.accent = accent
        _level = State(initialValue: action.brightness ?? 50)
    }

    private var pending: Bool { session.actionState[action.id]?.pending == true }
    private var disabled: Bool {
        HousePreview.isActive || pending || session.offline || session.connection != .connected
            || action.availability != "ok"
    }
    private var symbol: String {
        switch action.kind {
        case "brightness": return "lightbulb"
        case "script": return "sparkles"
        default: return "power"
        }
    }
    private var status: String {
        if pending { return "Working…" }
        if action.availability != "ok" { return "Unavailable" }
        if !HousePreview.isActive && (session.offline || session.connection != .connected) {
            return "Connection needed"
        }
        if action.kind == "script" { return "Ready to run" }
        if action.power == "on" {
            if action.kind == "brightness", let brightness = action.brightness {
                return "On · \(Int(brightness))%"
            }
            return "On"
        }
        if action.power == "off" { return "Off" }
        return "State unknown"
    }
    private var commandTitle: String {
        if action.kind == "script" { return "Run" }
        if action.kind == "brightness" { return "Apply" }
        if action.power == "on" { return "Turn off" }
        if action.power == "off" { return "Turn on" }
        return "Toggle"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol).font(HouseFont.title2).foregroundStyle(accent)
                    .accessibilityHidden(
                        true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(action.label).font(HouseFont.font(.headline, design: .rounded))
                        .fixedSize(
                            horizontal: false, vertical: true)
                    Text(status).font(HouseFont.subheadline)
                }
                Spacer(minLength: 0)
                if pending { ProgressView().accessibilityLabel("Command in progress") }
            }
            if action.kind == "brightness" {
                DisclosureGroup("Brightness", isExpanded: $brightnessExpanded) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Set to \(Int(level))%").font(HouseFont.subheadline.monospacedDigit())
                        Slider(
                            value: Binding(
                                get: { level },
                                set: {
                                    level = $0
                                    edited = true
                                }), in: 1...100, step: 1
                        )
                        .tint(accent).disabled(disabled)
                        .accessibilityLabel("\(action.label) brightness")
                        .accessibilityHint("Choose a level, then select Apply")
                        commandButton
                    }.padding(.top, 12)
                }.tint(accent)
            } else {
                commandButton
            }
            if action.availability != "ok" {
                Text("Unavailable. Please ask your host.").font(HouseFont.footnote).fixedSize(
                    horizontal: false, vertical: true)
            }
            if let message = session.actionState[action.id]?.message, !message.isEmpty {
                Text(message).font(HouseFont.footnote).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(surface, in: RoundedRectangle(cornerRadius: 16))
        .onChange(of: action.brightness) { _, value in
            if !edited, let value { level = value }
        }
    }

    private var commandButton: some View {
        Button(commandTitle) { send() }
            .font(HouseFont.font(.subheadline, design: .rounded, weight: .semibold))
            .buttonStyle(.bordered).tint(accent).controlSize(.large)
            .disabled(disabled).accessibilityLabel("\(commandTitle) \(action.label)")
    }
    private func send() {
        guard !disabled else { return }
        Task {
            await session.runAction(
                action,
                command: action.kind == "brightness"
                    ? "brightness" : action.kind == "script" ? "run" : "toggle",
                level: action.kind == "brightness" ? Int(level) : nil)
            if session.actionState[action.id]?.message.isEmpty == true,
                !session.offline, session.connection == .connected
            {
                edited = false
                if let current = session.snapshot?.actions.first(where: { $0.id == action.id })?
                    .brightness
                {
                    level = current
                }
            }
        }
    }
}
