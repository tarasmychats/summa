import Foundation

enum AssetValueFormatter {
    /// Returns a formatted fiat value string for an asset based on its holdings data.
    /// Returns "—" if no price data is available for the asset.
    static func formattedValue(
        for asset: Asset,
        holdings: [PortfolioHolding],
        currencyCode: String
    ) -> String {
        guard let holding = holdings.first(where: { $0.name == asset.name }),
              holding.pricePerUnit > 0 else {
            return "—"
        }
        let value = asset.currentAmount * holding.pricePerUnit
        return formatCurrency(value, code: currencyCode)
    }

    /// Formats a value as currency with appropriate precision.
    static func formatCurrency(_ value: Double, code: String) -> String {
        value.formatted(.currency(code: code).precision(.fractionLength(0...2)))
    }
}
