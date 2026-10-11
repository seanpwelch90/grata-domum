import Foundation

public enum HouseText {
    public static func timeZone(_ identifier: String) -> TimeZone {
        TimeZone(identifier: identifier) ?? .current
    }

    public static func localDate(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_CA")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    public static func hello(_ date: Date, timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let hour = calendar.component(.hour, from: date)
        if hour < 12 { return "Good morning" }
        if hour < 17 { return "Good afternoon" }
        return "Good evening"
    }

    public static func joinNames(_ names: [String]) -> String {
        let clean = names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter {
            !$0.isEmpty
        }
        if clean.isEmpty { return "" }
        if clean.count == 1 { return clean[0] }
        if clean.count == 2 { return "\(clean[0]) and \(clean[1])" }
        if clean.count > 5 {
            return "\(clean.prefix(3).joined(separator: ", ")), and \(clean.count - 3) more"
        }
        return "\(clean.dropLast().joined(separator: ", ")), and \(clean[clean.count - 1])"
    }

    public static func longDate(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        return formatter.string(from: date)
    }

    public static func shortStamp(_ iso: String, timeZone: TimeZone) -> String {
        guard let date = parse(iso) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("MMMdjm")
        return formatter.string(from: date)
    }

    public static func eventWhen(_ event: VisitEvent, timeZone: TimeZone) -> String {
        if event.allDay { return "All day" }
        guard let startsAt = event.startsAt else { return "" }
        let start = clock(startsAt, timeZone: timeZone)
        guard let endsAt = event.endsAt else { return start }
        return "\(start)–\(clock(endsAt, timeZone: timeZone))"
    }

    public static func groupedEvents(_ events: [VisitEvent], timeZone: TimeZone, now: Date) -> (
        today: [VisitEvent], upcoming: [VisitEvent], earlier: [VisitEvent]
    ) {
        let today = localDate(now, timeZone: timeZone)
        let sorted = events.sorted { sortKey($0) < sortKey($1) }
        return (
            sorted.filter { day($0, timeZone: timeZone) == today },
            sorted.filter { day($0, timeZone: timeZone) > today },
            sorted.filter { day($0, timeZone: timeZone) < today }
        )
    }

    public static func searchGuide(_ entries: [GuideEntry], query: String) -> [GuideEntry] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if needle.isEmpty {
            return entries.sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
        }
        return
            entries
            .map { (entry: $0, score: score($0, needle: needle)) }
            .filter { $0.score > 0 }
            .sorted { lhs, rhs in
                if lhs.score != rhs.score { return lhs.score > rhs.score }
                return lhs.entry.title.localizedCompare(rhs.entry.title) == .orderedAscending
            }
            .map(\.entry)
    }

    public static func mergeNotes(_ server: [HouseholdNote], outbox: [PendingNote]) -> [ShownNote] {
        let seen = Set(server.map(\.clientRequestId))
        let synced = server.map { ShownNote(note: $0, delivery: "synced", error: "") }
        let local = outbox.filter { !seen.contains($0.clientRequestId) }.map { pending in
            ShownNote(
                note: HouseholdNote(
                    id: pending.clientRequestId,
                    clientRequestId: pending.clientRequestId,
                    authorName: pending.authorName,
                    body: pending.body,
                    createdAt: pending.createdAt,
                    seq: Int.max
                ),
                delivery: pending.status == "failed" ? "failed" : "pending",
                error: pending.error
            )
        }
        return (synced + local).sorted { $0.note.createdAt > $1.note.createdAt }
    }

    public static func normalizeServer(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return nil }
        if !text.contains("://") { text = "http://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let scheme = url.scheme,
            scheme == "http" || scheme == "https", url.host != nil
        else {
            return nil
        }
        return url
    }

    private static func score(_ entry: GuideEntry, needle: String) -> Int {
        let title = entry.title.lowercased()
        if title.contains(needle) { return 100 }
        if title.split(separator: " ").contains(where: { $0.hasPrefix(needle) }) { return 80 }
        if entry.synonyms.contains(where: { $0.lowercased().contains(needle) }) { return 60 }
        if entry.category.lowercased().contains(needle) { return 40 }
        if "\(entry.location) \(entry.details)".lowercased().contains(needle) { return 20 }
        return 0
    }

    private static func day(_ event: VisitEvent, timeZone: TimeZone) -> String {
        if event.allDay { return event.eventDate }
        guard let startsAt = event.startsAt, let date = parse(startsAt) else { return "" }
        return localDate(date, timeZone: timeZone)
    }

    private static func sortKey(_ event: VisitEvent) -> String {
        if event.allDay { return "\(event.eventDate)T00:00:00" }
        return event.startsAt ?? ""
    }

    private static func clock(_ iso: String, timeZone: TimeZone) -> String {
        guard let date = parse(iso) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private static func parse(_ iso: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: iso) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: iso)
    }
}
