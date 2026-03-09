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

// MARK: - User Settings (API version, not SwiftData)

struct APIUserSettings: Codable, Equatable {
    let id: String
    let userId: String
    let displayCurrency: String
    let isPremium: Bool
}

// MARK: - User Asset (API version)

struct APIAsset: Codable, Identifiable, Equatable {
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
}

struct CreateAssetRequest: Codable {
    let name: String
    let symbol: String
    let ticker: String
    let category: String
    let amount: Double
}

struct AssetListResponse: Codable {
    let assets: [APIAsset]
}

struct AssetResponse: Codable {
    let asset: APIAsset
}

// MARK: - Transaction (API version)

struct APITransaction: Codable, Identifiable, Equatable {
    let id: String
    let userId: String
    let assetId: String
    let type: String
    let amount: Double
    let note: String?
    let date: String
    let createdAt: String
}

struct CreateTransactionRequest: Codable {
    let type: String
    let amount: Double
    let date: String
    let note: String?
}

struct TransactionListResponse: Codable {
    let transactions: [APITransaction]
}

struct TransactionResponse: Codable {
    let transaction: APITransaction
}
