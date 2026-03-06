import XCTest
@testable import Summa

final class PortfolioCalculatorTests: XCTestCase {

    func testTotalValue() {
        let holdings: [PortfolioHolding] = [
            PortfolioHolding(name: "Bitcoin", symbol: "bitcoin", amount: 1.0, pricePerUnit: 95000, category: .crypto),
            PortfolioHolding(name: "S&P 500", symbol: "VOO", amount: 10, pricePerUnit: 520, category: .stock),
            PortfolioHolding(name: "USD Cash", symbol: "USD", amount: 5000, pricePerUnit: 1, category: .fiat),
        ]

        let total = PortfolioCalculator.totalValue(holdings: holdings)
        XCTAssertEqual(total, 105200, accuracy: 0.01)
    }

    func testCategoryBreakdown() {
        let holdings: [PortfolioHolding] = [
            PortfolioHolding(name: "Bitcoin", symbol: "bitcoin", amount: 1.0, pricePerUnit: 50000, category: .crypto),
            PortfolioHolding(name: "USD", symbol: "USD", amount: 50000, pricePerUnit: 1.0, category: .fiat),
        ]

        let breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        XCTAssertEqual(breakdown[.crypto] ?? 0, 0.5, accuracy: 0.01)
        XCTAssertEqual(breakdown[.fiat] ?? 0, 0.5, accuracy: 0.01)
    }

    func testEmptyPortfolio() {
        let breakdown = PortfolioCalculator.categoryBreakdown(holdings: [])
        XCTAssertTrue(breakdown.isEmpty)
    }

    // MARK: - Category Percentages

    func testCategoryPercentagesBasic() {
        let breakdown: [AssetCategory: Double] = [
            .crypto: 0.45,
            .stock: 0.35,
            .fiat: 0.20
        ]
        let percentages = PortfolioCalculator.categoryPercentages(breakdown: breakdown)
        XCTAssertEqual(percentages[.crypto], 45)
        XCTAssertEqual(percentages[.stock], 35)
        XCTAssertEqual(percentages[.fiat], 20)
    }

    func testCategoryPercentagesRounding() {
        let breakdown: [AssetCategory: Double] = [
            .crypto: 0.333,
            .stock: 0.667
        ]
        let percentages = PortfolioCalculator.categoryPercentages(breakdown: breakdown)
        XCTAssertEqual(percentages[.crypto], 33)
        XCTAssertEqual(percentages[.stock], 67)
    }

    func testCategoryPercentagesEmpty() {
        let percentages = PortfolioCalculator.categoryPercentages(breakdown: [:])
        XCTAssertTrue(percentages.isEmpty)
    }

    func testCategoryPercentagesSingleCategory() {
        let breakdown: [AssetCategory: Double] = [.crypto: 1.0]
        let percentages = PortfolioCalculator.categoryPercentages(breakdown: breakdown)
        XCTAssertEqual(percentages[.crypto], 100)
    }

    // MARK: - Fiat-Only Detection

    func testAllFiatMatchingCurrency_singleUSD() {
        let holdings = [
            PortfolioHolding(name: "USD", symbol: "USD", amount: 5000, pricePerUnit: 1, category: .fiat)
        ]
        XCTAssertTrue(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
    }

    func testAllFiatMatchingCurrency_multipleUSD() {
        let holdings = [
            PortfolioHolding(name: "USD Cash", symbol: "USD", amount: 5000, pricePerUnit: 1, category: .fiat),
            PortfolioHolding(name: "USD Savings", symbol: "USD", amount: 3000, pricePerUnit: 1, category: .fiat)
        ]
        XCTAssertTrue(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
    }

    func testAllFiatMatchingCurrency_eurWithEurDisplay() {
        let holdings = [
            PortfolioHolding(name: "EUR", symbol: "EUR", amount: 1000, pricePerUnit: 1, category: .fiat)
        ]
        XCTAssertTrue(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "EUR"))
    }

    func testAllFiatMatchingCurrency_mixedPortfolio() {
        let holdings = [
            PortfolioHolding(name: "USD", symbol: "USD", amount: 5000, pricePerUnit: 1, category: .fiat),
            PortfolioHolding(name: "Bitcoin", symbol: "bitcoin", amount: 1, pricePerUnit: 95000, category: .crypto)
        ]
        XCTAssertFalse(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
    }

    func testAllFiatMatchingCurrency_fiatNotMatchingCurrency() {
        let holdings = [
            PortfolioHolding(name: "EUR", symbol: "EUR", amount: 1000, pricePerUnit: 1, category: .fiat)
        ]
        XCTAssertFalse(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
    }

    func testAllFiatMatchingCurrency_emptyPortfolio() {
        XCTAssertFalse(PortfolioCalculator.allFiatMatchingCurrency(holdings: [], currency: "USD"))
    }
}
