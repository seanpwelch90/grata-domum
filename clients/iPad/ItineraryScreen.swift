import GrataDomumKit
import SwiftUI

struct ItineraryScreen: View {
    let snapshot: Snapshot
    var selectedEventID = ""
    @Environment(HouseSession.self) private var session
    @State private var earlierExpanded = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.horizontalSizeClass) private var widthClass

    var body: some View {
        let groups = HouseText.groupedEvents(snapshot.events, timeZone: zone, now: session.now)
        HouseScreen(theme: snapshot.theme) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Time together")
                                .font(
                                    HouseFont.font(.largeTitle, design: .serif, weight: .regular))
                            Text("A little plan. Plenty of room to relax.")
                                .font(HouseFont.title3)
                                .foregroundStyle(DashboardPalette(theme: snapshot.theme).muted)
                        }
                        eventSection("Today", events: groups.today)
                        ForEach(Array(Set(groups.upcoming.map(day))).sorted(), id: \.self) { date in
                            eventSection(
                                dateLabel(date), events: groups.upcoming.filter { day($0) == date })
                        }
                        if !groups.earlier.isEmpty {
                            DisclosureGroup("Earlier", isExpanded: $earlierExpanded) {
                                eventList(groups.earlier)
                                    .padding(.top, 16)
                            }.font(HouseFont.headline)
                        }
                    }
                    .padding(28)
                    .frame(maxWidth: 1040, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .onAppear {
                    if !selectedEventID.isEmpty {
                        proxy.scrollTo(selectedEventID, anchor: .center)
                    }
                }
                .onChange(of: selectedEventID) { _, id in proxy.scrollTo(id, anchor: .center) }
            }
        }.navigationTitle("Itinerary")
            .navigationBarTitleDisplayMode(.inline)
    }
    private var zone: TimeZone { HouseText.timeZone(snapshot.timeZone) }
    private func day(_ event: VisitEvent) -> String {
        if event.allDay { return event.eventDate }
        return event.startsAt.flatMap { raw in
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
        }.map { HouseText.localDate($0, timeZone: zone) } ?? event.eventDate
    }
    private func dateLabel(_ date: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = zone
        return formatter.date(from: date).map { HouseText.longDate($0, timeZone: zone) } ?? date
    }
    private func eventSection(_ title: String, events: [VisitEvent]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "calendar")
                    .font(HouseFont.title3)
                    .foregroundStyle(DashboardPalette(theme: snapshot.theme).accent)
                    .accessibilityHidden(true)
                Text(title).font(
                    HouseFont.font(.title2, design: .rounded, weight: .semibold))
                Rectangle().fill(DashboardPalette(theme: snapshot.theme).accent.opacity(0.15))
                    .frame(height: 1).accessibilityHidden(true)
            }
            if events.isEmpty {
                HStack(spacing: 20) {
                    Image(systemName: "cup.and.saucer.fill")
                        .font(HouseFont.font(size: 38))
                        .foregroundStyle(DashboardPalette(theme: snapshot.theme).accent)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("A little breathing room").font(HouseFont.title3.bold())
                        Text("Nothing on the calendar today. Make yourself at home.")
                    }
                    Spacer(minLength: 0)
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .foregroundStyle(DashboardPalette(theme: snapshot.theme).surfaceInk)
                .background(
                    DashboardPalette(theme: snapshot.theme).surface,
                    in: RoundedRectangle(cornerRadius: 24))
            } else {
                eventList(events)
            }
        }
    }
    private func eventList(_ events: [VisitEvent]) -> some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(events) { event in eventRow(event) }
        }
    }
    private func eventRow(_ event: VisitEvent) -> some View {
        let stacked = typeSize.isAccessibilitySize || widthClass == .compact
        return Group {
            if stacked {
                VStack(alignment: .leading, spacing: 14) {
                    eventTime(event)
                    eventDetails(event)
                }
            } else {
                HStack(alignment: .top, spacing: 28) {
                    eventTime(event).frame(width: 190, alignment: .leading)
                    eventDetails(event).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .foregroundStyle(DashboardPalette(theme: snapshot.theme).surfaceInk)
        .background(
            DashboardPalette(theme: snapshot.theme).surface, in: RoundedRectangle(cornerRadius: 20)
        )
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(.white.opacity(0.4), lineWidth: 1))
        .shadow(color: .black.opacity(0.04), radius: 10, x: 0, y: 5)
        .id(event.id)
    }
    private func eventTime(_ event: VisitEvent) -> some View {
        Label(
            HouseText.eventWhen(event, timeZone: zone),
            systemImage: event.allDay ? "sun.max" : "clock"
        )
        .font(HouseFont.font(.subheadline, design: .rounded, weight: .semibold))
        .foregroundStyle(DashboardPalette(theme: snapshot.theme).surfaceInk)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            DashboardPalette(theme: snapshot.theme).peach,
            in: RoundedRectangle(cornerRadius: 14))
    }
    private func eventDetails(_ event: VisitEvent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(event.title).font(
                HouseFont.font(.title2, design: .rounded, weight: .semibold))
            if !event.location.isEmpty {
                Label(event.location, systemImage: "mappin.circle.fill")
                    .font(HouseFont.subheadline.weight(.medium))
                    .foregroundStyle(DashboardPalette(theme: snapshot.theme).surfaceMuted)
            }
            if !event.notes.isEmpty {
                Text(event.notes).fixedSize(horizontal: false, vertical: true)
            }
            if let url = URL(string: event.link),
                ["https", "http"].contains(url.scheme?.lowercased() ?? "")
            {
                Link("Details", destination: url).buttonStyle(.bordered)
            }
        }
    }

}
