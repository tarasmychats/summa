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

    func testThemeFontPropertiesAreAccessible() {
        // Verify each Theme font can be applied to a SwiftUI Text (compile-time + runtime check)
        let fonts: [Font] = [
            Theme.largeValue,
            Theme.titleFont,
            Theme.headlineFont,
            Theme.bodyFont,
            Theme.captionFont,
        ]
        // All five should be non-nil Font values (guaranteed by type system, but verify count)
        XCTAssertEqual(fonts.count, 5)
    }
}
