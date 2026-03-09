import Foundation
import AuthenticationServices

@MainActor
@Observable
final class AuthManager {
    static let shared = AuthManager()

    private(set) var isAuthenticated = false
    private(set) var userId: String?
    private(set) var authType: String = "anonymous"

    private let accessTokenKey = "summa_access_token"
    private let refreshTokenKey = "summa_refresh_token"

    var accessToken: String? {
        KeychainHelper.load(key: accessTokenKey)
    }

    private init() {
        if KeychainHelper.load(key: accessTokenKey) != nil {
            isAuthenticated = true
        }
    }

    func ensureAuthenticated() async throws {
        if isAuthenticated { return }
        try await createAnonymousSession()
    }

    func createAnonymousSession() async throws {
        let response: AuthResponse = try await UserAPIClient.shared.post(
            path: "/auth/anonymous",
            body: Optional<String>.none,
            authenticated: false
        )
        saveTokens(response)
    }

    func signInWithApple(identityToken: Data) async throws {
        guard let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw PriceAPIClient.APIError.serverError
        }

        let currentToken = accessToken
        if currentToken != nil && authType == "anonymous" {
            let body = ["anonymousToken": currentToken!, "identityToken": tokenString]
            let response: AuthResponse = try await UserAPIClient.shared.post(
                path: "/auth/merge",
                body: body,
                authenticated: false
            )
            saveTokens(response)
        } else {
            let body = ["identityToken": tokenString]
            let response: AuthResponse = try await UserAPIClient.shared.post(
                path: "/auth/apple",
                body: body,
                authenticated: false
            )
            saveTokens(response)
        }
        authType = "apple"
    }

    func refreshAccessToken() async throws {
        guard let refreshToken = KeychainHelper.load(key: refreshTokenKey) else {
            throw PriceAPIClient.APIError.serverError
        }

        let body = ["refreshToken": refreshToken]
        let response: RefreshResponse = try await UserAPIClient.shared.post(
            path: "/auth/refresh",
            body: body,
            authenticated: false
        )
        KeychainHelper.save(key: accessTokenKey, value: response.accessToken)
    }

    func signOut() {
        KeychainHelper.delete(key: accessTokenKey)
        KeychainHelper.delete(key: refreshTokenKey)
        isAuthenticated = false
        userId = nil
        authType = "anonymous"
    }

    func deleteAccount() async throws {
        try await UserAPIClient.shared.delete(path: "/user/account")
        signOut()
    }

    private func saveTokens(_ response: AuthResponse) {
        KeychainHelper.save(key: accessTokenKey, value: response.accessToken)
        if let refresh = response.refreshToken {
            KeychainHelper.save(key: refreshTokenKey, value: refresh)
        }
        userId = response.userId
        isAuthenticated = true
    }
}
