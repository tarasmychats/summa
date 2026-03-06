# Two Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) Create an initial snapshot transaction when adding an asset, (2) Show a straight-line chart for fiat-only portfolios matching the display currency.

**Architecture:** Feature 1 adds a transaction creation call in `AddAssetView.saveAsset()`. Feature 2 adds a guard in `PortfolioChartView.loadHistory()` that generates synthetic data points locally when all assets are fiat matching the display currency.

**Tech Stack:** SwiftUI, SwiftData, Swift Charts, XCTest

---

### Task 1: Create initial snapshot transaction on asset add

**Files:**
- Modify: `mobile/Summa/Summa/Views/AddAssetView.swift:259-275` (`saveAsset` function)

**Step 1: Add transaction creation in `saveAsset()`**

In `mobile/Summa/Summa/Views/AddAssetView.swift`, replace the `saveAsset` function (lines 259-275) with:

```swift
private func saveAsset(_ definition: AssetDefinition) {
    guard let value = parsedAmount, value > 0 else { return }

    let asset = Asset(
        name: definition.name,
        symbol: definition.id,
        ticker: definition.symbol,
        category: definition.category,
        amount: value
    )
    modelContext.insert(asset)

    let txn = Transaction(date: Date(), type: .snapshot, amount: value)
    txn.asset = asset
    modelContext.insert(txn)

    try? modelContext.save()
    savedTrigger += 1
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
        dismiss()
    }
}
```

**Step 2: Build and verify**

Run: `cd mobile/Summa && xcodebuild build -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -quiet`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add mobile/Summa/Summa/Views/AddAssetView.swift
git commit -m "feat: create initial snapshot transaction when adding asset"
```

---

### Task 2: Add helper to detect fiat-only portfolio matching display currency

**Files:**
- Modify: `mobile/Summa/Summa/Logic/PortfolioCalculator.swift:25` (add static method)
- Test: `mobile/Summa/SummaTests/PortfolioCalculatorTests.swift`

**Step 1: Write failing tests**

Append to `mobile/Summa/SummaTests/PortfolioCalculatorTests.swift`:

```swift
// MARK: - Fiat-Only Detection

func testAllFiatMatchingCurrency_singleUSD() {
    let holdings = [
        PortfolioHolding(name: "USD", symbol: "USD", amount: 5000, pricePerUnit: 1, category: .fiat)
    ]
    XCTAssertTrue(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
}

func testAllFiatMatchingCurrency_multipleUSD() {
    let holdings = [
        PortfolioHolding(name: "USD Cash", symbol: "USD", amount: 5000, pricePerUnit: 1, category: .fiat),
        PortfolioHolding(name: "USD Savings", symbol: "USD", amount: 3000, pricePerUnit: 1, category: .fiat)
    ]
    XCTAssertTrue(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
}

func testAllFiatMatchingCurrency_eurWithEurDisplay() {
    let holdings = [
        PortfolioHolding(name: "EUR", symbol: "EUR", amount: 1000, pricePerUnit: 1, category: .fiat)
    ]
    XCTAssertTrue(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "EUR"))
}

func testAllFiatMatchingCurrency_mixedPortfolio() {
    let holdings = [
        PortfolioHolding(name: "USD", symbol: "USD", amount: 5000, pricePerUnit: 1, category: .fiat),
        PortfolioHolding(name: "Bitcoin", symbol: "bitcoin", amount: 1, pricePerUnit: 95000, category: .crypto)
    ]
    XCTAssertFalse(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
}

func testAllFiatMatchingCurrency_fiatNotMatchingCurrency() {
    let holdings = [
        PortfolioHolding(name: "EUR", symbol: "EUR", amount: 1000, pricePerUnit: 1, category: .fiat)
    ]
    XCTAssertFalse(PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: "USD"))
}

func testAllFiatMatchingCurrency_emptyPortfolio() {
    XCTAssertFalse(PortfolioCalculator.allFiatMatchingCurrency(holdings: [], currency: "USD"))
}
```

**Step 2: Run tests to verify they fail**

Run: `cd mobile/Summa && xcodebuild test -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:SummaTests/PortfolioCalculatorTests -quiet 2>&1 | tail -20`
Expected: FAIL — `allFiatMatchingCurrency` not found

**Step 3: Implement the helper**

Add to `mobile/Summa/Summa/Logic/PortfolioCalculator.swift` inside `enum PortfolioCalculator`, after the `amountAtDate` method (after line 88):

```swift
/// Returns true when every holding is fiat with a symbol matching the display currency.
static func allFiatMatchingCurrency(holdings: [PortfolioHolding], currency: String) -> Bool {
    guard !holdings.isEmpty else { return false }
    let uppercased = currency.uppercased()
    return holdings.allSatisfy { $0.category == .fiat && $0.symbol.uppercased() == uppercased }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd mobile/Summa && xcodebuild test -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:SummaTests/PortfolioCalculatorTests -quiet 2>&1 | tail -20`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add mobile/Summa/Summa/Logic/PortfolioCalculator.swift mobile/Summa/SummaTests/PortfolioCalculatorTests.swift
git commit -m "feat: add allFiatMatchingCurrency helper to PortfolioCalculator"
```

---

### Task 3: Generate synthetic chart data for fiat-only portfolios

**Files:**
- Modify: `mobile/Summa/Summa/Views/PortfolioChartView.swift:261-290` (`loadHistory` function)

**Step 1: Add fiat-only check in `loadHistory()`**

In `mobile/Summa/Summa/Views/PortfolioChartView.swift`, replace the `loadHistory()` function (lines 261-290) with:

```swift
private func loadHistory() async {
    guard !assets.isEmpty else {
        dataPoints = []
        return
    }

    // For fiat-only portfolios matching display currency, generate data locally
    let holdings = assets.map {
        PortfolioHolding(name: $0.name, symbol: $0.symbol, amount: $0.currentAmount, pricePerUnit: 1, category: $0.assetCategory)
    }
    if PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: currency) {
        dataPoints = generateFiatDataPoints(assets: assets)
        return
    }

    isLoading = true
    errorMessage = nil

    let fromDate = selectedRange.startDate
    let toDate = Date()

    let assetParams = assets.map { (id: $0.symbol, category: $0.category) }

    do {
        let history = try await PriceAPIClient.shared.fetchHistory(
            assets: assetParams,
            from: fromDate,
            to: toDate,
            currency: currency.lowercased()
        )

        dataPoints = computePortfolioSeries(history: history, assets: assets, from: fromDate, to: toDate)
    } catch {
        errorMessage = "Could not load chart data"
        dataPoints = []
    }

    isLoading = false
}
```

**Step 2: Add the `generateFiatDataPoints` helper**

Add this method to `PortfolioChartView` (after `computePortfolioSeries`, before the closing `}`):

```swift
/// Generate daily data points for fiat-only portfolios (price = 1.0, value = amount).
private func generateFiatDataPoints(assets: [Asset]) -> [PortfolioDataPoint] {
    let calendar = PortfolioCalculator.utcCalendar
    let fromDate = calendar.startOfDay(for: selectedRange.startDate)
    let toDate = calendar.startOfDay(for: Date())

    let assetTransactions: [(asset: Asset, sortedTxns: [Transaction])] = assets.map { asset in
        let txns = (asset.transactions ?? []).sorted { $0.date < $1.date }
        return (asset, txns)
    }

    var results: [PortfolioDataPoint] = []
    var current = fromDate
    var index = 0

    while current <= toDate {
        var dayTotal = 0.0
        for (asset, sortedTxns) in assetTransactions {
            dayTotal += PortfolioCalculator.amountAtDate(
                date: current,
                transactions: sortedTxns,
                fallbackAmount: asset.amount
            )
        }
        results.append(PortfolioDataPoint(id: index, date: current, value: dayTotal))
        index += 1
        current = calendar.date(byAdding: .day, value: 1, to: current)!
    }

    return results
}
```

**Step 3: Build and verify**

Run: `cd mobile/Summa && xcodebuild build -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -quiet`
Expected: BUILD SUCCEEDED

**Step 4: Run all tests**

Run: `cd mobile/Summa && xcodebuild test -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -quiet 2>&1 | tail -20`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add mobile/Summa/Summa/Views/PortfolioChartView.swift
git commit -m "feat: show straight-line chart for fiat-only portfolios matching display currency"
```
