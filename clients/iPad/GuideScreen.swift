import GrataDomumKit
import SwiftUI

struct GuideScreen: View {
    let snapshot: Snapshot
    var showPin: (String) -> Void
    @Environment(HouseSession.self) private var session
    @State private var query = ""
    @State private var segment = "Find something"
    @State private var category = "All"
    @State private var selected: GuideEntry?
    @State private var posting = false
    @State private var author = ""
    @State private var bodyText = ""
    @State private var message = ""

    var body: some View {
        HouseScreen(theme: snapshot.theme) {
            VStack {
                Picker("Browse", selection: $segment) {
                    Text("Find something").tag("Find something")
                    Text("House notes").tag("House notes")
                }.pickerStyle(.segmented).padding()
                if segment == "Find something" { guide } else { notes }
            }
        }
        .navigationTitle("Need Something?")
        .onAppear { if author.isEmpty { author = session.savedAuthor() } }
        .sheet(item: $selected) { entry in
            NavigationStack {
                HouseScreen(theme: snapshot.theme) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            Label(entry.location, systemImage: "mappin").font(
                                HouseFont.title3.bold())
                            Text(entry.details).font(HouseFont.title3)
                            if !entry.photoURL.isEmpty {
                                RemoteImage(path: entry.photoURL, fallback: "").frame(height: 240)
                                    .clipped()
                            }
                            if snapshot.map.pins.contains(where: { $0.id == entry.pinId }) {
                                Button("Show on map", systemImage: "map") {
                                    selected = nil
                                    showPin(entry.pinId)
                                }.buttonStyle(.borderedProminent)
                            }
                        }.padding(24)
                    }
                }.navigationTitle(entry.title).toolbar { Button("Done") { selected = nil } }
            }
        }
    }

    private var guide: some View {
        let results = HouseText.searchGuide(snapshot.guide, query: query)
            .filter { category == "All" || $0.category == category }
        return List {
            Picker("Category", selection: $category) {
                Text("All categories").tag("All")
                ForEach(
                    Array(Set(snapshot.guide.map(\.category).filter { !$0.isEmpty })).sorted(),
                    id: \.self
                ) {
                    Text($0).tag($0)
                }
            }.listRowBackground(surface).foregroundStyle(ink)
            if results.isEmpty {
                Text(
                    query.isEmpty
                        ? "Ask your host if you need a hand finding something."
                        : "Couldn’t find that. Try another word, or ask your host."
                )
                .listRowBackground(surface).foregroundStyle(ink)
            }
            ForEach(results) { entry in
                Button {
                    selected = entry
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(entry.title).font(
                                HouseFont.font(.title3, design: .rounded, weight: .semibold))
                            Text(entry.location)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                    }.padding(.vertical, 8).foregroundStyle(ink)
                }.listRowBackground(surface)
            }
        }.scrollContentBackground(.hidden)
            .searchable(text: $query, prompt: "Towels, coffee, extra blankets…")
    }

    private var notes: some View {
        let shown = HouseText.mergeNotes(snapshot.notes, outbox: session.outbox)
        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Everyone using the house displays can see these notes.").font(
                    HouseFont.subheadline)
                if snapshot.device.canPostNotes {
                    HouseCard(theme: snapshot.theme) {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Leave a little note").font(HouseFont.title2.bold())
                            if let guests = snapshot.visit?.guests, !guests.isEmpty {
                                Menu("Choose your name") {
                                    ForEach(guests) { guest in
                                        Button(guest.displayName) { author = guest.displayName }
                                    }
                                }
                            }
                            TextField("Your name", text: $author).textFieldStyle(.roundedBorder)
                            TextField("Note", text: $bodyText, axis: .vertical).lineLimit(3...6)
                                .textFieldStyle(.roundedBorder)
                            Text("\(bodyText.count)/280").font(HouseFont.caption)
                            Button(posting ? "Sending…" : "Post to house") { Task { await post() } }
                                .buttonStyle(.borderedProminent)
                                .disabled(
                                    posting
                                        || bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
                                            .isEmpty
                                        || bodyText.count > 280)
                            if !message.isEmpty { Text(message).font(HouseFont.subheadline) }
                        }
                    }
                }
                if shown.isEmpty { Text("No notes yet. Enjoy making yourself at home.") }
                ForEach(shown) { item in
                    HouseCard(theme: snapshot.theme) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(item.note.body).font(HouseFont.title3)
                            Text(caption(item)).font(HouseFont.footnote)
                            if item.delivery == "failed" || item.delivery == "pending" {
                                HStack {
                                    Button("Retry") {
                                        Task { await session.retryNote(item.note.clientRequestId) }
                                    }
                                    Button("Discard", role: .destructive) {
                                        session.discardNote(item.note.clientRequestId)
                                    }
                                }.buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }.padding(24)
        }
    }

    private var surface: Color { DashboardPalette(theme: snapshot.theme).surface }
    private var ink: Color { DashboardPalette(theme: snapshot.theme).surfaceInk }
    private func post() async {
        posting = true
        let previousIDs = Set(session.outbox.map(\.clientRequestId))
        let error = await session.postNote(authorName: author, body: bodyText)
        let queued = session.outbox.first { !previousIDs.contains($0.clientRequestId) }
        message = error.isEmpty ? "Posted to the house." : error
        if error.isEmpty || queued != nil { bodyText = "" }
        if queued?.status != "failed", queued != nil {
            message = "Saved on this iPad. Will send when connected."
        }
        posting = false
    }
    private func caption(_ item: ShownNote) -> String {
        var text =
            "\(item.note.authorName) · \(HouseText.shortStamp(item.note.createdAt, timeZone: HouseText.timeZone(snapshot.timeZone)))"
        if item.delivery == "pending" {
            text +=
                session.offline ? " · Saved on this iPad. Will send when connected." : " · Sending"
        }
        if item.delivery == "failed" { text += " · \(item.error)" }
        return text
    }
}
