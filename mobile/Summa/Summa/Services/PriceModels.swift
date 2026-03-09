import Foundation

struct PriceRequestBody: Codable {
    let assets: [AssetRequest]
    let baseCurrency: String
}

struct AssetRequest: Codable {
    let id: String
    let category: String
}

struct PriceResponseBody: Codable {
    let prices: [AssetPriceData]
    let baseCurrency: String
    let timestamp: String
}

struct AssetPriceData: Codable {
    let id: String
    let category: String
    let price: Double
    let currency: String
    let change24h: Double?
    let updatedAt: String
}

struct HistoryResponseBody: Codable {
    let history: [String: [HistoryDataPoint]]
    let currency: String
    let from: String
    let to: String
    let resolution: String?
}

struct HistoryDataPoint: Codable {
    let date: String
    let price: Double
}

struct SearchResponseBody: Codable {
    let results: [SearchResultItem]
}

struct SearchResultItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let symbol: String
    let category: String
}
