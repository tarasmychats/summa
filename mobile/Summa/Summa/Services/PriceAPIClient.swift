import Foundation

class PriceAPIClient {
    static let shared = PriceAPIClient()

    // TODO: Change to production URL before App Store release
    // Use localhost for simulator, local IP for physical device
    #if targetEnvironment(simulator)
    private let baseURL = "http://localhost:3001/api"
    #else
    private let baseURL = "http://192.168.1.171:3001/api"
    #endif

    func fetchPrices(
        assets: [Asset],
        baseCurrency: String
    ) async throws -> [AssetPriceData] {
        guard let url = URL(string: "\(baseURL)/prices") else {
            throw APIError.invalidURL
        }

        let requestBody = PriceRequestBody(
            assets: assets.map { asset in
                AssetRequest(id: asset.symbol, category: asset.category)
            },
            baseCurrency: baseCurrency
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError
        }

        let decoded = try JSONDecoder().decode(PriceResponseBody.self, from: data)
        return decoded.prices
    }

    func searchAssets(query: String) async throws -> [SearchResultItem] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            return []
        }

        var components = URLComponents(string: "\(baseURL)/search")
        components?.queryItems = [URLQueryItem(name: "q", value: query)]

        guard let url = components?.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError
        }

        let decoded = try JSONDecoder().decode(SearchResponseBody.self, from: data)
        return decoded.results
    }

    func fetchHistory(
        assets: [(id: String, category: String)],
        from: Date,
        to: Date,
        currency: String
    ) async throws -> [String: [HistoryDataPoint]] {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = TimeZone(identifier: "UTC")

        var components = URLComponents(string: "\(baseURL)/history")
        components?.queryItems = [
            URLQueryItem(name: "assets", value: assets.map(\.id).joined(separator: ",")),
            URLQueryItem(name: "categories", value: assets.map(\.category).joined(separator: ",")),
            URLQueryItem(name: "from", value: dateFormatter.string(from: from)),
            URLQueryItem(name: "to", value: dateFormatter.string(from: to)),
            URLQueryItem(name: "currency", value: currency.lowercased()),
        ]

        guard let url = components?.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError
        }

        let decoded = try JSONDecoder().decode(HistoryResponseBody.self, from: data)
        return decoded.history
    }

    enum APIError: Error, LocalizedError {
        case invalidURL
        case serverError

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid API URL"
            case .serverError: return "Server error. Please try again."
            }
        }
    }
}
