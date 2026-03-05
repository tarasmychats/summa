import Foundation

struct PortfolioHolding {
    let name: String
    let symbol: String
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

    static func categoryPercentages(breakdown: [AssetCategory: Double]) -> [AssetCategory: Int] {
        var percentages: [AssetCategory: Int] = [:]
        for (category, fraction) in breakdown {
            percentages[category] = Int((fraction * 100).rounded())
        }
        return percentages
    }

    /// Calculate the change between current and previous portfolio values
    static func valueChange(currentValue: Double, previousValue: Double?) -> ValueChange? {
        guard let previousValue, previousValue > 0 else { return nil }
        let change = currentValue - previousValue
        let percentChange = (change / previousValue) * 100
        return ValueChange(amount: change, percent: percentChange)
    }
}

struct ValueChange {
    let amount: Double
    let percent: Double

    var isPositive: Bool { amount >= 0 }
}
