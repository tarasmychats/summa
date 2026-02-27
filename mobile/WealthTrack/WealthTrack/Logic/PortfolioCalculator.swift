import Foundation

struct PortfolioHolding {
    let name: String
    let amount: Double
    let pricePerUnit: Double
    let category: AssetCategory

    var totalValue: Double {
        amount * pricePerUnit
    }
}

enum PortfolioCalculator {
    static func totalValue(holdings: [PortfolioHolding]) -> Double {
        holdings.reduce(0) { $0 + $1.totalValue }
    }

    static func categoryBreakdown(holdings: [PortfolioHolding]) -> [AssetCategory: Double] {
        let total = totalValue(holdings: holdings)
        guard total > 0 else { return [:] }

        var breakdown: [AssetCategory: Double] = [:]
        for category in AssetCategory.allCases {
            let categoryTotal = holdings
                .filter { $0.category == category }
                .reduce(0) { $0 + $1.totalValue }
            if categoryTotal > 0 {
                breakdown[category] = categoryTotal / total
            }
        }
        return breakdown
    }
}
