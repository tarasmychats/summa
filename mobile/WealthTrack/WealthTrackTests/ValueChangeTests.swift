import XCTest
@testable import WealthTrack

final class ValueChangeTests: XCTestCase {

    // MARK: - Positive change

    func testPositiveChange() {
        let change = PortfolioCalculator.valueChange(currentValue: 10500, previousValue: 10000)
        XCTAssertNotNil(change)
        XCTAssertEqual(change!.amount, 500, accuracy: 0.01)
        XCTAssertEqual(change!.percent, 5.0, accuracy: 0.01)
        XCTAssertTrue(change!.isPositive)
    }

    // MARK: - Negative change

    func testNegativeChange() {
        let change = PortfolioCalculator.valueChange(currentValue: 9500, previousValue: 10000)
        XCTAssertNotNil(change)
        XCTAssertEqual(change!.amount, -500, accuracy: 0.01)
        XCTAssertEqual(change!.percent, -5.0, accuracy: 0.01)
        XCTAssertFalse(change!.isPositive)
    }

    // MARK: - Zero change

    func testZeroChange() {
        let change = PortfolioCalculator.valueChange(currentValue: 10000, previousValue: 10000)
        XCTAssertNotNil(change)
        XCTAssertEqual(change!.amount, 0, accuracy: 0.01)
        XCTAssertEqual(change!.percent, 0, accuracy: 0.01)
        XCTAssertTrue(change!.isPositive)
    }

    // MARK: - No previous data

    func testNoPreviousValueReturnsNil() {
        let change = PortfolioCalculator.valueChange(currentValue: 10000, previousValue: nil)
        XCTAssertNil(change)
    }

    // MARK: - Previous value is zero

    func testZeroPreviousValueReturnsNil() {
        let change = PortfolioCalculator.valueChange(currentValue: 10000, previousValue: 0)
        XCTAssertNil(change)
    }

    // MARK: - Large percentage change

    func testLargePercentageChange() {
        let change = PortfolioCalculator.valueChange(currentValue: 20000, previousValue: 10000)
        XCTAssertNotNil(change)
        XCTAssertEqual(change!.amount, 10000, accuracy: 0.01)
        XCTAssertEqual(change!.percent, 100.0, accuracy: 0.01)
    }

    // MARK: - Small fractional change

    func testSmallFractionalChange() {
        let change = PortfolioCalculator.valueChange(currentValue: 10001, previousValue: 10000)
        XCTAssertNotNil(change)
        XCTAssertEqual(change!.amount, 1.0, accuracy: 0.01)
        XCTAssertEqual(change!.percent, 0.01, accuracy: 0.001)
    }
}
