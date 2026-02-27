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
