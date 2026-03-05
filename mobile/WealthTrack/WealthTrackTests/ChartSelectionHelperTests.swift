import XCTest
@testable import WealthTrack

final class ChartSelectionHelperTests: XCTestCase {

    private func date(_ string: String) -> Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.date(from: string)!
    }

    // MARK: - nearestIndex

    func testNearestIndexExactMatch() {
        let dates = [date("2025-01-01"), date("2025-01-02"), date("2025-01-03")]
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-01-02"))
        XCTAssertEqual(result, 1)
    }

    func testNearestIndexBetweenPoints() {
        let dates = [date("2025-01-01"), date("2025-01-10"), date("2025-01-20")]
        // Jan 8 is closer to Jan 10 (2 days) than Jan 1 (7 days)
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-01-08"))
        XCTAssertEqual(result, 1)
    }

    func testNearestIndexCloserToPrevious() {
        let dates = [date("2025-01-01"), date("2025-01-10"), date("2025-01-20")]
        // Jan 3 is closer to Jan 1 (2 days) than Jan 10 (7 days)
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-01-03"))
        XCTAssertEqual(result, 0)
    }

    func testNearestIndexBeforeAllPoints() {
        let dates = [date("2025-02-01"), date("2025-03-01"), date("2025-04-01")]
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-01-01"))
        XCTAssertEqual(result, 0)
    }

    func testNearestIndexAfterAllPoints() {
        let dates = [date("2025-01-01"), date("2025-02-01"), date("2025-03-01")]
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-12-31"))
        XCTAssertEqual(result, 2)
    }

    func testNearestIndexSingleElement() {
        let dates = [date("2025-06-15")]
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-01-01"))
        XCTAssertEqual(result, 0)
    }

    func testNearestIndexEmptyArray() {
        let result = ChartSelectionHelper.nearestIndex(in: [], to: date("2025-01-01"))
        XCTAssertNil(result)
    }

    func testNearestIndexMidpointFavorsPrevious() {
        // When equidistant, should favor the earlier point (distPrev <= distCurr)
        let dates = [date("2025-01-01"), date("2025-01-03")]
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-01-02"))
        XCTAssertEqual(result, 0)
    }

    func testNearestIndexLastElement() {
        let dates = [date("2025-01-01"), date("2025-01-02"), date("2025-01-03")]
        let result = ChartSelectionHelper.nearestIndex(in: dates, to: date("2025-01-03"))
        XCTAssertEqual(result, 2)
    }
}
