import XCTest
@testable import Summa

final class DuplicateAssetDetectorTests: XCTestCase {

    private func makeAsset(symbol: String) -> Asset {
        Asset(name: "Test", symbol: symbol, ticker: symbol.uppercased(), category: .crypto, currentAmount: 1)
    }

    private func makeDefinition(id: String) -> AssetDefinition {
        AssetDefinition(id: id, name: "Test", symbol: "TST", category: .crypto)
    }

    func testExistingAssetIDsReturnsSymbols() {
        let assets = [
            makeAsset(symbol: "bitcoin"),
            makeAsset(symbol: "VOO"),
            makeAsset(symbol: "USD"),
        ]
        let ids = DuplicateAssetDetector.existingAssetIDs(from: assets)
        XCTAssertEqual(ids, ["bitcoin", "VOO", "USD"])
    }

    func testExistingAssetIDsEmptyPortfolio() {
        let ids = DuplicateAssetDetector.existingAssetIDs(from: [])
        XCTAssertTrue(ids.isEmpty)
    }

    func testIsAlreadyAddedReturnsTrueForExistingAsset() {
        let existingIDs: Set<String> = ["bitcoin", "VOO"]
        let definition = makeDefinition(id: "bitcoin")
        XCTAssertTrue(DuplicateAssetDetector.isAlreadyAdded(definition, existingIDs: existingIDs))
    }

    func testIsAlreadyAddedReturnsFalseForNewAsset() {
        let existingIDs: Set<String> = ["bitcoin", "VOO"]
        let definition = makeDefinition(id: "ethereum")
        XCTAssertFalse(DuplicateAssetDetector.isAlreadyAdded(definition, existingIDs: existingIDs))
    }

    func testIsAlreadyAddedReturnsFalseForEmptyPortfolio() {
        let existingIDs: Set<String> = []
        let definition = makeDefinition(id: "bitcoin")
        XCTAssertFalse(DuplicateAssetDetector.isAlreadyAdded(definition, existingIDs: existingIDs))
    }

    func testMatchIsCaseSensitive() {
        let existingIDs: Set<String> = ["bitcoin"]
        let definition = makeDefinition(id: "Bitcoin")
        // API IDs are case-sensitive — "Bitcoin" != "bitcoin"
        XCTAssertFalse(DuplicateAssetDetector.isAlreadyAdded(definition, existingIDs: existingIDs))
    }

    func testDuplicatesInPortfolioDeduplicatedInSet() {
        let assets = [
            makeAsset(symbol: "bitcoin"),
            makeAsset(symbol: "bitcoin"),
        ]
        let ids = DuplicateAssetDetector.existingAssetIDs(from: assets)
        XCTAssertEqual(ids.count, 1)
        XCTAssertTrue(ids.contains("bitcoin"))
    }
}
