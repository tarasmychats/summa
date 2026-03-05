import XCTest
@testable import WealthTrack

final class InsightsEngineTests: XCTestCase {

    func testHighCryptoWarning() {
        let holdings = [
            PortfolioHolding(name: "BTC", symbol: "bitcoin", amount: 1, pricePerUnit: 80000, category: .crypto),
            PortfolioHolding(name: "USD", symbol: "USD", amount: 10000, pricePerUnit: 1, category: .fiat),
        ]
        // 89% crypto
        let insights = InsightsEngine.generate(holdings: holdings)
        XCTAssertTrue(insights.contains { $0.id == "high_crypto" })
    }

    func testHighCashWarning() {
        let holdings = [
            PortfolioHolding(name: "USD", symbol: "USD", amount: 60000, pricePerUnit: 1, category: .fiat),
            PortfolioHolding(name: "BTC", symbol: "bitcoin", amount: 0.1, pricePerUnit: 95000, category: .crypto),
        ]
        // ~86% cash
        let insights = InsightsEngine.generate(holdings: holdings)
        XCTAssertTrue(insights.contains { $0.id == "high_cash" })
    }

    func testNoInsightsForBalancedPortfolio() {
        let holdings = [
            PortfolioHolding(name: "BTC", symbol: "bitcoin", amount: 1, pricePerUnit: 33333, category: .crypto),
            PortfolioHolding(name: "VOO", symbol: "VOO", amount: 64, pricePerUnit: 520, category: .stock),
            PortfolioHolding(name: "USD", symbol: "USD", amount: 33333, pricePerUnit: 1, category: .fiat),
        ]
        // ~33% each
        let insights = InsightsEngine.generate(holdings: holdings)
        XCTAssertTrue(insights.isEmpty)
    }
}
