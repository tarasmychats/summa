# Price History Aggregation Design

**Date:** 2026-03-09
**Status:** Approved

## Problem

The history API returns every daily price regardless of time range. A 5-year request with 10 assets sends ~18,250 data points when the chart only needs ~600. This wastes bandwidth and client processing time.

## Solution

Backend auto-detects resolution from the `from`/`to` date range width and returns the **last price per interval** using SQL grouping. No new API parameters needed — fully backward compatible.

## Design Decisions

- **Aggregation location:** Server-side (SQL), not client-side
- **Aggregation strategy:** Last value per interval (not average, not OHLC)
- **Resolution selection:** Auto-detected from date range width (no new client params)
- **Configuration:** Resolution tier thresholds defined in one place on backend (hardcoded constant)
- **Response change:** Add `resolution` field to response for debugging/transparency

## Resolution Tiers

| Date range width | Resolution | SQL grouping            | ~Points/asset |
|------------------|-----------|-------------------------|---------------|
| ≤ 90 days        | daily     | no grouping             | 30-90         |
| ≤ 180 days       | 3-day     | floor(day_of_year / 3)  | ~60           |
| ≤ 365 days       | weekly    | date_trunc('week')      | ~52           |
| > 365 days       | monthly   | date_trunc('month')     | ~60           |

## SQL Approach

For non-daily resolutions, use `DISTINCT ON` to pick the last available price per bucket:

```sql
-- Example for weekly resolution:
SELECT DISTINCT ON (asset_id, category, date_trunc('week', date))
  asset_id, category, date, price_usd, price_eur
FROM daily_prices
WHERE (asset_id = $1 AND category = $2) OR ...
  AND date >= $from AND date <= $to
  AND price_usd IS NOT NULL
ORDER BY asset_id, category, date_trunc('week', date), date DESC
```

For 3-day intervals, group by `floor(extract(doy from date) / 3)` with year handling for cross-year ranges.

## Response Format

Add one field to the existing response:

```json
{
  "history": {
    "bitcoin:crypto": [
      { "date": "2025-03-31", "price": 65000.00 },
      { "date": "2025-04-30", "price": 67000.00 }
    ]
  },
  "currency": "usd",
  "from": "2021-03-09",
  "to": "2026-03-09",
  "resolution": "monthly"
}
```

## What Changes

- **Backend `dailyPrices` repository** — new query method with resolution-aware SQL
- **Backend `history` route** — compute resolution from date range, pass to repository, include `resolution` in response
- **Backend config** — resolution tier thresholds as a constant (single source of truth)

## What Doesn't Change

- API contract (same request params, same response structure plus one new field)
- iOS chart code, portfolio computation logic
- Transaction replay (amountAtDate still works, just called for fewer dates)
- Backfill pipeline (still stores daily granularity prices)
- iOS PriceModels (resolution field is optional/additive)

## Payload Reduction Estimates

| Range | Assets | Before    | After  | Reduction |
|-------|--------|-----------|--------|-----------|
| 5Y    | 10     | ~18,250   | ~600   | ~97%      |
| 1Y    | 10     | ~3,650    | ~520   | ~86%      |
| 6M    | 10     | ~1,800    | ~600   | ~67%      |
| 3M    | 10     | ~900      | ~900   | 0%        |
| 1M    | 10     | ~300      | ~300   | 0%        |
