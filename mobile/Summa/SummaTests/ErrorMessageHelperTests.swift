import XCTest
@testable import Summa

final class ErrorMessageHelperTests: XCTestCase {

    // MARK: - URLError mapping

    func testNoInternetConnection() {
        let error = URLError(.notConnectedToInternet)
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "No internet connection. Pull down to retry.")
    }

    func testNetworkConnectionLost() {
        let error = URLError(.networkConnectionLost)
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "No internet connection. Pull down to retry.")
    }

    func testTimedOut() {
        let error = URLError(.timedOut)
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "Request timed out. Pull down to retry.")
    }

    func testCannotFindHost() {
        let error = URLError(.cannotFindHost)
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "Server unavailable. Pull down to retry.")
    }

    func testCannotConnectToHost() {
        let error = URLError(.cannotConnectToHost)
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "Server unavailable. Pull down to retry.")
    }

    func testSecureConnectionFailed() {
        let error = URLError(.secureConnectionFailed)
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "Server unavailable. Pull down to retry.")
    }

    func testOtherURLError() {
        let error = URLError(.badURL)
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "Network error. Pull down to retry.")
    }

    // MARK: - APIError mapping

    func testServerError() {
        let error = PriceAPIClient.APIError.serverError
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "Server unavailable. Pull down to retry.")
    }

    func testInvalidURLError() {
        let error = PriceAPIClient.APIError.invalidURL
        let message = PriceErrorMessage.userMessage(from: error)
        XCTAssertEqual(message, "Configuration error. Please reinstall the app.")
    }

    // MARK: - Unknown error fallback

    func testUnknownError() {
        struct SomeError: Error {}
        let message = PriceErrorMessage.userMessage(from: SomeError())
        XCTAssertEqual(message, "Couldn't load prices. Pull down to retry.")
    }

    // MARK: - Partial failure message

    func testPartialFailureMessage() {
        XCTAssertEqual(PriceErrorMessage.partialFailureMessage, "Some prices could not be loaded.")
    }
}
