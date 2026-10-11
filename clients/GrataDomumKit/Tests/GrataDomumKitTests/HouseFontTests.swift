import CoreText
import SwiftUI
import XCTest

@testable import GrataDomumKit

final class HouseFontTests: XCTestCase {
    func testBundledFontsRegisterWithoutSystemFallback() {
        _ = HouseFont.body
        for name in [
            "Fraunces-Regular", "Fraunces-Medium", "DMSans-Regular", "DMSans-Medium",
            "DMSans-SemiBold", "DMSans-Bold",
        ] {
            let font = CTFontCreateWithName(name as CFString, 24, nil)
            XCTAssertEqual(CTFontCopyPostScriptName(font) as String, name)
        }
    }
}
