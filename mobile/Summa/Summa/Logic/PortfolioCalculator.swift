import Foundation

struct PortfolioHolding: Identifiable {
    let id: String
    let name: String
    let symbol: String
    let amount: Double
    let pricePerUnit: Double
    let category: AssetCategory

    var totalValue: Double {
        amount * pricePerUnit
    }

    init(id: String = UUID().uuidString, name: String, symbol: String, amount: Double, pricePerUnit: Double, category: AssetCategory) {
        self.id = id
        self.name = name
        self.symbol = symbol
        self.amount = amount
        self.pricePerUnit = pricePerUnit
        self.category = category
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
        guard change != 0 else { return nil }
        let percentChange = (change / previousValue) * 100
        return ValueChange(amount: change, percent: percentChange)
    }

    /// UTC calendar used for date comparisons to match the UTC date strings from the API
    static let utcCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }()

    /// Replay transactions up to a given date to determine asset amount at that point in time.
    /// Transactions must be pre-sorted by date ascending.
    static func amountAtDate(date: Date, transactions: [Transaction], fallbackAmount: Double) -> Double {
        guard !transactions.isEmpty else { return fallbackAmount }

        let relevant = transactions.filter { utcCalendar.startOfDay(for: $0.parsedDate) <= utcCalendar.startOfDay(for: date) }
        guard !relevant.isEmpty else { return 0.0 }

        return relevant.reduce(0.0) { $0 + $1.amount }
    }

    /// Returns true when every holding is fiat with a symbol matching the display currency.
    static func allFiatMatchingCurrency(holdings: [PortfolioHolding], currency: String) -> Bool {
        guard !holdings.isEmpty else { return false }
        let uppercased = currency.uppercased()
        return holdings.allSatisfy { $0.category == .fiat && $0.symbol.uppercased() == uppercased }
    }
}

struct ValueChange {
    let amount: Double
    let percent: Double

    var isPositive: Bool { amount > 0 }
}
