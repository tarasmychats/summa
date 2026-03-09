# Chart Transaction Markers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show colored dot markers on the portfolio value chart at dates where the user had transactions, with tap and drag interactions to see transaction details.

**Architecture:** Add a `TransactionMarker` model and a pure `TransactionMarkerBuilder` helper (in Logic/) that groups all transactions by day and maps them to chart coordinates. `PortfolioChartView` renders these as `PointMark` layers and extends the existing selection overlay to show transaction info.

**Tech Stack:** SwiftUI, Swift Charts (PointMark), existing Theme colors, XCTest

---

### Task 1: TransactionMarker Model

**Files:**
- Create: `mobile/Summa/Summa/Models/TransactionMarker.swift`

**Step 1: Create the model file**

```swift
import Foundation

struct TransactionMarker: Identifiable {
    let id: String           // date string "yyyy-MM-dd" for identity
    let date: Date
    let value: Double        // portfolio value at that date (Y position)
    let transactions: [Transaction]

    var isPositive: Bool {
        transactions.reduce(0) { $0 + $1.amount } >= 0
    }

    var isGrouped: Bool {
        transactions.count > 1
    }

    /// Summary text for overlay display, e.g. "+0.1 BTC, −500 USD"
    func summaryLines(assets: [Asset]) -> [String] {
        transactions.map { txn in
            let sign = txn.amount >= 0 ? "+" : ""
            let ticker = assets.first(where: { $0.id == txn.assetId })?.displayTicker ?? ""
            let formatted = txn.amount.formatted(.number.precision(.fractionLength(0...8)))
            return "\(sign)\(formatted) \(ticker)"
        }
    }
}
```

**Step 2: Commit**

```bash
git add mobile/Summa/Summa/Models/TransactionMarker.swift
git commit -m "feat: add TransactionMarker model"
```

---

### Task 2: TransactionMarkerBuilder — Pure Logic with Tests

**Files:**
- Create: `mobile/Summa/Summa/Logic/TransactionMarkerBuilder.swift`
- Create: `mobile/Summa/SummaTests/TransactionMarkerBuilderTests.swift`

**Step 1: Write the failing tests**

```swift
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

    // MARK: - buildMarkers

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

        // Mar 1: two transactions, net positive
        let mar1 = markers.first(where: { $0.id == "2025-03-01" })
        XCTAssertNotNil(mar1)
        XCTAssertEqual(mar1?.transactions.count, 2)
        XCTAssertEqual(mar1?.value, 1000)
        XCTAssertTrue(mar1?.isPositive ?? false)
        XCTAssertTrue(mar1?.isGrouped ?? false)

        // Mar 3: one transaction, net negative
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
```

**Step 2: Run tests to verify they fail**

Run: `cd mobile/Summa && xcodebuild test -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:SummaTests/TransactionMarkerBuilderTests 2>&1 | tail -5`
Expected: FAIL — `TransactionMarkerBuilder` not found

**Step 3: Write the implementation**

```swift
import Foundation

enum TransactionMarkerBuilder {

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    /// Builds transaction markers by grouping all transactions by day,
    /// then matching them to chart data points for Y positioning.
    ///
    /// - Parameters:
    ///   - dataPoints: The portfolio chart data points (sorted by date).
    ///   - transactionsByAsset: All transactions keyed by asset ID (from viewModel.transactions).
    /// - Returns: Array of markers, one per day that has both transactions and a data point.
    static func buildMarkers(
        dataPoints: [PortfolioDataPoint],
        transactionsByAsset: [String: [Transaction]]
    ) -> [TransactionMarker] {
        // Build date string -> portfolio value lookup from data points
        var valueLookup: [String: (date: Date, value: Double)] = [:]
        for point in dataPoints {
            let key = dateFormatter.string(from: point.date)
            valueLookup[key] = (point.date, point.value)
        }

        // Flatten all transactions and group by date string
        var groupedByDay: [String: [Transaction]] = [:]
        for (_, transactions) in transactionsByAsset {
            for txn in transactions {
                let key = dateFormatter.string(from: txn.parsedDate)
                groupedByDay[key, default: []].append(txn)
            }
        }

        // Build markers only for days that have a matching data point
        var markers: [TransactionMarker] = []
        for (dateString, transactions) in groupedByDay {
            guard let match = valueLookup[dateString] else { continue }
            markers.append(TransactionMarker(
                id: dateString,
                date: match.date,
                value: match.value,
                transactions: transactions
            ))
        }

        return markers.sorted { $0.date < $1.date }
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd mobile/Summa && xcodebuild test -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:SummaTests/TransactionMarkerBuilderTests 2>&1 | tail -5`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add mobile/Summa/Summa/Logic/TransactionMarkerBuilder.swift mobile/Summa/SummaTests/TransactionMarkerBuilderTests.swift
git commit -m "feat: add TransactionMarkerBuilder with tests"
```

---

### Task 3: Render PointMark Markers on the Chart

**Files:**
- Modify: `mobile/Summa/Summa/Views/PortfolioChartView.swift`

**Step 1: Add state and compute markers**

Add a new `@State` to `PortfolioChartView` (after `selectedIndex` on line 82):

```swift
@State private var transactionMarkers: [TransactionMarker] = []
@State private var tappedMarker: TransactionMarker?
```

**Step 2: Compute markers after data points are set**

In `loadHistory()`, after every place where `dataPoints` is assigned (lines 274, 296), add immediately after:

```swift
transactionMarkers = TransactionMarkerBuilder.buildMarkers(
    dataPoints: dataPoints,
    transactionsByAsset: viewModel.transactions
)
```

There are 3 assignment sites:
1. After `dataPoints = generateFiatDataPoints(assets: assets)` (~line 274)
2. After `dataPoints = computePortfolioSeries(...)` (~line 296)
3. After `dataPoints = []` in the catch block (~line 299) — here set `transactionMarkers = []`

**Step 3: Add PointMark to the Chart**

In the `chart` computed property, inside the `Chart(dataPoints)` block (after the AreaMark block ending ~line 189), change the Chart to accept both data series. Replace the entire `Chart(dataPoints) { point in ... }` block with:

```swift
Chart {
    ForEach(dataPoints) { point in
        LineMark(
            x: .value("Date", point.date),
            y: .value("Value", point.value)
        )
        .foregroundStyle(Theme.sage)
        .interpolationMethod(.catmullRom)

        AreaMark(
            x: .value("Date", point.date),
            y: .value("Value", point.value)
        )
        .foregroundStyle(
            LinearGradient(
                colors: [Theme.sage.opacity(0.3), Theme.sage.opacity(0.0)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .interpolationMethod(.catmullRom)
    }

    ForEach(transactionMarkers) { marker in
        PointMark(
            x: .value("Date", marker.date),
            y: .value("Value", marker.value)
        )
        .symbolSize(marker.isGrouped ? 100 : 64)
        .foregroundStyle(marker.isPositive ? Theme.sage : Theme.coral)
        .symbol {
            Circle()
                .fill(marker.isPositive ? Theme.sage : Theme.coral)
                .overlay(
                    Circle()
                        .stroke(.white, lineWidth: 1.5)
                )
                .overlay {
                    if marker.isGrouped {
                        Text("\(marker.transactions.count)")
                            .font(.system(size: 7, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }
                }
        }
    }
}
```

**Step 4: Build and verify visually**

Run: `cd mobile/Summa && xcodebuild build -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -3`
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add mobile/Summa/Summa/Views/PortfolioChartView.swift
git commit -m "feat: render transaction markers as dots on portfolio chart"
```

---

### Task 4: Tap-to-Select Transaction Marker

**Files:**
- Modify: `mobile/Summa/Summa/Views/PortfolioChartView.swift`

**Step 1: Add tap detection in the chart overlay**

In the existing `.chartOverlay` block, add tap detection. The current gesture is a `DragGesture(minimumDistance: 0)`. We need to differentiate taps from drags. Replace the gesture content in `chartOverlay` with:

```swift
.chartOverlay { proxy in
    GeometryReader { geometry in
        Rectangle()
            .fill(Color.clear)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        tappedMarker = nil  // dismiss on drag
                        guard let plotFrame = proxy.plotFrame else { return }
                        let xPosition = value.location.x - geometry[plotFrame].origin.x
                        guard let date: Date = proxy.value(atX: xPosition) else { return }
                        if let index = ChartSelectionHelper.nearestIndex(in: dataPoints, to: date, dateOf: \.date) {
                            if selectedIndex != index {
                                selectedIndex = index
                            }
                        }
                    }
                    .onEnded { value in
                        // Detect tap: total translation < 5pt
                        let translation = value.translation
                        let isTap = abs(translation.width) < 5 && abs(translation.height) < 5
                        if isTap {
                            guard let plotFrame = proxy.plotFrame else { return }
                            let xPosition = value.location.x - geometry[plotFrame].origin.x
                            guard let date: Date = proxy.value(atX: xPosition) else { return }
                            // Find nearest marker within ~1 day
                            let nearest = transactionMarkers.min(by: {
                                abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
                            })
                            if let nearest, abs(nearest.date.timeIntervalSince(date)) < 86400 * 1.5 {
                                tappedMarker = tappedMarker?.id == nearest.id ? nil : nearest
                            } else {
                                tappedMarker = nil
                            }
                        }
                        selectedIndex = nil
                    }
            )
    }
}
```

**Step 2: Add the tapped marker overlay**

After the existing `if let selected = selectedPoint { selectionOverlay(for: selected) }` block inside the ZStack, add:

```swift
if let marker = tappedMarker {
    transactionOverlay(for: marker)
}
```

**Step 3: Create the transactionOverlay view**

Add a new private function after `selectionOverlay`:

```swift
private func transactionOverlay(for marker: TransactionMarker) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        HStack {
            Text(marker.date, format: .dateTime.month(.abbreviated).day())
                .font(Theme.captionFont.weight(.semibold))
                .foregroundStyle(Theme.textPrimary)
            if marker.isGrouped {
                Text("\(marker.transactions.count) txns")
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
            }
        }
        ForEach(marker.summaryLines(assets: assets), id: \.self) { line in
            Text(line)
                .font(Theme.captionFont)
                .foregroundStyle(line.hasPrefix("+") ? Theme.sage : Theme.coral)
        }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .background(Theme.bgCard, in: RoundedRectangle(cornerRadius: 6))
    .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
}
```

**Step 4: Build and verify**

Run: `cd mobile/Summa && xcodebuild build -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -3`
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add mobile/Summa/Summa/Views/PortfolioChartView.swift
git commit -m "feat: add tap-to-select transaction marker overlay"
```

---

### Task 5: Integrate Transaction Info into Drag Overlay

**Files:**
- Modify: `mobile/Summa/Summa/Views/PortfolioChartView.swift`

**Step 1: Add a helper to find marker for a data point**

Add a computed helper to `PortfolioChartView`:

```swift
private func markerForPoint(_ point: PortfolioDataPoint) -> TransactionMarker? {
    let dateString = Self.dateFormatter.string(from: point.date)
    return transactionMarkers.first(where: { $0.id == dateString })
}
```

**Step 2: Extend the existing selectionOverlay**

Replace the current `selectionOverlay(for:)` function to include transaction info when a marker matches:

```swift
private func selectionOverlay(for point: PortfolioDataPoint) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        Text(point.value, format: .currency(code: currency).precision(.fractionLength(0)))
            .font(Theme.captionFont.weight(.semibold))
            .foregroundStyle(Theme.textPrimary)
        Text(point.date, format: .dateTime.month(.abbreviated).day())
            .font(Theme.captionFont)
            .foregroundStyle(Theme.textMuted)
        if let marker = markerForPoint(point) {
            Divider()
            let lines = marker.summaryLines(assets: assets)
            if lines.count > 2 {
                Text("\(marker.transactions.count) txns")
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
                ForEach(lines.prefix(2), id: \.self) { line in
                    Text(line)
                        .font(Theme.captionFont)
                        .foregroundStyle(line.hasPrefix("+") ? Theme.sage : Theme.coral)
                }
                Text("...")
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
            } else {
                ForEach(lines, id: \.self) { line in
                    Text(line)
                        .font(Theme.captionFont)
                        .foregroundStyle(line.hasPrefix("+") ? Theme.sage : Theme.coral)
                }
            }
        }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(Theme.bgCard, in: RoundedRectangle(cornerRadius: 6))
    .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
}
```

**Step 3: Build and verify**

Run: `cd mobile/Summa && xcodebuild build -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -3`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add mobile/Summa/Summa/Views/PortfolioChartView.swift
git commit -m "feat: show transaction info in drag selection overlay"
```

---

### Task 6: Add TransactionMarker Files to Xcode Project

> **Note:** If the project uses automatic file discovery (folder references), skip this task. If files were added via the filesystem and don't appear in Xcode, they need to be added to the project. Check `project.pbxproj` for existing pattern.

**Step 1: Verify build with new files**

Run: `cd mobile/Summa && xcodebuild build -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -5`

If files aren't found, add them to the Xcode project targets manually or via the pbxproj.

**Step 2: Run all tests to verify nothing is broken**

Run: `cd mobile/Summa && xcodebuild test -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:SummaTests 2>&1 | tail -10`
Expected: All tests PASS including the new TransactionMarkerBuilderTests

**Step 3: Final commit if any project file changes**

```bash
git add -A mobile/Summa/Summa.xcodeproj
git commit -m "chore: add transaction marker files to Xcode project"
```

---

### Task 7: Accessibility

**Files:**
- Modify: `mobile/Summa/Summa/Views/PortfolioChartView.swift`

**Step 1: Update the chart accessibility label**

Update the `.accessibilityLabel` on the chart to mention transaction markers:

```swift
.accessibilityLabel({
    let baseLabel = "Portfolio value chart showing \(selectedRange.accessibilityName) history"
    if transactionMarkers.isEmpty {
        return baseLabel
    }
    return "\(baseLabel) with \(transactionMarkers.count) transaction marker\(transactionMarkers.count == 1 ? "" : "s")"
}())
```

**Step 2: Commit**

```bash
git add mobile/Summa/Summa/Views/PortfolioChartView.swift
git commit -m "feat: add accessibility label for transaction markers"
```
