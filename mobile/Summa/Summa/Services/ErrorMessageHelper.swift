import Foundation

enum PriceErrorMessage {
    static func userMessage(from error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                return "No internet connection. Pull down to retry."
            case .timedOut:
                return "Request timed out. Pull down to retry."
            case .cannotFindHost, .cannotConnectToHost, .secureConnectionFailed:
                return "Server unavailable. Pull down to retry."
            default:
                return "Network error. Pull down to retry."
            }
        }

        if let apiError = error as? PriceAPIClient.APIError {
            switch apiError {
            case .serverError:
                return "Server unavailable. Pull down to retry."
            case .invalidURL:
                return "Configuration error. Please reinstall the app."
            }
        }

        return "Couldn't load prices. Pull down to retry."
    }

    static let partialFailureMessage = "Some prices could not be loaded."
}
