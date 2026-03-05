# WealthTrack UI/UX Improvements

## Overview
- Comprehensive UI/UX polish pass across the WealthTrack iOS app
- Addresses missing feedback, discoverability gaps, chart interactivity, accessibility, and visual delight
- Improves the app from "works correctly" to "feels great" — covering 4 phases across quick wins, core UX, accessibility, and information density
- All changes are in `mobile/WealthTrack/WealthTrack/`

## Context (from discovery)
- Files/components involved:
  - `Views/DashboardView.swift` — main dashboard with cards, toolbar, empty state
  - `Views/AssetListView.swift` — asset list (missing fiat values)
  - `Views/AssetDetailView.swift` — asset detail with chart + transactions
  - `Views/AssetChartView.swift` — per-asset price chart (no interactivity)
  - `Views/PortfolioChartView.swift` — portfolio value chart (no interactivity)
  - `Views/ProjectionsView.swift` — projections tab (no refreshable)
  - `Views/InsightsView.swift` — insights tab (no refreshable)
  - `Views/AddAssetView.swift` — add asset flow (no duplicate detection)
  - `Views/SettingsView.swift` — settings (minimal)
  - `Theme/Theme.swift` — design system (fixed font sizes, contrast issues)
  - `ViewModels/DashboardViewModel.swift` — dashboard data (no change tracking)
  - `Models/Asset.swift`, `Models/AssetCategory.swift` — data models
- Related patterns: Card-based dashboard with staggered animations, `@Observable` view model, SwiftData + CloudKit, pull-to-refresh on dashboard only
- Dependencies: PriceAPIClient for fetching prices, Swift Charts for charting

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- **NO XCODE**: Do not open Xcode IDE or run xcodebuild during implementation
  - Write test files as code — compilation and execution deferred to post-completion
  - Visual verification (previews, layout checks) deferred to post-completion
  - Validate correctness by reading code and ensuring consistency with existing patterns
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated test files** for code changes with testable logic
- **CRITICAL: update this plan file when scope changes during implementation**
- Maintain backward compatibility

## Testing Strategy
- **Unit tests**: Write test files for every task with testable logic (formatters, calculators, view model logic)
- **No test execution during implementation** — all test runs deferred to post-completion
- **Compilation check**: Ensure code follows existing patterns and imports; no syntax errors by careful review
- UI-only changes (adding modifiers, layout tweaks) do not need test files but must follow existing conventions

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope
- Keep plan in sync with actual work done

## Implementation Steps

### Phase 1: Quick Wins

### Task 1: Add fiat value per asset in AssetListView
- [x] Add price data to `AssetListView` — fetch prices via `DashboardViewModel` or a shared price state, display fiat value right-aligned in each asset row
- [x] Show formatted currency value (e.g., "$45,230") next to each asset in the list
- [x] Handle loading/error states gracefully (show "—" if price unavailable)
- [x] Write tests for the value formatting logic in `WealthTrackTests/AssetValueFormatterTests.swift`

### Task 2: Add loading skeleton to Dashboard
- [x] In `DashboardView`, show placeholder cards with `.redacted(reason: .placeholder)` while `viewModel.isLoading` is true and no data exists yet
- [x] Ensure skeleton appears on first launch and during refresh when holdings are empty
- [x] Ensure code compiles by following existing `DashboardView` patterns (themeCard, spacing)

### Task 3: Add pull-to-refresh on Projections and Insights tabs
- [x] Add `.refreshable` modifier to `ProjectionsView` ScrollView, calling `refreshHoldings()`
- [x] Add `.refreshable` modifier to `InsightsView` List, calling `refreshHoldings()`

### Task 4: Add delete confirmation for assets
- [x] In `AssetListView`, replace direct `.onDelete` with a confirmation alert ("Delete [asset name]? This will remove all transaction history.")
- [x] Keep swipe-to-delete gesture but show alert before actually deleting

### Task 5: Add percentage labels to allocation chart
- [x] In `DashboardView.breakdownChart`, compute percentage for each category from `viewModel.breakdown`
- [x] Display percentage next to category name in the legend (e.g., "Crypto 45%")
- [x] Write test for percentage calculation logic (extract to testable function)

### Task 6: Add haptic feedback to key interactions
- [x] Add `.sensoryFeedback(.success, trigger:)` when an asset is successfully added in `AddAssetView`
- [x] Add `.sensoryFeedback(.success, trigger:)` when a transaction is saved in `AddTransactionView`
- [x] Add `.sensoryFeedback(.impact(.light), trigger:)` on chart time range selector taps in `PortfolioChartView` and `AssetChartView`

### Task 7: Detect and mark already-added assets in AddAssetView
- [x] In `AddAssetView`, compare search results against `allAssets` by symbol
- [x] Show a checkmark badge or "Already added" label on matching search results
- [x] Disable or show confirmation when user taps an already-added asset
- [x] Write test for the duplicate detection logic (matching by symbol)

### Phase 2: Core UX

### Task 8: Add interactive chart selection to PortfolioChartView
- [x] Add `@State` for selected data point in `PortfolioChartView`
- [x] Add `.chartOverlay` with drag gesture to find nearest data point on x-axis
- [x] Show a vertical rule indicator line at the selected point
- [x] Display selected date and value in a floating label above the chart
- [x] Clear selection when drag ends or user taps outside
- [x] Extract nearest-point lookup to a testable function and write test

### Task 9: Add interactive chart selection to AssetChartView
- [x] Apply the same interactive selection pattern from Task 8 to `AssetChartView`
- [x] Show selected date and price in a floating label
- [x] Reuse or extract shared chart overlay logic if patterns are identical

### Task 10: Add portfolio value change indicator
- [x] In `DashboardViewModel`, add properties for `previousValue` (yesterday's portfolio value) and computed `valueChange` / `percentChange`
- [x] Fetch or derive yesterday's value from the portfolio chart history data (most recent prior data point)
- [x] In `DashboardView.totalValueCard`, display the change below the total (e.g., "+$1,234 (+5.2%)" in green, or "-$500 (-2.1%)" in coral)
- [x] Handle edge case: no previous data available (hide change indicator)
- [x] Write tests for change calculation logic (positive, negative, zero, no data)

### Task 11: Add top holdings section to Dashboard for quick navigation
- [x] Add a "Holdings" section below the total value card in `DashboardView`
- [x] Show each asset as a tappable row with name, amount, and fiat value
- [x] Each row navigates directly to `AssetDetailView` via `NavigationLink`
- [x] Limit to top 5 assets by value; show "View All" link to `AssetListView` if more

### Phase 3: Accessibility

### Task 12: Add VoiceOver accessibility labels
- [x] Add `.accessibilityLabel` to portfolio chart ("Portfolio value chart showing [range] history")
- [x] Add `.accessibilityLabel` to asset price chart ("Price history chart for [asset name]")
- [x] Add `.accessibilityLabel` to time range selector buttons ("[range], selected" / "[range]")
- [x] Add `.accessibilityLabel` to risk score card ("Risk score: [value] out of 10, [label]")
- [x] Add `.accessibilityLabel` to allocation pie chart ("Portfolio allocation: [category] [percent]%")

### Task 13: Switch to Dynamic Type-compatible fonts
- [x] In `Theme.swift`, replace fixed `Font.system(size:weight:design:)` with text styles: `.largeTitle`, `.title`, `.headline`, `.body`, `.caption` with `.fontDesign(.rounded)`
- [x] Update `largeValue` to use `.largeTitle.weight(.bold)` with `.fontDesign(.rounded)` or equivalent
- [x] Write basic test that Theme font properties exist (sanity check)

### Task 14: Fix color contrast for textMuted
- [x] In `Theme.swift`, darken `textMuted` light mode value from `#8A857E` to at least `#6B6660` to meet WCAG AA 4.5:1 contrast ratio against `#FAF8F5` background
- [x] Verify dark mode `textMuted` also meets contrast requirements against dark background

### Phase 4: Information Density & Polish

### Task 15: Add suggested assets to empty state
- [x] In `DashboardView.emptyState`, add 3 quick-add suggestion buttons below the "Add Asset" button (e.g., "Bitcoin", "S&P 500 ETF", "US Dollar")
- [x] Tapping a suggestion pre-fills the AddAssetView search or navigates directly to the amount input
- [x] Style suggestion buttons as capsule chips with category colors

### Task 16: Add visual gauge for risk score
- [x] Replace the text-only risk score in `DashboardView.riskScoreCard` with a horizontal `Gauge` or custom arc view
- [x] Color the gauge using `Theme.riskColor` gradient (green-amber-red)
- [x] Keep the numeric value and label visible alongside the gauge

### Task 17: Add "Last Updated" timestamp
- [x] Add a `lastUpdated: Date?` property to `DashboardViewModel`, set it when prices are fetched
- [x] Display a "Last updated: X min ago" label below the total value card (using `RelativeDateTimeFormatter` or `.relative` date style)
- [x] Update the label reactively as time passes
- [x] Write test for the lastUpdated property being set after refresh

### Task 18: Improve error messages with specificity
- [x] In `DashboardViewModel.refresh`, differentiate between `URLError` (network) and other errors
- [x] Show "No internet connection" for `.notConnectedToInternet`, "Server unavailable" for server errors, "Some prices could not be loaded" for partial failures
- [x] Apply same error differentiation to `ProjectionsView` and `InsightsView`
- [x] Write tests for error message mapping logic (extract to testable helper)

### Task 19: Wire up or remove unused TransactionListView
- [x] Decide: either add a navigation link to `TransactionListView` from `AssetDetailView` (e.g., "View All Transactions" row) or delete the unused file
- [x] If keeping, ensure it uses the same styling (`.scrollContentBackground(.hidden)`, `.background(Theme.bgPrimary)`, `.listRowBackground(Theme.bgCard)`)

### Verification

### Task 20: Verify acceptance criteria
- [x] Review all Phase 1 code: asset values in list, loading skeleton, refreshable on all tabs, delete confirmation, allocation percentages, haptics, duplicate detection
- [x] Review all Phase 2 code: chart interactivity on both charts, portfolio change indicator, top holdings navigation
- [x] Review all Phase 3 code: VoiceOver labels, Dynamic Type fonts, color contrast
- [x] Review all Phase 4 code: empty state suggestions, risk gauge, last updated, error messages, TransactionListView cleanup
- [x] Ensure all test files are written and follow existing test patterns

### Task 21: [Final] Update documentation
- [x] Update `docs/plans/2026-02-27-design-system.md` if Theme.swift changes (font strategy, colors)
- [x] Update `CLAUDE.md` if new patterns or conventions were established
- [x] Update README.md if needed

*Note: ralphex automatically moves completed plans to `docs/plans/completed/`*

## Technical Details

### Chart Interactivity Pattern
- Use `.chartOverlay { proxy in }` with `DragGesture(minimumDistance: 0)`
- Convert gesture location to chart value using `proxy.value(atX:)`
- Find nearest data point by date using binary search or min-distance
- Show selection with `RuleMark` at x position + floating annotation

### Dynamic Type Migration
- Replace: `Font.system(size: 34, weight: .bold, design: .rounded)`
- With: `Font.system(.largeTitle, design: .rounded, weight: .bold)`
- This preserves the rounded design while enabling Dynamic Type scaling

### Portfolio Change Calculation
- On dashboard refresh, store current total and fetch yesterday's close from history API
- Change = current - previous; percent = (change / previous) * 100
- Edge case: if no history, hide the change indicator entirely

## Post-Completion

**Build and test verification (requires Xcode):**
- Run full test suite via Xcode or `xcodebuild test`
- Fix any compilation errors
- Verify all tests pass

**Visual verification (requires Xcode):**
- Check SwiftUI previews for all modified views
- Test on multiple device sizes (iPhone SE, iPhone 15 Pro, iPhone 15 Pro Max)
- Test with Dynamic Type set to largest accessibility size
- Test with VoiceOver enabled
- Test on both light and dark mode
- Test with slow/no network connection
