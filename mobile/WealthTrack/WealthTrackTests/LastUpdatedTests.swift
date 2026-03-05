import XCTest
@testable import WealthTrack

final class LastUpdatedTests: XCTestCase {

    // MARK: - Initial state

    func testLastUpdatedIsNilByDefault() {
        let viewModel = DashboardViewModel()
        XCTAssertNil(viewModel.lastUpdated)
    }

    // MARK: - After setting lastUpdated

    func testLastUpdatedIsRecentDate() {
        let viewModel = DashboardViewModel()
        let before = Date()
        viewModel.lastUpdated = Date()
        let after = Date()

        XCTAssertNotNil(viewModel.lastUpdated)
        XCTAssertGreaterThanOrEqual(viewModel.lastUpdated!, before)
        XCTAssertLessThanOrEqual(viewModel.lastUpdated!, after)
    }

    // MARK: - Overwrite on subsequent updates

    func testLastUpdatedOverwritesOnSubsequentSet() {
        let viewModel = DashboardViewModel()
        let first = Date(timeIntervalSinceNow: -60)
        viewModel.lastUpdated = first

        let second = Date()
        viewModel.lastUpdated = second

        XCTAssertEqual(viewModel.lastUpdated, second)
    }
}
