import XCTest
@testable import Summa

final class TransactionMarkerBuilderTests: XCTestCase {

    private func date(_ string: String) -> Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.date(from: string)!
    }

    private func makeTxn(id: String = UUID().uuidString, assetId: String = "btc", amount: Double, dateStr: String) -> Transaction {
        Transaction(
            id: id,
            userId: "u1",
            assetId: assetId,
            type: "delta",
            amount: amount,
            note: nil,
            date: dateStr + "T00:00:00.000Z",
            createdAt: dateStr + "T00:00:00.000Z"
        )
    }

    func testBuildMarkersGroupsByDay() {
        let dataPoints = [
            PortfolioDataPoint(id: 0, date: date("2025-03-01"), value: 1000),
            PortfolioDataPoint(id: 1, date: date("2025-03-02"), value: 1100),
            PortfolioDataPoint(id: 2, date: date("2025-03-03"), value: 1200),
        ]
        let txns: [String: [Transaction]] = [
            "btc": [
                makeTxn(assetId: "btc", amount: 0.1, dateStr: "2025-03-01"),
                makeTxn(assetId: "btc", amount: 0.2, dateStr: "2025-03-01"),
                makeTxn(assetId: "btc", amount: -0.05, dateStr: "2025-03-03"),
            ]
        ]

        let markers = TransactionMarkerBuilder.buildMarkers(
            dataPoints: dataPoints,
            transactionsByAsset: txns
        )

        XCTAssertEqual(markers.count, 2)

        let mar1 = markers.first(where: { $0.id == "2025-03-01" })
        XCTAssertNotNil(mar1)
        XCTAssertEqual(mar1?.transactions.count, 2)
        XCTAssertEqual(mar1?.value, 1000)
        XCTAssertTrue(mar1?.isPositive ?? false)
        XCTAssertTrue(mar1?.isGrouped ?? false)

        let mar3 = markers.first(where: { $0.id == "2025-03-03" })
        XCTAssertNotNil(mar3)
        XCTAssertEqual(mar3?.transactions.count, 1)
        XCTAssertEqual(mar3?.value, 1200)
        XCTAssertFalse(mar3?.isPositive ?? true)
        XCTAssertFalse(mar3?.isGrouped ?? true)
    }

    func testBuildMarkersEmptyTransactions() {
        let dataPoints = [
            PortfolioDataPoint(id: 0, date: date("2025-03-01"), value: 1000),
        ]
        let txns: [String: [Transaction]] = [:]

        let markers = TransactionMarkerBuilder.buildMarkers(
            dataPoints: dataPoints,
            transactionsByAsset: txns
        )

        XCTAssertTrue(markers.isEmpty)
    }

    func testBuildMarkersIgnoresTransactionsWithoutDataPoints() {
        let dataPoints = [
            PortfolioDataPoint(id: 0, date: date("2025-03-01"), value: 1000),
        ]
        let txns: [String: [Transaction]] = [
            "btc": [
                makeTxn(assetId: "btc", amount: 0.1, dateStr: "2025-03-05"),
            ]
        ]

        let markers = TransactionMarkerBuilder.buildMarkers(
            dataPoints: dataPoints,
            transactionsByAsset: txns
        )

        XCTAssertTrue(markers.isEmpty)
    }

    func testBuildMarkersMultipleAssetsOnSameDay() {
        let dataPoints = [
            PortfolioDataPoint(id: 0, date: date("2025-03-01"), value: 5000),
        ]
        let txns: [String: [Transaction]] = [
            "btc": [makeTxn(assetId: "btc", amount: 0.1, dateStr: "2025-03-01")],
            "eth": [makeTxn(assetId: "eth", amount: -1.0, dateStr: "2025-03-01")],
        ]

        let markers = TransactionMarkerBuilder.buildMarkers(
            dataPoints: dataPoints,
            transactionsByAsset: txns
        )

        XCTAssertEqual(markers.count, 1)
        XCTAssertEqual(markers.first?.transactions.count, 2)
    }
}
