# Design System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the "Soft & Approachable" design system to all WealthTrack iOS views.

**Architecture:** Create a centralized `Theme.swift` with all design tokens (colors, typography, spacing), a reusable `CardModifier`, then update each view to use the theme. Animations added last.

**Tech Stack:** SwiftUI, Swift Charts, SF Symbols

---

### Task 1: Create Theme.swift

**Files:**
- Create: `mobile/WealthTrack/WealthTrack/Theme/Theme.swift`

**Step 1: Create the theme file**

```swift
import SwiftUI

enum Theme {
    // MARK: - Colors

    static let bgPrimary = Color("BgPrimary")
    static let bgCard = Color("BgCard")

    static let sage = Color(light: .init(hex: 0x6BA38E), dark: .init(hex: 0x7DB8A3))
    static let coral = Color(light: .init(hex: 0xE8836B), dark: .init(hex: 0xF09580))
    static let lavender = Color(light: .init(hex: 0x9B8EC4), dark: .init(hex: 0xB0A4D4))
    static let amber = Color(light: .init(hex: 0xE8B44C), dark: .init(hex: 0xF0C460))
    static let textMuted = Color(light: .init(hex: 0x8A857E), dark: .init(hex: 0x9E99A8))

    static let cryptoTint = Color(light: .init(hex: 0xF3F0FA), dark: .init(hex: 0x2E2A3A))
    static let stockTint = Color(light: .init(hex: 0xEFF6F2), dark: .init(hex: 0x242E29))
    static let fiatTint = Color(light: .init(hex: 0xFBF6EC), dark: .init(hex: 0x302C22))

    // MARK: - Typography

    static let largeValue = Font.system(size: 34, weight: .bold, design: .rounded)
    static let titleFont = Font.system(size: 22, weight: .bold, design: .rounded)
    static let headlineFont = Font.system(size: 17, weight: .semibold, design: .rounded)
    static let bodyFont = Font.system(size: 15, weight: .regular, design: .rounded)
    static let captionFont = Font.system(size: 13, weight: .regular, design: .rounded)

    // MARK: - Spacing

    static let cardCornerRadius: CGFloat = 20
    static let cardPadding: CGFloat = 20
    static let sectionSpacing: CGFloat = 20

    // MARK: - Category Helpers

    static func categoryColor(_ category: AssetCategory) -> Color {
        switch category {
        case .crypto: return lavender
        case .stock: return sage
        case .fiat: return amber
        }
    }

    static func categoryTint(_ category: AssetCategory) -> Color {
        switch category {
        case .crypto: return cryptoTint
        case .stock: return stockTint
        case .fiat: return fiatTint
        }
    }

    static func riskColor(_ value: Int) -> Color {
        switch value {
        case 1...3: return sage
        case 4...6: return amber
        default: return coral
        }
    }
}

// MARK: - Color Extensions

extension Color {
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }

    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}

// MARK: - Card Modifier

struct ThemeCard: ViewModifier {
    var tint: Color? = nil

    func body(content: Content) -> some View {
        content
            .padding(Theme.cardPadding)
            .background(
                RoundedRectangle(cornerRadius: Theme.cardCornerRadius)
                    .fill(tint ?? Theme.bgCard)
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 4)
            )
    }
}

extension View {
    func themeCard(tint: Color? = nil) -> some View {
        modifier(ThemeCard(tint: tint))
    }
}
```

**Step 2: Add Color Set assets**

Add two Color Sets to `Assets.xcassets`:

In `mobile/WealthTrack/WealthTrack/Assets.xcassets/BgPrimary.colorset/Contents.json`:
```json
{
  "colors": [
    {
      "color": { "color-space": "srgb", "components": { "red": "0.980", "green": "0.973", "blue": "0.961", "alpha": "1.000" } },
      "idiom": "universal"
    },
    {
      "appearances": [{ "appearance": "luminosity", "value": "dark" }],
      "color": { "color-space": "srgb", "components": { "red": "0.110", "green": "0.106", "blue": "0.122", "alpha": "1.000" } },
      "idiom": "universal"
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

In `mobile/WealthTrack/WealthTrack/Assets.xcassets/BgCard.colorset/Contents.json`:
```json
{
  "colors": [
    {
      "color": { "color-space": "srgb", "components": { "red": "1.000", "green": "1.000", "blue": "1.000", "alpha": "1.000" } },
      "idiom": "universal"
    },
    {
      "appearances": [{ "appearance": "luminosity", "value": "dark" }],
      "color": { "color-space": "srgb", "components": { "red": "0.165", "green": "0.161", "blue": "0.188", "alpha": "1.000" } },
      "idiom": "universal"
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

Update `AccentColor.colorset/Contents.json` to sage green:
```json
{
  "colors": [
    {
      "color": { "color-space": "srgb", "components": { "red": "0.420", "green": "0.639", "blue": "0.557", "alpha": "1.000" } },
      "idiom": "universal"
    },
    {
      "appearances": [{ "appearance": "luminosity", "value": "dark" }],
      "color": { "color-space": "srgb", "components": { "red": "0.490", "green": "0.722", "blue": "0.639", "alpha": "1.000" } },
      "idiom": "universal"
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

**Step 3: Build**

Run: `/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -scheme WealthTrack -project /Users/taras/Git/finance_track/mobile/WealthTrack/WealthTrack.xcodeproj -destination 'platform=iOS Simulator,name=iPhone 17' build 2>&1 | tail -5`

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add mobile/WealthTrack/WealthTrack/Theme/Theme.swift mobile/WealthTrack/WealthTrack/Assets.xcassets/
git commit -m "feat(ios): add Theme.swift design system with color palette and card modifier"
```

---

### Task 2: Apply theme to ContentView and app background

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/WealthTrackApp.swift`
- Modify: `mobile/WealthTrack/WealthTrack/ContentView.swift`

**Step 1: Update WealthTrackApp to set global tint**

In `WealthTrackApp.swift`, add `.tint(Theme.sage)` to the WindowGroup's ContentView.

**Step 2: Update ContentView background**

In `ContentView.swift`:
- Wrap TabView in a ZStack or apply `.background(Theme.bgPrimary)` modifier
- The TabView itself should use `.tint(Theme.sage)` for tab icon colors

```swift
import SwiftUI
import SwiftData

struct ContentView: View {
    @Query private var assets: [Asset]

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "chart.pie.fill")
                }

            ProjectionsView()
                .tabItem {
                    Label("Projections", systemImage: "chart.line.uptrend.xyaxis")
                }

            InsightsView()
                .tabItem {
                    Label("Insights", systemImage: "lightbulb.fill")
                }
        }
        .tint(Theme.sage)
    }
}
```

**Step 3: Build**

Run: `/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -scheme WealthTrack -project /Users/taras/Git/finance_track/mobile/WealthTrack/WealthTrack.xcodeproj -destination 'platform=iOS Simulator,name=iPhone 17' build 2>&1 | tail -5`

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add mobile/WealthTrack/WealthTrack/WealthTrackApp.swift mobile/WealthTrack/WealthTrack/ContentView.swift
git commit -m "feat(ios): apply theme tint and background to ContentView"
```

---

### Task 3: Apply theme to DashboardView

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Views/DashboardView.swift`

**Step 1: Update DashboardView**

Replace all `.ultraThinMaterial` + `RoundedRectangle(cornerRadius: 16)` backgrounds with `.themeCard()`.

Replace hardcoded colors:
- `.secondary` → `Theme.textMuted`
- `.green` / `.yellow` / `.red` for risk → `Theme.riskColor(value)`
- `.red` / `.blue` / `.green` for projections → `Theme.coral` / `Theme.sage` / `Theme.lavender`

Replace fonts:
- `.system(size: 36, weight: .bold, design: .rounded)` → `Theme.largeValue`
- `.system(size: 44, weight: .bold, design: .rounded)` → `Theme.largeValue` (risk score)
- `.headline` → `Theme.headlineFont`
- `.subheadline` → `Theme.bodyFont`
- `.caption` → `Theme.captionFont`
- `.title2.bold()` → `Theme.titleFont`

Replace chart colors:
- Pie chart: use `.foregroundStyle(Theme.categoryColor(category))` instead of automatic color scale

Update emptyState:
- Icon color: `Theme.sage.opacity(0.5)` instead of `.secondary`
- `.borderedProminent` button stays (accent color now sage via AccentColor)

Add warm background to ScrollView: `.background(Theme.bgPrimary)`

**Step 2: Build**

Run: `/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -scheme WealthTrack -project /Users/taras/Git/finance_track/mobile/WealthTrack/WealthTrack.xcodeproj -destination 'platform=iOS Simulator,name=iPhone 17' build 2>&1 | tail -5`

Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add mobile/WealthTrack/WealthTrack/Views/DashboardView.swift
git commit -m "feat(ios): apply Soft theme to DashboardView"
```

---

### Task 4: Apply theme to ProjectionsView

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Views/ProjectionsView.swift`

**Step 1: Update ProjectionsView**

Replace colors:
- `"Pessimistic": .red` → `"Pessimistic": Theme.coral`
- `"Expected": .blue` → `"Expected": Theme.sage`
- `"Optimistic": .green` → `"Optimistic": Theme.lavender`
- Circle fills in legend rows: same mapping
- `.secondary` → `Theme.textMuted`

Replace fonts:
- `.caption` → `Theme.captionFont`
- `.bold()` → use `Theme.headlineFont`

Wrap chart and final values in `.themeCard()`.

Add `.background(Theme.bgPrimary)` to ScrollView.

**Step 2: Build**

Run: same xcodebuild command

Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add mobile/WealthTrack/WealthTrack/Views/ProjectionsView.swift
git commit -m "feat(ios): apply Soft theme to ProjectionsView"
```

---

### Task 5: Apply theme to InsightsView

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Views/InsightsView.swift`

**Step 1: Update InsightsView**

Replace colors:
- `.orange` (warning) → `Theme.coral`
- `.blue` (info) → `Theme.lavender`
- `.secondary` → `Theme.textMuted`

Replace fonts:
- `.headline` → `Theme.headlineFont`
- `.subheadline` → `Theme.bodyFont`
- `.title3` (icon size) stays as system size

Add `.listRowBackground(Theme.bgCard)` to each row for consistent card feel.
Add `.scrollContentBackground(.hidden)` and `.background(Theme.bgPrimary)` to the List.

**Step 2: Build**

Run: same xcodebuild command

Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add mobile/WealthTrack/WealthTrack/Views/InsightsView.swift
git commit -m "feat(ios): apply Soft theme to InsightsView"
```

---

### Task 6: Apply theme to AddAssetView and AssetListView

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Views/AddAssetView.swift`
- Modify: `mobile/WealthTrack/WealthTrack/Views/AssetListView.swift`

**Step 1: Update AddAssetView**

Replace colors:
- `.secondary` → `Theme.textMuted`
- `.red` (error) → `Theme.coral`
- Category icon: use `Theme.categoryColor(category)` instead of `.secondary`

Replace fonts:
- `.title2.bold()` → `Theme.titleFont`
- `.caption` → `Theme.captionFont`
- `.title` (TextField) → `Theme.largeValue`

Upgrade prompt:
- Lock icon: `Theme.textMuted` instead of `.secondary`
- `.system(size: 48)` → `.system(size: 48)` stays
- `.title2.bold()` → `Theme.titleFont`

**Step 2: Update AssetListView**

Replace colors:
- `.secondary` icon → `Theme.categoryColor(asset.assetCategory)`
- `.secondary` text → `Theme.textMuted`

Replace fonts:
- `.headline` → `Theme.headlineFont`
- `.subheadline` → `Theme.bodyFont`

EditAssetView:
- `.title2.bold()` → `Theme.titleFont`
- `.title` (TextField) → `Theme.largeValue`
- `.borderedProminent` stays (now themed via AccentColor)

Add `.scrollContentBackground(.hidden)` and `.background(Theme.bgPrimary)` to Lists.

**Step 3: Build**

Run: same xcodebuild command

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add mobile/WealthTrack/WealthTrack/Views/AddAssetView.swift mobile/WealthTrack/WealthTrack/Views/AssetListView.swift
git commit -m "feat(ios): apply Soft theme to AddAssetView and AssetListView"
```

---

### Task 7: Add animations

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Views/DashboardView.swift`

**Step 1: Add staggered card animations to DashboardView**

Add `@State private var cardsAppeared = false` property.

Wrap each card in the VStack with:
```swift
.opacity(cardsAppeared ? 1 : 0)
.offset(y: cardsAppeared ? 0 : 20)
.animation(.easeOut(duration: 0.4).delay(Double(index) * 0.1), value: cardsAppeared)
```

Add `.onAppear { cardsAppeared = true }` to the VStack.

Add `.contentTransition(.numericText())` to the total portfolio value text.

**Step 2: Build**

Run: same xcodebuild command

Expected: BUILD SUCCEEDED

**Step 3: Run all tests**

Run: `/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test -scheme WealthTrack -project /Users/taras/Git/finance_track/mobile/WealthTrack/WealthTrack.xcodeproj -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:WealthTrackTests 2>&1 | tail -25`

Expected: TEST SUCCEEDED, 15/15 pass

**Step 4: Commit**

```bash
git add mobile/WealthTrack/WealthTrack/Views/DashboardView.swift
git commit -m "feat(ios): add staggered card animations to dashboard"
```
