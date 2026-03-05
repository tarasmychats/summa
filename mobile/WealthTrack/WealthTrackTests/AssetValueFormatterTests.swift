import XCTest
@testable import WealthTrack

final class AssetValueFormatterTests: XCTestCase {

    private func makeAsset(name: String, symbol: String, amount: Double, category: AssetCategory = .crypto) -> Asset {
        Asset(name: name, symbol: symbol, ticker: symbol.uppercased(), category: category, amount: amount)
    }

    func testFormattedValueWithMatchingHolding() {
        let asset = makeAsset(name: "Bitcoin", symbol: "bitcoin", amount: 1.5)
        let holdings = [
            PortfolioHolding(name: "Bitcoin", amount: 1.5, pricePerUnit: 60000, category: .crypto)
        ]
        let result = AssetValueFormatter.formattedValue(for: asset, holdings: holdings, currencyCode: "USD")
        // 1.5 * 60000 = 90000 — should contain "90" and not be the placeholder
        XCTAssertNotEqual(result, "—")
        XCTAssertTrue(result.contains("90"), "Expected formatted value to contain '90' (for $90,000), got: \(result)")
    }

    func testFormattedValueReturnsPlaceholderWhenNoHolding() {
        let asset = makeAsset(name: "Ethereum", symbol: "ethereum", amount: 10)
        let holdings: [PortfolioHolding] = []
        let result = AssetValueFormatter.formattedValue(for: asset, holdings: holdings, currencyCode: "USD")
        XCTAssertEqual(result, "—")
    }

    func testFormattedValueReturnsPlaceholderWhenPriceIsZero() {
        let asset = makeAsset(name: "Bitcoin", symbol: "bitcoin", amount: 1)
        let holdings = [
            PortfolioHolding(name: "Bitcoin", amount: 1, pricePerUnit: 0, category: .crypto)
        ]
        let result = AssetValueFormatter.formattedValue(for: asset, holdings: holdings, currencyCode: "USD")
        XCTAssertEqual(result, "—")
    }

    func testFormattedValueWithEURCurrency() {
        let asset = makeAsset(name: "VOO", symbol: "VOO", amount: 10, category: .stock)
        let holdings = [
            PortfolioHolding(name: "VOO", amount: 10, pricePerUnit: 500, category: .stock)
        ]
        let result = AssetValueFormatter.formattedValue(for: asset, holdings: holdings, currencyCode: "EUR")
        // 10 * 500 = 5000 — should contain "5" and not be placeholder
        XCTAssertNotEqual(result, "—")
        XCTAssertTrue(result.contains("5"), "Expected formatted EUR value containing '5' (for 5000), got: \(result)")
    }

    func testFormatCurrencyPrecision() {
        let result = AssetValueFormatter.formatCurrency(1234.567, code: "USD")
        // Should round to 2 decimal places and contain the digits 1234
        // Normalize by removing non-digit characters except dot
        let digits = result.filter { $0.isNumber || $0 == "." }
        XCTAssertTrue(digits.contains("123457") || digits.contains("1234.57"),
                       "Expected rounded value 1234.57, got: \(result) (digits: \(digits))")
    }

    func testFormattedValueMatchesByAssetName() {
        let asset = makeAsset(name: "Bitcoin", symbol: "bitcoin", amount: 2)
        let holdings = [
            PortfolioHolding(name: "Ethereum", amount: 10, pricePerUnit: 3000, category: .crypto),
            PortfolioHolding(name: "Bitcoin", amount: 2, pricePerUnit: 50000, category: .crypto),
        ]
        let result = AssetValueFormatter.formattedValue(for: asset, holdings: holdings, currencyCode: "USD")
        // 2 * 50000 = 100000 — should match Bitcoin, not Ethereum
        XCTAssertNotEqual(result, "—")
        XCTAssertTrue(result.contains("100"), "Expected formatted value to contain '100' (for $100,000), got: \(result)")
    }
}
