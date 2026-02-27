# WealthTrack Design System: Soft & Approachable

**Goal:** Replace default iOS styling with a warm, welcoming design system that makes finance feel friendly.

**Direction:** Soft pastels, rounded typography, gentle shadows, subtle animations. Stands out from dark/corporate finance apps.

---

## Color Palette

### Backgrounds

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `bgPrimary` | `#FAF8F5` (cream) | `#1C1B1F` | App background |
| `bgCard` | `#FFFFFF` | `#2A2930` | Card surfaces |

### Accent Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `sage` | `#6BA38E` | `#7DB8A3` | Primary actions, positive values |
| `coral` | `#E8836B` | `#F09580` | Warnings, risk, negative values |
| `lavender` | `#9B8EC4` | `#B0A4D4` | Info, projections |
| `amber` | `#E8B44C` | `#F0C460` | Highlights, badges |
| `textMuted` | `#8A857E` | `#9E99A8` | Secondary labels |

### Category Tints (card backgrounds)

| Category | Light | Usage |
|----------|-------|-------|
| Crypto | `#F3F0FA` | Lavender tint |
| Stocks | `#EFF6F2` | Sage tint |
| Fiat | `#FBF6EC` | Amber tint |

---

## Typography

All **SF Rounded** (`.rounded` design) for warmth.

| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| `largeValue` | 34pt | Bold | Portfolio total, risk score |
| `title` | 22pt | Bold | Screen titles, asset names |
| `headline` | 17pt | Semibold | Card titles, section headers |
| `body` | 15pt | Regular | Body text |
| `caption` | 13pt | Regular | Disclaimers, symbols |

---

## Cards & Surfaces

- Corner radius: **20pt**
- Shadow: `color: .black.opacity(0.06), radius: 12, y: 4`
- White card backgrounds with soft shadows (no `.ultraThinMaterial`)
- Category-tinted backgrounds on relevant cards

---

## Motion

- Dashboard cards: staggered fade-in + slide-up on appear (0.1s delay between cards)
- Portfolio value: `.contentTransition(.numericText())` for animated number changes
- Button press: `.scaleEffect(0.97)` on tap
- Tab transitions: default SwiftUI

---

## Iconography

- SF Symbols `.fill` variants throughout
- Tint icons with category accent colors instead of `.secondary`

---

## Charts

- Pie chart: sage, coral, lavender, amber palette
- Line chart: coral (pessimistic), sage (expected), lavender (optimistic)
- Transparent chart backgrounds (rely on card)

---

## Implementation Approach

1. Create `Theme.swift` with all color/typography/spacing constants
2. Create reusable `CardView` modifier
3. Apply theme to each view one by one
4. Add animations last
