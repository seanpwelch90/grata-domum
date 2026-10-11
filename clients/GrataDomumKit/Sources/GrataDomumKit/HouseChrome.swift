import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

extension Color {
    public init(houseHex: String) {
        var hex = houseHex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&value)
        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255
        self.init(red: red, green: green, blue: blue)
    }
}

public enum QRImage {
    public static func make(_ payload: String, scale: CGFloat = 12) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(payload.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        return CIContext().createCGImage(scaled, from: scaled.extent)
    }
}

public struct HouseScreen<Content: View>: View {
    let theme: ThemeTokens
    @ViewBuilder var content: () -> Content

    public init(theme: ThemeTokens, @ViewBuilder content: @escaping () -> Content) {
        self.theme = theme
        self.content = content
    }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            content()

        }
        .font(HouseFont.body)
        .tint(DashboardPalette(theme: theme).accent)
        .foregroundStyle(DashboardPalette(theme: theme).ink)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(DashboardPalette(theme: theme).canvas.ignoresSafeArea())
    }
}

public struct RemoteImage: View {
    let path: String
    var fallback: String
    @Environment(HouseSession.self) private var session
    @State private var data: Data?

    public init(path: String, fallback: String) {
        self.path = path
        self.fallback = fallback
    }

    public var body: some View {
        Group {
            if let data, let image = platformImage(data) {
                image.resizable().scaledToFill()
            } else {
                Text(fallback)
            }
        }
        .task(id: path) {
            guard !HousePreview.isActive else { return }
            data = await session.imageData(path)
        }
    }
}

public struct WifiCard: View {
    let wifi: WiFiInfo
    var codeSide: CGFloat
    var surface: Surface

    public init(wifi: WiFiInfo, codeSide: CGFloat = 180, surface: Surface = .ipad) {
        self.wifi = wifi
        self.codeSide = codeSide
        self.surface = surface
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Wi-Fi").font(HouseFont.headline)
            Text(wifi.ssid)
                .font(
                    surface == .tv
                        ? HouseFont.font(size: 28, weight: .semibold, design: .rounded)
                        : HouseFont.title2
                )
                .fixedSize(horizontal: false, vertical: true)
            if surface == .tv || wifi.passwordHidden || wifi.password == nil {
                Text("Scan with your phone to join")
            } else if let password = wifi.password {
                Text("Password: \(password)").fixedSize(horizontal: false, vertical: true)
            }
            if let image = QRImage.make(wifi.qrPayload) {
                Image(decorative: image, scale: 1)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: codeSide, height: codeSide)
                    .padding(codeSide / 8)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .accessibilityLabel("Wi-Fi QR code for \(wifi.ssid)")
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
        .foregroundStyle(Color.black)
    }
}

public struct WeatherCard: View {
    let weather: Weather?
    let timeZone: String

    public init(weather: Weather?, timeZone: String) {
        self.weather = weather
        self.timeZone = timeZone
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Weather").font(HouseFont.headline)
            if let weather {
                let unit = weather.unit == "celsius" ? "°C" : "°F"
                Text("\(Int(weather.current.temperature.rounded()))\(unit)")
                    .font(HouseFont.largeTitle)
                Text(weather.current.label)
                HStack(alignment: .top) {
                    ForEach(weather.daily) { day in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(String(day.date.suffix(5))).font(HouseFont.caption.bold())
                            Text(day.label).font(HouseFont.caption)
                            Text("\(Int(day.high.rounded()))° / \(Int(day.low.rounded()))°").font(
                                .caption)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                Text(
                    "Updated \(HouseText.shortStamp(weather.fetchedAt, timeZone: HouseText.timeZone(timeZone)))\(weather.stale ? " · may be out of date" : "")"
                )
                .font(HouseFont.caption)
            } else {
                Text("Enjoy your day")
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 24))
        .foregroundStyle(Color(houseHex: "#173B35"))
    }
}

private func platformImage(_ data: Data) -> Image? {
    #if canImport(UIKit)
        guard let image = UIImage(data: data) else { return nil }
        return Image(uiImage: image)
    #elseif canImport(AppKit)
        guard let image = NSImage(data: data) else { return nil }
        return Image(nsImage: image)
    #else
        return nil
    #endif
}

/// A surface always owns both its fill and foreground, including in dark mode.
public struct HouseCard<Content: View>: View {
    let theme: ThemeTokens
    let content: Content
    public init(theme: ThemeTokens, @ViewBuilder content: () -> Content) {
        self.theme = theme
        self.content = content()
    }
    public var body: some View {
        content.padding(24).frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Color(houseHex: theme.surfaceText))
            .background(Color(houseHex: theme.surface), in: RoundedRectangle(cornerRadius: 26))
    }
}

public struct GuestAvatarGroup: View {
    let guests: [Guest]
    let theme: ThemeTokens
    let size: CGFloat
    public init(guests: [Guest], theme: ThemeTokens, size: CGFloat = 60) {
        self.guests = guests
        self.theme = theme
        self.size = size
    }
    public var body: some View {
        HStack(spacing: -8) {
            ForEach(Array(guests.prefix(5))) { guest in
                RemoteImage(path: guest.avatarURL, fallback: guest.initials)
                    .font(HouseFont.font(size: size / 3, weight: .semibold, design: .rounded))
                    .frame(width: size, height: size)
                    .background(Color(houseHex: theme.surface))
                    .foregroundStyle(Color(houseHex: theme.surfaceText))
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Color(houseHex: theme.background), lineWidth: 3))
                    .accessibilityLabel(guest.displayName)
            }
            if guests.count > 5 {
                Text("+\(guests.count - 5)").font(HouseFont.headline)
                    .frame(width: size, height: size)
                    .background(Color(houseHex: theme.surface), in: Circle())
                    .foregroundStyle(Color(houseHex: theme.surfaceText))
            }
        }
    }
}

/// Original native illustration, with no downloaded reference artwork.
public struct ThemeScene: View {
    let theme: ThemeTokens
    public init(theme: ThemeTokens) { self.theme = theme }
    public var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 400, size.height / 260)
            context.translateBy(
                x: (size.width - 400 * scale) / 2, y: (size.height - 260 * scale) / 2)
            context.scaleBy(x: scale, y: scale)
            let holiday = theme.id == "christmas"
            func rectangle(_ rect: CGRect, _ hex: String, radius: CGFloat = 0) {
                context.fill(
                    Path(roundedRect: rect, cornerRadius: radius),
                    with: .color(Color(houseHex: hex)))
            }
            context.fill(
                Path(ellipseIn: CGRect(x: 30, y: 218, width: 350, height: 24)),
                with: .color(Color(houseHex: "#BCD1C1")))
            context.fill(
                Path(ellipseIn: CGRect(x: 298, y: 30, width: 55, height: 55)),
                with: .color(Color(houseHex: "#F6CC70")))
            rectangle(CGRect(x: 112, y: 105, width: 185, height: 120), "#FFF9EC", radius: 6)
            var roof = Path()
            roof.move(to: CGPoint(x: 90, y: 111))
            roof.addLine(to: CGPoint(x: 204, y: 29))
            roof.addLine(to: CGPoint(x: 319, y: 111))
            roof.closeSubpath()
            context.fill(roof, with: .color(Color(houseHex: holiday ? "#944E5C" : "#CA8470")))
            rectangle(
                CGRect(x: 266, y: 43, width: 20, height: 47), holiday ? "#944E5C" : "#CA8470",
                radius: 3)
            rectangle(CGRect(x: 189, y: 156, width: 42, height: 69), "#4F7969", radius: 18)
            rectangle(CGRect(x: 134, y: 139, width: 34, height: 42), "#EAC376", radius: 4)
            rectangle(CGRect(x: 251, y: 139, width: 28, height: 42), "#EAC376", radius: 4)
            rectangle(CGRect(x: 149, y: 139, width: 4, height: 42), "#FFF9EC")
            rectangle(CGRect(x: 134, y: 157, width: 34, height: 4), "#FFF9EC")
            rectangle(CGRect(x: 264, y: 139, width: 3, height: 42), "#FFF9EC")
            rectangle(CGRect(x: 251, y: 157, width: 28, height: 4), "#FFF9EC")
            context.fill(
                Path(ellipseIn: CGRect(x: 218, y: 189, width: 5, height: 5)),
                with: .color(Color(houseHex: "#F6CC70")))
            rectangle(CGRect(x: 61, y: 159, width: 10, height: 67), "#94755B", radius: 3)
            if holiday {
                var tree = Path()
                tree.move(to: CGPoint(x: 65, y: 62))
                tree.addLine(to: CGPoint(x: 19, y: 189))
                tree.addLine(to: CGPoint(x: 111, y: 189))
                tree.closeSubpath()
                context.fill(tree, with: .color(Color(houseHex: "#4F7969")))
                for point in [
                    CGPoint(x: 63, y: 101), CGPoint(x: 48, y: 142), CGPoint(x: 78, y: 166),
                ] {
                    context.fill(
                        Path(ellipseIn: CGRect(x: point.x, y: point.y, width: 8, height: 8)),
                        with: .color(Color(houseHex: "#F6CC70")))
                }
            } else {
                context.fill(
                    Path(ellipseIn: CGRect(x: 22, y: 88, width: 85, height: 102)),
                    with: .color(Color(houseHex: "#7EAA8C")))
            }
            for (x, y, radius) in [(26.0, 43.0, 7.0), (355.0, 127.0, 9.0), (333.0, 103.0, 4.0)] {
                var sparkle = Path()
                sparkle.move(to: CGPoint(x: x, y: y - radius))
                sparkle.addLine(to: CGPoint(x: x + radius * 0.3, y: y - radius * 0.3))
                sparkle.addLine(to: CGPoint(x: x + radius, y: y))
                sparkle.addLine(to: CGPoint(x: x + radius * 0.3, y: y + radius * 0.3))
                sparkle.addLine(to: CGPoint(x: x, y: y + radius))
                sparkle.addLine(to: CGPoint(x: x - radius * 0.3, y: y + radius * 0.3))
                sparkle.addLine(to: CGPoint(x: x - radius, y: y))
                sparkle.addLine(to: CGPoint(x: x - radius * 0.3, y: y - radius * 0.3))
                sparkle.closeSubpath()
                context.fill(
                    sparkle, with: .color(Color(houseHex: holiday ? "#C39540" : "#9D87B0")))
            }
            rectangle(CGRect(x: 321, y: 198, width: 30, height: 29), "#CA8470", radius: 6)
            context.fill(
                Path(ellipseIn: CGRect(x: 317, y: 164, width: 38, height: 44)),
                with: .color(Color(houseHex: "#4F7969")))
        }.accessibilityHidden(true)
    }
}

public struct WelcomeArtwork: View {
    let snapshot: Snapshot
    @Environment(HouseSession.self) private var session
    @State private var data: Data?
    public init(snapshot: Snapshot) { self.snapshot = snapshot }
    public var body: some View {
        GeometryReader { geometry in
            Group {
                if let data, let image = platformImage(data) {
                    image.resizable().scaledToFill()
                } else {
                    ThemeScene(theme: snapshot.theme)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height).clipped()
        }
        .clipShape(RoundedRectangle(cornerRadius: 26))
        .modifier(ArtworkEntrance(enabled: snapshot.theme.motion != "none"))
        .task(id: snapshot.visit?.coverURL) {
            data = nil
            if !HousePreview.isActive, let path = snapshot.visit?.coverURL, !path.isEmpty {
                data = await session.imageData(path)
            }
        }
    }
}

public struct DisplayMaintenance: View {
    @Environment(HouseSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var confirming = false
    public init() {}
    public var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                Text("Display settings").font(HouseFont.largeTitle.bold())
                Text(
                    session.offline ? "Showing saved house information." : "Paired with your house."
                )
                Text(
                    "Forgetting this display removes its saved house information. A new pairing code will be needed."
                )
                if !HousePreview.isActive {
                    Button("Check for updates") { Task { await session.refresh() } }
                }
                Button("Done") { dismiss() }
                if !HousePreview.isActive {
                    Button("Forget this display", role: .destructive) { confirming = true }
                }
            }.padding(40)
                .confirmationDialog(
                    "Forget this display?", isPresented: $confirming, titleVisibility: .visible
                ) {
                    Button("Forget display", role: .destructive) {
                        session.forget()
                        dismiss()
                    }
                    Button("Cancel", role: .cancel) {}
                }
        }
    }
}

/// Native dashboard roles deliberately keep both launch themes light.
public struct DashboardPalette {
    public let christmas: Bool
    private let theme: ThemeTokens
    private var custom: Bool { theme.id != "default" && theme.id != "christmas" }
    public init(theme: ThemeTokens) {
        self.theme = theme
        christmas = theme.id == "christmas"
    }
    public var canvas: Color {
        Color(
            houseHex: custom
                ? theme.background : WelcomeBookTokens.value("canvas", christmas: christmas))
    }
    public var ink: Color {
        Color(houseHex: custom ? theme.text : WelcomeBookTokens.value("ink", christmas: christmas))
    }
    public var heroInk: Color {
        Color(
            houseHex: custom
                ? theme.surfaceText : WelcomeBookTokens.value("ink", christmas: christmas))
    }
    public var muted: Color {
        Color(
            houseHex: custom
                ? theme.textSecondary : WelcomeBookTokens.value("muted", christmas: christmas))
    }
    public var accent: Color {
        Color(
            houseHex: custom
                ? theme.accent : WelcomeBookTokens.value("accent", christmas: christmas))
    }
    public var surface: Color {
        Color(
            houseHex: custom
                ? theme.surface : WelcomeBookTokens.value("surface", christmas: christmas))
    }
    public var surfaceInk: Color {
        Color(
            houseHex: custom
                ? theme.surfaceText : WelcomeBookTokens.value("ink", christmas: christmas))
    }
    public var surfaceMuted: Color {
        Color(
            houseHex: custom
                ? theme.surfaceMuted : WelcomeBookTokens.value("muted", christmas: christmas))
    }
    public var hero: Color { extra("welcome") }
    public var comfort: Color { extra("comfort") }
    public var peach: Color { extra("plan") }
    public var blue: Color { extra("weather") }
    private func extra(_ role: String) -> Color {
        Color(
            houseHex: custom ? theme.surface : WelcomeBookTokens.value(role, christmas: christmas))
    }

}

public struct DashboardTile<Content: View>: View {
    let fill: Color
    let padding: CGFloat
    let ink: Color
    let content: Content
    public init(
        fill: Color = .white, padding: CGFloat = 24, ink: Color = Color(houseHex: "#233D35"),
        @ViewBuilder content: () -> Content
    ) {
        self.fill = fill
        self.padding = padding
        self.ink = ink
        self.content = content()
    }
    public var body: some View {
        content.padding(padding).frame(
            maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading
        )
        .foregroundStyle(ink)
        .background(fill, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(
                .white.opacity(0.42), lineWidth: 1)
        )
        .compositingGroup()
        .shadow(color: .black.opacity(0.025), radius: 2, x: 0, y: 2)
        .shadow(color: Color(houseHex: "#24352C").opacity(0.045), radius: 14, x: 0, y: 8)
    }
}

public struct WifiWidget: View {
    let wifi: WiFiInfo
    let theme: ThemeTokens?
    let large: Bool
    @Environment(\.dynamicTypeSize) private var typeSize
    public init(wifi: WiFiInfo, large: Bool = false, theme: ThemeTokens? = nil) {
        self.theme = theme
        self.wifi = wifi
        self.large = large
    }
    public var body: some View {
        DashboardTile(
            fill: theme.map { DashboardPalette(theme: $0).surface } ?? Color(houseHex: "#FFFDF8"),
            padding: large ? 24 : 24,
            ink: theme.map { DashboardPalette(theme: $0).surfaceInk } ?? Color(houseHex: "#233D35")
        ) {
            let layout =
                typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 20))
                : AnyLayout(HStackLayout(alignment: .center, spacing: large ? 32 : 18))
            layout {
                VStack(alignment: .leading, spacing: large ? 18 : 12) {
                    DashboardIcon(
                        "wifi",
                        tint: theme.map { DashboardPalette(theme: $0).accent }
                            ?? Color(houseHex: "#2E6553"), large: large)
                    Text("Wi-Fi").font(
                        large
                            ? HouseFont.font(size: 36, weight: .semibold, design: .rounded)
                            : HouseFont.font(.title2, design: .rounded, weight: .semibold))
                    Text(wifi.ssid).font(large ? HouseFont.font(size: 24) : HouseFont.body)
                        .fixedSize(
                            horizontal: false, vertical: true)
                    Text("Scan to join Wi-Fi").font(
                        large ? HouseFont.font(size: 24) : HouseFont.subheadline
                    )
                    .foregroundStyle(
                        theme.map { DashboardPalette(theme: $0).surfaceMuted }
                            ?? Color(houseHex: "#57665C"))
                }.frame(maxWidth: .infinity, alignment: .leading)
                if let code = QRImage.make(wifi.qrPayload) {
                    Image(decorative: code, scale: 1).resizable().interpolation(.none)
                        .frame(width: large ? 220 : 112, height: large ? 220 : 112)
                        .padding(large ? 20 : 16).background(.white)
                        .accessibilityLabel("Wi-Fi QR code for \(wifi.ssid)")
                }
            }
        }
    }
}

public struct DashboardWeather: View {
    let weather: Weather?
    let theme: ThemeTokens?
    let large: Bool
    let timeZone: String
    @Environment(\.dynamicTypeSize) private var typeSize
    public init(
        weather: Weather?, large: Bool = false, timeZone: String = "UTC", theme: ThemeTokens? = nil
    ) {
        self.theme = theme
        self.weather = weather
        self.large = large
        self.timeZone = timeZone
    }
    public var body: some View {
        DashboardTile(
            fill: theme.map { DashboardPalette(theme: $0).blue } ?? Color(houseHex: "#E4ECF0"),
            padding: large ? 30 : 24,
            ink: theme.map { DashboardPalette(theme: $0).surfaceInk } ?? Color(houseHex: "#233D35")
        ) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    if let weather {
                        Text(
                            "\(Int(weather.current.temperature.rounded()))°\(weather.unit == "celsius" ? "C" : "F")"
                        )
                        .font(
                            large
                                ? HouseFont.font(size: 48, weight: .medium, design: .rounded)
                                : HouseFont.font(.largeTitle, design: .rounded, weight: .semibold)
                        )
                        .modifier(GentleNumericChange(value: weather.current.temperature))
                    } else {
                        Text("Weather unavailable").font(
                            large
                                ? HouseFont.font(size: 36, weight: .semibold, design: .rounded)
                                : HouseFont.font(.title2, design: .rounded, weight: .semibold))
                    }
                    Spacer(minLength: 8)
                    Image(systemName: weatherSymbol(weather?.current.code)).symbolRenderingMode(
                        .multicolor
                    )
                    .font(HouseFont.font(size: large ? 58 : 42)).accessibilityHidden(true)
                }
                Text(weather?.current.label ?? "Check outside before heading out.")
                    .font(large ? HouseFont.font(size: 25) : HouseFont.body)
                if let first = weather?.daily.first(where: { $0.date == today }) {
                    Text("H \(Int(first.high.rounded()))°  L \(Int(first.low.rounded()))°")
                        .font(large ? HouseFont.font(size: 24) : HouseFont.subheadline)
                        .foregroundStyle(
                            theme.map { DashboardPalette(theme: $0).surfaceMuted }
                                ?? Color(houseHex: "#57665C"))
                }
                if !forecast.isEmpty {
                    Divider().overlay(Color.primary.opacity(0.06))
                    let layout =
                        typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 16))
                        : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
                    layout {
                        ForEach(forecast) { day in
                            VStack(spacing: 8) {
                                Text(dayLabel(day.date)).font(
                                    large
                                        ? HouseFont.font(size: 22, weight: .semibold)
                                        : HouseFont.subheadline.weight(.semibold))
                                Image(systemName: weatherSymbol(day.code))
                                    .symbolRenderingMode(.multicolor)
                                    .font(HouseFont.font(size: large ? 32 : 28))
                                    .frame(height: large ? 40 : 36)
                                    .accessibilityHidden(true)
                                Text("\(Int(day.high.rounded()))° / \(Int(day.low.rounded()))°")
                                    .font(
                                        large
                                            ? HouseFont.font(size: 22, weight: .medium)
                                            : HouseFont.subheadline
                                    )
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(
                                maxWidth: .infinity,
                                maxHeight: typeSize.isAccessibilitySize ? nil : .infinity
                            )
                            .padding(.vertical, 10)
                            .background(.white.opacity(0.3), in: RoundedRectangle(cornerRadius: 16))
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(
                                "\(dayLabel(day.date)), \(day.label), high \(Int(day.high.rounded())) degrees, low \(Int(day.low.rounded())) degrees"
                            )
                        }
                    }.fixedSize(horizontal: false, vertical: true)
                }
                if weather?.stale == true {
                    Text(
                        "Updated \(HouseText.shortStamp(weather?.fetchedAt ?? "", timeZone: HouseText.timeZone(timeZone))) · may be out of date"
                    ).font(large ? HouseFont.font(size: 22) : HouseFont.caption)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
    private var today: String {
        HouseText.localDate(Date(), timeZone: HouseText.timeZone(timeZone))
    }
    private var forecast: [Weather.Day] {
        Array(
            (weather?.daily ?? []).filter { $0.date > today }.sorted { $0.date < $1.date }.prefix(3)
        )
    }
    private func dayLabel(_ raw: String) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = HouseText.timeZone(timeZone)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: raw) else { return raw }
        formatter.setLocalizedDateFormatFromTemplate("EEE")
        return formatter.string(from: date)
    }
    private func weatherSymbol(_ code: Int?) -> String {
        switch code {
        case 0: return "sun.max.fill"
        case 1, 2: return "cloud.sun.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51, 53, 55: return "cloud.drizzle.fill"
        case 56, 57, 66, 67: return "cloud.sleet.fill"
        case 61, 63, 65, 80, 81, 82: return "cloud.rain.fill"
        case 71, 73, 75, 77, 85, 86: return "cloud.snow.fill"
        case 95, 96, 99: return "cloud.bolt.rain.fill"
        default: return "cloud"
        }
    }
}

/// One typographic pairing: system serif welcome, rounded guest names, system body.
public struct WelcomeHeading: View {
    let guests: [Guest]
    let large: Bool
    public init(guests: [Guest], large: Bool = false) {
        self.guests = guests
        self.large = large
    }
    public var body: some View {
        let names = HouseText.joinNames(guests.map(\.displayName))
        let group = guests.count > (large ? 2 : 3) || names.count > (large ? 28 : 50)
        VStack(alignment: .leading, spacing: large ? 5 : 3) {
            Text(group ? "Everyone’s here." : names.isEmpty ? "Make yourself" : "Welcome,")
                .font(
                    large
                        ? HouseFont.font(size: 64, weight: .regular, design: .serif)
                        : HouseFont.font(.largeTitle, design: .serif, weight: .regular))
            Text(group ? "Welcome home." : names.isEmpty ? "at home." : names + ".")
                .font(
                    large
                        ? HouseFont.font(size: 48, weight: .semibold, design: .rounded)
                        : HouseFont.font(.largeTitle, design: .rounded, weight: .bold))
        }.fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
    }
}

public struct DashboardIcon: View {
    let symbol: String
    let tint: Color
    let large: Bool
    public init(_ symbol: String, tint: Color = Color(houseHex: "#386E60"), large: Bool = false) {
        self.symbol = symbol
        self.tint = tint
        self.large = large
    }
    public var body: some View {
        Image(systemName: symbol).font(
            large ? HouseFont.font(size: 27, weight: .medium) : HouseFont.title3.weight(.medium)
        )
        .foregroundStyle(tint).padding(large ? 14 : 11)
        .background(tint.opacity(0.09), in: RoundedRectangle(cornerRadius: large ? 18 : 14))
        .accessibilityHidden(true)
    }
}

public struct CalendarBadge: View {
    let date: Date
    let timeZone: TimeZone
    let tint: Color
    public init(date: Date, timeZone: TimeZone, tint: Color) {
        self.date = date
        self.timeZone = timeZone
        self.tint = tint
    }
    public var body: some View {
        VStack(spacing: 1) {
            Text(formatted("MMM").uppercased()).font(
                HouseFont.font(.caption2, design: .rounded, weight: .bold)
            ).tracking(0.8)
            Text(formatted("d")).font(
                HouseFont.font(.title2, design: .rounded, weight: .semibold))
        }.foregroundStyle(tint).padding(.horizontal, 13).padding(.vertical, 7)
            .background(.white.opacity(0.65), in: RoundedRectangle(cornerRadius: 14))
            .accessibilityLabel(formatted("MMMMd"))
    }
    private func formatted(_ template: String) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }
}

public struct DashboardPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.94 : 1)
            .scaleEffect(
                configuration.isPressed && !reduceMotion && scenePhase == .active ? 0.985 : 1
            )
            .animation(
                reduceMotion || scenePhase != .active
                    ? nil : .spring(response: 0.26, dampingFraction: 0.82),
                value: configuration.isPressed)
    }
}

public struct ArtworkEntrance: ViewModifier {
    let enabled: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var appeared = false
    public init(enabled: Bool = true) { self.enabled = enabled }
    public func body(content: Content) -> some View {
        content.opacity(appeared || reduceMotion || !enabled ? 1 : 0)
            .offset(y: appeared || reduceMotion || !enabled ? 0 : 8)
            .onAppear {
                withAnimation(
                    !enabled || reduceMotion || scenePhase != .active
                        ? nil : .easeOut(duration: 0.32)
                ) { appeared = true }
            }
            .onChange(of: scenePhase) { _, phase in if phase != .active { appeared = true } }
    }
}

public struct GentleNumericChange<Value: Equatable>: ViewModifier {
    let value: Value
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    public init(value: Value) { self.value = value }
    public func body(content: Content) -> some View {
        content.contentTransition(
            reduceMotion || scenePhase != .active ? .identity : .numericText()
        )
        .animation(
            reduceMotion || scenePhase != .active ? nil : .easeInOut(duration: 0.18), value: value)
    }
}
