import XCTest
@testable import WealthTrack
import SwiftUI

final class ThemeFontTests: XCTestCase {

    func testCategoryColorMapping() {
        XCTAssertEqual(Theme.categoryColor(.crypto), Theme.lavender)
        XCTAssertEqual(Theme.categoryColor(.stock), Theme.sage)
        XCTAssertEqual(Theme.categoryColor(.fiat), Theme.amber)
    }

    func testCategoryTintMapping() {
        XCTAssertEqual(Theme.categoryTint(.crypto), Theme.cryptoTint)
        XCTAssertEqual(Theme.categoryTint(.stock), Theme.stockTint)
        XCTAssertEqual(Theme.categoryTint(.fiat), Theme.fiatTint)
    }

    func testRiskColorBoundaries() {
        // 0-3: sage (no assets / conservative)
        XCTAssertEqual(Theme.riskColor(0), Theme.sage)
        // 1-3: sage (conservative)
        XCTAssertEqual(Theme.riskColor(1), Theme.sage)
        XCTAssertEqual(Theme.riskColor(3), Theme.sage)
        // 4-6: amber (moderate)
        XCTAssertEqual(Theme.riskColor(4), Theme.amber)
        XCTAssertEqual(Theme.riskColor(6), Theme.amber)
        // 7+: coral (aggressive)
        XCTAssertEqual(Theme.riskColor(7), Theme.coral)
        XCTAssertEqual(Theme.riskColor(10), Theme.coral)
    }

    func testSpacingConstants() {
        XCTAssertEqual(Theme.cardCornerRadius, 20)
        XCTAssertEqual(Theme.cardPadding, 20)
        XCTAssertEqual(Theme.sectionSpacing, 20)
    }
}
