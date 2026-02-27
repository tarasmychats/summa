import Foundation
import SwiftData

@Model
final class Asset {
    var id: UUID
    var name: String        // e.g., "Bitcoin", "S&P 500 ETF", "US Dollar"
    var symbol: String      // API ID — e.g., "bitcoin" (CoinGecko), "VOO" (Yahoo), "USD"
    var ticker: String = "" // Display symbol — e.g., "BTC", "VOO", "USD"
    var category: String    // raw value of AssetCategory
    var amount: Double      // how much user owns (e.g., 1.5 BTC, 5000 USD)
    var createdAt: Date

    var assetCategory: AssetCategory {
        AssetCategory(rawValue: category) ?? .fiat
    }

    /// Ticker for display; falls back to symbol for older assets without ticker
    var displayTicker: String {
        ticker.isEmpty ? symbol.uppercased() : ticker
    }

    init(name: String, symbol: String, ticker: String = "", category: AssetCategory, amount: Double) {
        self.id = UUID()
        self.name = name
        self.symbol = symbol
        self.ticker = ticker
        self.category = category.rawValue
        self.amount = amount
        self.createdAt = Date()
    }
}
