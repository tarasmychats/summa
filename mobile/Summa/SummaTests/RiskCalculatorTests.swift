import XCTest
@testable import Summa

final class RiskCalculatorTests: XCTestCase {

    func testAllCashIsLowRisk() {
        let holdings = [
            PortfolioHolding(name: "USD", symbol: "USD", amount: 10000, pricePerUnit: 1, category: .fiat),
        ]
        let score = RiskCalculator.riskScore(holdings: holdings)
        XCTAssertEqual(score.value, 1)
        XCTAssertEqual(score.label, "Conservative")
    }

    func testAllCryptoIsHighRisk() {
        let holdings = [
            PortfolioHolding(name: "SOL", symbol: "solana", amount: 100, pricePerUnit: 185, category: .crypto),
        ]
        let score = RiskCalculator.riskScore(holdings: holdings)
        XCTAssertGreaterThanOrEqual(score.value, 7)
        XCTAssertEqual(score.label, "Aggressive")
    }

    func testMixedPortfolio() {
        // 30% stocks (weight 4), 50% BTC (weight 8), 20% cash (weight 1)
        // Expected: 0.3*4 + 0.5*8 + 0.2*1 = 1.2 + 4.0 + 0.2 = 5.4 → 5
        let holdings = [
            PortfolioHolding(name: "S&P 500", symbol: "VOO", amount: 30, pricePerUnit: 100, category: .stock),
            PortfolioHolding(name: "Bitcoin", symbol: "bitcoin", amount: 50, pricePerUnit: 100, category: .crypto),
            PortfolioHolding(name: "USD", symbol: "USD", amount: 2000, pricePerUnit: 1, category: .fiat),
        ]
        let score = RiskCalculator.riskScore(holdings: holdings)
        XCTAssertEqual(score.value, 5)
        XCTAssertEqual(score.label, "Moderate")
    }

    func testEmptyPortfolio() {
        let score = RiskCalculator.riskScore(holdings: [])
        XCTAssertEqual(score.value, 0)
    }
}
