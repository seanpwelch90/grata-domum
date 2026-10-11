import GrataDomumKit
import SwiftUI

struct MapScreen: View {
    let snapshot: Snapshot
    @Binding var pinID: String
    @Environment(HouseSession.self) private var session
    @State private var image: UIImage?
    @State private var scale: CGFloat = 1
    @State private var category = "All"
    @State private var selected: MapPin?
    @GestureState private var pinch: CGFloat = 1
    private var pins: [MapPin] {
        snapshot.map.pins.filter { category == "All" || $0.category == category }
    }

    var body: some View {
        HouseScreen(theme: snapshot.theme) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Find your way around").font(
                        HouseFont.font(.largeTitle, design: .rounded, weight: .bold))
                    ScrollView(.horizontal) {
                        HStack {
                            ForEach(
                                ["All"]
                                    + Array(
                                        Set(
                                            snapshot.map.pins.map(\.category).filter { !$0.isEmpty }
                                        )
                                    ).sorted(), id: \.self
                            ) { item in
                                Button(item) { category = item }.buttonStyle(.bordered).tint(
                                    category == item ? .accentColor : .secondary)
                            }
                        }
                    }
                    if let image {
                        HStack {
                            Button("Zoom in", systemImage: "plus.magnifyingglass") {
                                scale = min(3, scale + 0.25)
                            }
                            Button("Zoom out", systemImage: "minus.magnifyingglass") {
                                scale = max(1, scale - 0.25)
                            }
                            Button("Reset") { scale = 1 }
                        }.buttonStyle(.bordered)
                        GeometryReader { geometry in
                            ScrollView([.horizontal, .vertical]) {
                                Image(uiImage: image).resizable()
                                    .frame(
                                        width: geometry.size.width * scale * pinch,
                                        height: geometry.size.width * image.size.height
                                            / image.size.width * scale * pinch
                                    )
                                    .overlay {
                                        GeometryReader { fitted in
                                            ForEach(pins) { pin in
                                                Button {
                                                    select(pin)
                                                } label: {
                                                    Image(systemName: "mappin.circle.fill").font(
                                                        HouseFont.font(size: 34)
                                                    )
                                                    .foregroundStyle(
                                                        .white,
                                                        DashboardPalette(theme: snapshot.theme)
                                                            .accent
                                                    )
                                                    .padding(5)
                                                }.accessibilityLabel(pin.title)
                                                    .position(
                                                        x: pin.x * fitted.size.width,
                                                        y: pin.y * fitted.size.height)
                                            }
                                        }
                                    }
                                    .gesture(
                                        MagnificationGesture().updating($pinch) { value, state, _ in
                                            state = value
                                        }.onEnded { scale = min(3, max(1, scale * $0)) })
                            }
                        }.frame(height: 400).clipShape(RoundedRectangle(cornerRadius: 24))
                    }
                    if pins.isEmpty {
                        Text("Ask your host if you need a hand finding something.").font(
                            HouseFont.title3)
                    }
                    ForEach(pins) { pin in
                        Button {
                            select(pin)
                        } label: {
                            HouseCard(theme: snapshot.theme) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(pin.title).font(HouseFont.headline)
                                        if !pin.roomName.isEmpty { Text(pin.roomName) }
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                }
                            }
                        }.buttonStyle(.plain)
                    }
                }.padding(24)
            }
        }.navigationTitle("House Map")
            .task(id: snapshot.map.imageURL) {
                image = nil
                if !HousePreview.isActive, let data = await session.imageData(snapshot.map.imageURL)
                {
                    image = UIImage(data: data)
                }
            }
            .onChange(of: pinID) { _, id in selected = snapshot.map.pins.first { $0.id == id } }
            .onAppear { selected = snapshot.map.pins.first { $0.id == pinID } }
            .sheet(item: $selected) { pin in
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            Text(pin.roomName).font(HouseFont.headline)
                            Text(pin.description).font(HouseFont.title3)
                            if !pin.photoURL.isEmpty {
                                RemoteImage(path: pin.photoURL, fallback: "").frame(height: 240)
                                    .clipped()
                            }
                        }.padding(24)
                    }.navigationTitle(pin.title)
                        .toolbar { Button("Done") { selected = nil } }
                }
            }
    }
    private func select(_ pin: MapPin) {
        pinID = pin.id
        selected = pin
    }
}
