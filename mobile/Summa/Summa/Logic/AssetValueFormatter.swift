import Foundation

enum AssetValueFormatter {
    /// Returns a formatted fiat value string for an asset based on its holdings data.
    /// Returns "\u{2014}" if no price data is available for the asset.
    static func formattedValue(
        for asset: Asset,
        holdings: [PortfolioHolding],
        currencyCode: String
    ) -> String {
        guard let holding = holdings.first(where: { $0.id == asset.id }),
              holding.pricePerUnit > 0 else {
            return "\u{2014}"
        }
        let value = asset.currentAmount * holding.pricePerUnit
        return formatCurrency(value, code: currencyCode)
    }

    /// Formats a value as currency with appropriate precision.
    static func formatCurrency(_ value: Double, code: String) -> String {
        value.formatted(.currency(code: code).precision(.fractionLength(0...2)))
    }

    /// Compact price for chart Y-axis labels (e.g. "92K $", "1.2M \u{20AC}").
    static func compactPrice(_ value: Double, code: String) -> String {
        let symbol = code.uppercased() == "EUR" ? "\u{20AC}" : "$"
        let abs = Swift.abs(value)
        let sign = value < 0 ? "-" : ""
        if abs >= 1_000_000 {
            return "\(sign)\(formatCompact(abs / 1_000_000))M \(symbol)"
        } else if abs >= 1_000 {
            return "\(sign)\(formatCompact(abs / 1_000))K \(symbol)"
        } else {
            return "\(sign)\(formatCompact(abs)) \(symbol)"
        }
    }

    private static func formatCompact(_ value: Double) -> String {
        if value == value.rounded(.towardZero) && value < 10000 {
            return String(format: "%.0f", value)
        }
        return String(format: "%.1f", value)
    }
}
