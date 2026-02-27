import Foundation
import SwiftData

@Model
final class Asset {
    var id: UUID
    var name: String        // e.g., "Bitcoin", "S&P 500 ETF", "US Dollar"
    var symbol: String      // e.g., "bitcoin" (CoinGecko ID), "VOO", "USD"
    var category: String    // raw value of AssetCategory
    var amount: Double      // how much user owns (e.g., 1.5 BTC, 5000 USD)
    var createdAt: Date

    var assetCategory: AssetCategory {
        AssetCategory(rawValue: category) ?? .fiat
    }

    init(name: String, symbol: String, category: AssetCategory, amount: Double) {
        self.id = UUID()
        self.name = name
        self.symbol = symbol
        self.category = category.rawValue
        self.amount = amount
        self.createdAt = Date()
    }
}
