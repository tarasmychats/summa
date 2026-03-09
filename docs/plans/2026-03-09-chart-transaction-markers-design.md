# Transaction Markers on Portfolio Chart

## Summary

Show transaction markers as colored dots on the portfolio value chart, so users can see when they bought/sold assets and how that correlates with portfolio value changes.

## Data flow

`DashboardViewModel` already stores `transactions: [String: [Transaction]]` keyed by asset ID. When computing the portfolio chart series in `PortfolioChartView`, we also compute a parallel array of transaction markers — one per day that has transactions within the selected time range. Each marker knows its date, the portfolio value at that point (for Y positioning), and the grouped transactions for that day.

## Marker model

```swift
struct TransactionMarker: Identifiable {
    let id: String           // date string for identity
    let date: Date
    let value: Double        // portfolio value at that date (Y position on chart)
    let transactions: [Transaction]
    var isPositive: Bool     // net direction for color
}
```

## Visual appearance

- Small colored circles (8pt diameter) rendered on the chart line at the exact data point
- Color: `Theme.sage` for net positive (buys), `Theme.coral` for net negative (sells)
- Days with 2+ transactions get a slightly larger dot (10pt) with a small count badge
- Rendered as `PointMark` in the Swift Charts layer, layered on top of the line/area marks
- Markers only appear for days that have both a portfolio data point and transactions

## Tap interaction

- Tapping a marker shows a popover overlay (same visual style as the existing `selectionOverlay` price tooltip)
- Popover contents:
  - Date
  - Transaction count if > 1
  - List of individual transactions: "+0.1 BTC", "−500 USD"
- Tapping elsewhere or starting a drag gesture dismisses the popover

## Drag integration

- During the existing drag-to-scrub gesture, when the scrubber lands on a day that has transactions, the existing price tooltip grows to include a transaction summary line below the portfolio value
- Format: "2 txns: +0.1 BTC, −$500"
- If only one transaction, just show the single line without a count prefix
- No separate gesture needed; this is additive to existing behavior

## Scope

**In scope:**
- Transaction markers on the dashboard portfolio chart (`PortfolioChartView`)
- Computed client-side from existing `viewModel.transactions` data
- Grouped by day
- Tap and drag interactions

**Out of scope:**
- Markers on the per-asset chart (`AssetChartView`)
- Filtering markers by transaction type
- Animation of markers appearing/disappearing
- New API endpoints (all data already available)
