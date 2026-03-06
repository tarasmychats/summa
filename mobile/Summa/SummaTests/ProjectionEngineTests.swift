import XCTest
@testable import Summa

final class ProjectionEngineTests: XCTestCase {

    func testCompoundGrowth() {
        // $10,000 at 10%/yr for 10 years = $10,000 * (1.1)^10 = $25,937.42
        let result = ProjectionEngine.compoundGrowth(
            presentValue: 10000,
            annualRate: 0.10,
            years: 10
        )
        XCTAssertEqual(result, 25937.42, accuracy: 1.0)
    }

    func testProjectPortfolio() {
        let holdings = [
            PortfolioHolding(name: "S&P 500", symbol: "VOO", amount: 100, pricePerUnit: 100, category: .stock),
        ]

        let projection = ProjectionEngine.project(holdings: holdings, years: 10)

        // Stock expected rate: 8%
        // $10,000 * (1.08)^10 = $21,589.25
        XCTAssertEqual(projection.expected, 21589.25, accuracy: 100)
        XCTAssertLessThan(projection.pessimistic, projection.expected)
        XCTAssertGreaterThan(projection.optimistic, projection.expected)
    }

    func testCashLosesToInflation() {
        let holdings = [
            PortfolioHolding(name: "USD", symbol: "USD", amount: 10000, pricePerUnit: 1, category: .fiat),
        ]

        let projection = ProjectionEngine.project(holdings: holdings, years: 10)

        // Cash expected rate: -3% (inflation)
        // All three scenarios should show loss
        XCTAssertLessThan(projection.expected, 10000)
        XCTAssertLessThan(projection.pessimistic, projection.expected)
    }
}
