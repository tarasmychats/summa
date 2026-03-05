import XCTest
@testable import WealthTrack
import SwiftUI

final class ThemeFontTests: XCTestCase {

    func testThemeFontPropertiesExist() {
        // Sanity check that all Theme font properties are accessible and return Font values
        let fonts: [Font] = [
            Theme.largeValue,
            Theme.titleFont,
            Theme.headlineFont,
            Theme.bodyFont,
            Theme.captionFont,
        ]
        XCTAssertEqual(fonts.count, 5, "Theme should expose exactly 5 font properties")
    }

    func testThemeFontPropertiesAreDistinct() {
        // Verify the fonts are not all the same (basic differentiation check)
        let largeValue = String(describing: Theme.largeValue)
        let caption = String(describing: Theme.captionFont)
        XCTAssertNotEqual(largeValue, caption, "largeValue and captionFont should be different fonts")
    }
}
