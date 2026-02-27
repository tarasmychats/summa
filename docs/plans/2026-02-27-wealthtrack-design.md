# WealthTrack — Design Document

**Date:** 2026-02-27
**Status:** Approved
**Working name:** WealthTrack (or FinanceTrack — to be finalized)

## One-Line Pitch

"See your total wealth in one place, and where it'll be in 10, 20, 50 years."

## Target User

Regular people (not finance professionals) who have savings spread across crypto, stocks, ETFs, and multiple fiat currencies. They want clarity about their total wealth and a simple understanding of where it's headed.

## Key Differentiators

- **Manual-first, privacy-first:** No exchange connections, no bank logins. User types what they own.
- **No signup required:** Identified via Apple ID through iCloud. Zero friction to start.
- **Multi-asset in one view:** Crypto + stocks/ETFs + fiat cash — all in one portfolio.
- **Long-term projections:** 10/20/50 year outlooks with pessimistic/expected/optimistic scenarios.
- **Approachable:** Plain language, no jargon. Built for normal people, not traders.

## Platform & Technology

- **Platform:** iOS only (iPhone) for MVP
- **UI Framework:** SwiftUI
- **User data storage:** CloudKit (automatic via Apple ID, no signup)
- **Price data:** Lightweight server proxy calling CoinGecko, Yahoo Finance, and exchange rate APIs
- **Monetization:** Freemium

## Core User Flow

1. **Open app (first time)** — Welcome screen: "What do you own?"
2. **Add assets** — Pick category (Crypto / Stocks-ETFs / Cash) → search/select asset → enter amount
3. **Dashboard** — Total portfolio value, pie chart breakdown, risk score, projection preview
4. **Projections** — Three scenarios on a line chart, toggle 10/20/50 year views
5. **Insights** — Educational tips based on portfolio composition

**Display currency:** User picks a "home currency" (UAH, USD, EUR, etc.). All values shown in that currency.

## Architecture

```
iOS App (SwiftUI)
├── Views: Dashboard, Projections, Insights
├── PortfolioManager (business logic, calculations)
├── CloudKit Store (user portfolio data)
└── PriceAPI Service → Price API Server (proxy)
                          ├── CoinGecko (crypto prices)
                          ├── Yahoo Finance (stocks/ETFs)
                          └── Exchange Rate API (fiat rates)
```

**CloudKit** stores the user's portfolio data (what assets, how much). Automatic sync via Apple ID — no signup needed. Free tier is sufficient.

**Price API Server** is a lightweight proxy (serverless function) that:
- Keeps API keys secret (not embedded in the app)
- Caches prices to reduce API calls
- Provides a unified price endpoint for the app

## Projection Model

Historical average annual returns by asset class:

| Asset Class | Pessimistic | Expected | Optimistic |
|---|---|---|---|
| Cash (fiat) | -5% (high inflation) | -3% (normal inflation) | -1% (low inflation) |
| S&P500 / Index ETFs | 4%/yr | 8%/yr | 12%/yr |
| Bitcoin | -10%/yr | 15%/yr | 40%/yr |
| Ethereum | -15%/yr | 12%/yr | 35%/yr |
| Other crypto (SOL etc.) | -20%/yr | 10%/yr | 50%/yr |

**Formula:** `Future Value = Present Value x (1 + annual_rate) ^ years`

Disclaimers shown: projections are based on historical averages, not predictions. Past performance does not guarantee future results.

## Risk Score (1-10)

Weighted average of asset risk weights:

| Asset Type | Risk Weight |
|---|---|
| Cash / stablecoins | 1 |
| Government bonds | 2 |
| Index funds (S&P500) | 4 |
| Individual stocks | 6 |
| Bitcoin | 7 |
| Ethereum | 8 |
| Altcoins (SOL, etc.) | 9 |

**Labels:** 1-3 Conservative, 4-6 Moderate, 7-10 Aggressive

## Educational Insights (Rule-Based)

- **>50% in one asset:** "Your portfolio is concentrated. Consider diversifying."
- **>50% in cash:** "Cash loses value to inflation (~3%/yr). Consider investing a portion."
- **0% in stable assets:** "You have no low-risk assets. Consider keeping some cash reserve."
- **>70% crypto:** "Crypto is highly volatile. Your portfolio could drop 50%+ in a downturn."
- **No index funds:** "Index funds historically return ~8%/yr with moderate risk."

## Freemium Model

| Feature | Free | Premium |
|---|---|---|
| Track assets | Up to 5 | Unlimited |
| Live prices | Yes | Yes |
| Total portfolio value | Yes | Yes |
| Pie chart breakdown | Yes | Yes |
| Risk score | Yes | Yes |
| Projections | 10 years only | 10 / 20 / 50 years |
| Educational insights | Basic (2-3 rules) | All insights |
| Display currencies | 1 currency | Multiple |
| Historical tracking | No | Yes |

**Pricing:** ~$2.99-4.99/month or ~$29.99/year

## MVP Scope (v1.0)

### Included

- Add/edit/delete assets (crypto, stocks/ETFs, fiat cash)
- Live price fetching
- Dashboard with total value + pie chart
- Display in one chosen currency
- Simple risk score (1-10)
- 10-year projection (3 scenarios)
- 2-3 basic educational insights
- CloudKit sync (automatic via Apple ID)
- Freemium gate (5 assets free)

### Excluded (Future Versions)

- 20/50 year projections (Premium)
- Historical portfolio value tracking
- Multiple display currencies
- Advanced insights
- iOS home screen widgets
- iPad version
- Export/reports
- Price alert notifications
- "What-if" scenarios (e.g., "what if I invest $1000/month")

## Competitive Landscape

| Competitor | Gap We Fill |
|---|---|
| Delta (by eToro) | Crypto-focused, weak on traditional assets and projections |
| Kubera | $150/yr, too expensive for casual users |
| Empower | US-focused, poor crypto support |
| ProjectionLab | Web-only, complex, aimed at FIRE community |
| WealthTrace | Desktop-focused, no crypto support |

**Our positioning:** The simplest multi-asset wealth tracker with long-term projections. No signup, no complexity, no bank connections. Just clarity.
