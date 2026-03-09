import Foundation

final class UserAPIClient {
    static let shared = UserAPIClient()

    // TODO: Change to production URL before App Store release
    // Use localhost for simulator, local IP for physical device
    #if targetEnvironment(simulator)
    private let baseURL = "http://localhost:3001/api"
    #else
    private let baseURL = "http://192.168.1.171:3001/api"
    #endif

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    private init() {}

    func get<T: Decodable>(path: String) async throws -> T {
        let request = try buildRequest(method: "GET", path: path)
        return try await execute(request)
    }

    func post<T: Decodable, B: Encodable>(path: String, body: B?, authenticated: Bool = true) async throws -> T {
        var request = try buildRequest(method: "POST", path: path, authenticated: authenticated)
        if let body {
            request.httpBody = try encoder.encode(body)
        }
        return try await execute(request)
    }

    func patch<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = try buildRequest(method: "PATCH", path: path)
        request.httpBody = try encoder.encode(body)
        return try await execute(request)
    }

    func delete(path: String) async throws {
        let request = try buildRequest(method: "DELETE", path: path)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PriceAPIClient.APIError.serverError }
        if http.statusCode == 401 {
            try await AuthManager.shared.refreshAccessToken()
            let retry = try buildRequest(method: "DELETE", path: path)
            let (_, retryResponse) = try await URLSession.shared.data(for: retry)
            guard let retryHttp = retryResponse as? HTTPURLResponse, retryHttp.statusCode == 200 else {
                throw PriceAPIClient.APIError.serverError
            }
            return
        }
        guard http.statusCode == 200 else { throw PriceAPIClient.APIError.serverError }
    }

    private func buildRequest(method: String, path: String, authenticated: Bool = true) throws -> URLRequest {
        guard let url = URL(string: baseURL + path) else { throw PriceAPIClient.APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if authenticated, let token = AuthManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PriceAPIClient.APIError.serverError }

        if http.statusCode == 401 {
            try await AuthManager.shared.refreshAccessToken()
            var retry = request
            if let token = AuthManager.shared.accessToken {
                retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            let (retryData, retryResponse) = try await URLSession.shared.data(for: retry)
            guard let retryHttp = retryResponse as? HTTPURLResponse,
                  (200...299).contains(retryHttp.statusCode) else {
                throw PriceAPIClient.APIError.serverError
            }
            return try decoder.decode(T.self, from: retryData)
        }

        guard (200...299).contains(http.statusCode) else {
            throw PriceAPIClient.APIError.serverError
        }

        return try decoder.decode(T.self, from: data)
    }
}
