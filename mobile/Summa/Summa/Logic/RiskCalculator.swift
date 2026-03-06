import Foundation

struct RiskScore {
    let value: Int      // 0-10
    let label: String   // Conservative, Moderate, Aggressive

    static let riskWeights: [AssetCategory: Double] = [
        .fiat: 1,
        .stock: 4,
        .crypto: 8,  // average of BTC(7), ETH(8), alts(9)
    ]

    static func label(for value: Int) -> String {
        switch value {
        case 0: return "No Assets"
        case 1...3: return "Conservative"
        case 4...6: return "Moderate"
        default: return "Aggressive"
        }
    }
}

enum RiskCalculator {
    static func riskScore(holdings: [PortfolioHolding]) -> RiskScore {
        let total = PortfolioCalculator.totalValue(holdings: holdings)
        guard total > 0 else {
            return RiskScore(value: 0, label: "No Assets")
        }

        var weightedSum = 0.0
        for holding in holdings {
            let fraction = holding.totalValue / total
            let weight = RiskScore.riskWeights[holding.category] ?? 5
            weightedSum += fraction * weight
        }

        let rounded = Int(weightedSum.rounded())
        let clamped = min(max(rounded, 1), 10)
        return RiskScore(value: clamped, label: RiskScore.label(for: clamped))
    }
}
