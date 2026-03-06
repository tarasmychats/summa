# Summa Portfolio Overhaul — Design Document

## Problem

Summa currently shows only current prices. Users want to:
- Track transactions (buy/sell/adjust amounts) per asset
- See how their total portfolio value changed over time (daily chart)
- See individual asset price charts
- Choose a base display currency (USD or EUR)
- Get better search results (fiat first, then stocks, then crypto)

## Key Decisions

1. **PostgreSQL for historical prices only** — user data (assets, transactions) stays in SwiftData/CloudKit on-device. Backend remains a price proxy + price cache. Privacy-first.

2. **Background cron job (Option A)** — daily job fetches prices for all tracked assets. Better UX than on-demand fetching.

3. **Grow crypto history over time** — CoinGecko free tier gives 365 days max. Start collecting now; DB grows daily. Stocks get 5 years via Yahoo Finance. Fiat via Frankfurter (free, ECB data).

4. **On-device portfolio computation** — iOS fetches raw price history per asset from backend, computes portfolio totals locally using transaction data. Backend never sees holdings.

5. **Transactions support delta and snapshot** — user can either add/subtract an amount (+1500) or set a new total (21500).

6. **Search reordering** — fiat → stocks → crypto (was crypto first).

## Database Schema

```sql
CREATE TABLE tracked_assets (
    id SERIAL PRIMARY KEY,
    asset_id VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,
    first_seen TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, category)
);

CREATE TABLE daily_prices (
    id SERIAL PRIMARY KEY,
    asset_id VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    price_usd DECIMAL(20, 8),
    price_eur DECIMAL(20, 8),
    UNIQUE(asset_id, category, date)
);
CREATE INDEX idx_daily_prices_lookup ON daily_prices(asset_id, category, date);

CREATE TABLE backfill_status (
    asset_id VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,
    oldest_date DATE,
    last_updated TIMESTAMP,
    PRIMARY KEY(asset_id, category)
);
```

## API Changes

**Modified:**
- `POST /api/prices` — also upserts requested assets into `tracked_assets`
- `GET /api/search` — reorder results: fiat → stocks → crypto

**New:**
- `GET /api/history?assets=bitcoin,AAPL&categories=crypto,stock&from=2021-01-01&to=2026-03-04&currency=usd`

## Background Job

- Runs daily at 02:00 UTC via `node-cron`
- Fetches today's price for all `tracked_assets`
- On first track of an asset, triggers backfill:
  - Stocks: yahoo-finance2 `.historical()` — up to 5 years
  - Crypto: CoinGecko `/coins/{id}/market_chart?days=365` — up to 365 days
  - Fiat: Frankfurter `/{from}..{to}` — full range available

## iOS Changes

**New SwiftData model:**
```swift
@Model final class Transaction {
    var id: UUID
    var asset: Asset
    var date: Date
    var type: TransactionType  // .delta or .snapshot
    var amount: Double
    var note: String?
    var createdAt: Date
}
```

**New views:** TransactionListView, AddTransactionView, PortfolioChartView, AssetChartView, SettingsView

**Modified views:** DashboardView (add chart), AssetListView (tap → detail with chart + transactions)

**Chart computation:** fetch `/api/history`, replay transactions per day, sum asset values.

## Third-Party APIs

| Provider | Current use | New use | Limits |
|---|---|---|---|
| CoinGecko | `/simple/price` | + `/coins/{id}/market_chart` | 30 req/min, 365 days free |
| Yahoo Finance | `.quote()` | + `.historical()` | Unofficial, 5yr daily free |
| ExchangeRate-API | `/latest/{base}` | unchanged | 1500 calls/mo free |
| Frankfurter (new) | — | historical fiat rates | Free, ECB data |
