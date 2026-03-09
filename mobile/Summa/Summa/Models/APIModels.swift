import Foundation

// MARK: - Auth

struct AuthResponse: Codable {
    let userId: String
    let accessToken: String
    let refreshToken: String?
}

struct RefreshResponse: Codable {
    let accessToken: String
}

// MARK: - User Settings

struct UserSettings: Codable, Equatable {
    let id: String
    let userId: String
    let displayCurrency: String
    let isPremium: Bool
}

struct UpdateSettingsRequest: Codable {
    let displayCurrency: String
}

struct SettingsResponse: Codable {
    let settings: UserSettings
}

// MARK: - Asset

struct Asset: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let symbol: String
    let ticker: String
    let category: String
    let amount: Double
    let currentAmount: Double
    let createdAt: String

    var assetCategory: AssetCategory {
        AssetCategory(rawValue: category) ?? .crypto
    }

    var displayTicker: String {
        ticker.isEmpty ? symbol.uppercased() : ticker
    }

    /// Convenience init for local construction (e.g. tests, previews)
    init(id: String = UUID().uuidString, name: String, symbol: String, ticker: String = "", category: AssetCategory, amount: Double, currentAmount: Double? = nil) {
        self.id = id
        self.name = name
        self.symbol = symbol
        self.ticker = ticker
        self.category = category.rawValue
        self.amount = amount
        self.currentAmount = currentAmount ?? amount
        self.createdAt = ISO8601DateFormatter().string(from: Date())
    }
}

struct CreateAssetRequest: Codable {
    let name: String
    let symbol: String
    let ticker: String
    let category: String
    let amount: Double
}

struct AssetListResponse: Codable {
    let assets: [Asset]
}

struct AssetResponse: Codable {
    let asset: Asset
}

// MARK: - Transaction

struct Transaction: Codable, Identifiable, Equatable {
    let id: String
    let userId: String
    let assetId: String
    let type: String
    let amount: Double
    let note: String?
    let date: String
    let createdAt: String

    /// Parsed date for display and computation
    var parsedDate: Date {
        Self.isoFormatter.date(from: date) ?? Date()
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

struct CreateTransactionRequest: Codable {
    let type: String
    let amount: Double
    let date: String
    let note: String?
}

struct TransactionListResponse: Codable {
    let transactions: [Transaction]
}

struct TransactionResponse: Codable {
    let transaction: Transaction
}
