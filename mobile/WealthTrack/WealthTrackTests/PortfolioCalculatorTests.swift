import XCTest
@testable import WealthTrack

final class PortfolioCalculatorTests: XCTestCase {

    func testTotalValue() {
        let holdings: [PortfolioHolding] = [
            PortfolioHolding(name: "Bitcoin", amount: 1.0, pricePerUnit: 95000, category: .crypto),
            PortfolioHolding(name: "S&P 500", amount: 10, pricePerUnit: 520, category: .stock),
            PortfolioHolding(name: "USD Cash", amount: 5000, pricePerUnit: 1, category: .fiat),
        ]

        let total = PortfolioCalculator.totalValue(holdings: holdings)
        XCTAssertEqual(total, 105200, accuracy: 0.01)
    }

    func testCategoryBreakdown() {
        let holdings: [PortfolioHolding] = [
            PortfolioHolding(name: "Bitcoin", amount: 1.0, pricePerUnit: 50000, category: .crypto),
            PortfolioHolding(name: "USD", amount: 50000, pricePerUnit: 1.0, category: .fiat),
        ]

        let breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        XCTAssertEqual(breakdown[.crypto] ?? 0, 0.5, accuracy: 0.01)
        XCTAssertEqual(breakdown[.fiat] ?? 0, 0.5, accuracy: 0.01)
    }

    func testEmptyPortfolio() {
        let breakdown = PortfolioCalculator.categoryBreakdown(holdings: [])
        XCTAssertTrue(breakdown.isEmpty)
    }
}
