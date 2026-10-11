import CoreText
import SwiftUI

/// Locally bundled Welcome Book typography; semantic styles retain Dynamic Type scaling.
public enum HouseFont {
    private static let registered: Void = {
        for name in [
            "Fraunces-Regular", "Fraunces-Medium", "DMSans-Regular", "DMSans-Medium",
            "DMSans-SemiBold", "DMSans-Bold",
        ] {
            if let url = Bundle.module.url(forResource: name, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }()

    private static func name(_ design: Font.Design, _ weight: Font.Weight) -> String {
        _ = registered
        if design == .serif {
            return weight == .regular ? "Fraunces-Regular" : "Fraunces-Medium"
        }
        switch weight {
        case .bold, .heavy, .black: return "DMSans-Bold"
        case .semibold: return "DMSans-SemiBold"
        case .medium: return "DMSans-Medium"
        default: return "DMSans-Regular"
        }
    }

    public static func font(
        size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default
    ) -> Font {
        .custom(name(design, weight), fixedSize: size)
    }

    public static func font(
        _ style: Font.TextStyle, design: Font.Design = .default, weight: Font.Weight = .regular
    ) -> Font {
        let size: CGFloat
        #if os(tvOS)
            switch style {
            case .largeTitle: size = 57
            case .title: size = 48
            case .title2: size = 38
            case .title3: size = 31
            case .headline: size = 38
            case .body, .callout: size = 29
            case .subheadline: size = 26
            case .footnote: size = 23
            case .caption: size = 20
            case .caption2: size = 18
            @unknown default: size = 29
            }
        #else
            switch style {
            case .largeTitle: size = 34
            case .title: size = 28
            case .title2: size = 22
            case .title3: size = 20
            case .headline, .body: size = 17
            case .callout: size = 16
            case .subheadline: size = 15
            case .footnote: size = 13
            case .caption: size = 12
            case .caption2: size = 11
            @unknown default: size = 17
            }
        #endif
        return .custom(name(design, weight), size: size, relativeTo: style)
    }

    public static var largeTitle: Font { font(.largeTitle) }
    public static var title: Font { font(.title) }
    public static var title2: Font { font(.title2) }
    public static var title3: Font { font(.title3) }
    public static var headline: Font { font(.headline, weight: .semibold) }
    public static var body: Font { font(.body) }
    public static var callout: Font { font(.callout) }
    public static var subheadline: Font { font(.subheadline) }
    public static var footnote: Font { font(.footnote) }
    public static var caption: Font { font(.caption) }
    public static var caption2: Font { font(.caption2) }
}
