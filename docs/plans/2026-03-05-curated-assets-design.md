# Curated Assets & Pre-populated Prices

## Problem

Search hits external APIs (CoinGecko, Yahoo Finance, Exchange Rate API) live, returning noisy results. Assets are only tracked after a user fetches prices for them.

## Solution

Replace live search with a curated `assets` table of ~308 popular assets. Backfill prices for all of them regardless of user activity. Search becomes a fast DB query.

## Data Model

### New `assets` table

```sql
CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL,   -- 'crypto', 'stock', 'etf', 'fiat'
  name VARCHAR(200) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  PRIMARY KEY (id, category)
);
```

### Removed: `tracked_assets` table

No longer needed — all assets in the `assets` table are always tracked.

### Unchanged

- `daily_prices` — stores price history
- `backfill_status` — tracks backfill progress

## New ETF Category

- `category = 'etf'` added alongside `crypto`, `stock`, `fiat`
- ETFs use Yahoo Finance for price fetching (same provider as stocks)
- Backfill and daily updates treat ETFs identically to stocks

## Seed Data

### Source

A TypeScript file `backend/src/seed/assets.ts` exports the curated list:

- 8 fiat: USD, EUR, UAH, GBP, CHF, JPY, CAD, PLN
- 100 crypto: top 100 by market cap
- 100 stocks: top 100 by market cap
- 100 ETFs: top 100 by AUM

### Seeding Behavior

- Runs on server startup after DB init, before cron scheduling
- Idempotent: `INSERT ... ON CONFLICT DO NOTHING`
- Only inserts, never deletes (safe to re-run)
- Update the list by editing the seed file and restarting

## Search Replacement

### New search flow

Same API contract: `GET /api/search?q=<query>&category=<optional>`

Implementation changes to a single DB query:

```sql
SELECT id, category, name, symbol FROM assets
WHERE (name ILIKE '%query%' OR symbol ILIKE '%query%' OR id ILIKE '%query%')
AND (category = $2 OR $2 IS NULL)
ORDER BY
  CASE WHEN symbol ILIKE 'query%' THEN 0 ELSE 1 END,
  CASE category WHEN 'fiat' THEN 0 WHEN 'stock' THEN 1 WHEN 'etf' THEN 2 WHEN 'crypto' THEN 3 END,
  name
LIMIT 50
```

### Removed

- `services/cryptoSearch.ts`, `stockSearch.ts`, `fiatSearch.ts` — deleted
- Search caching in route handler — no longer needed
- External API dependencies for search

## Cron & Backfill Changes

- Cron queries `assets` table instead of `tracked_assets`
- `backfill.ts` and `cronJob.ts` add `case "etf":` using same stock logic
- `POST /api/prices` no longer registers assets in `tracked_assets`
- `repositories/trackedAssets.ts` deleted

## File Changes

| Area | Change |
|---|---|
| New | `src/seed/assets.ts` — curated list of ~308 assets |
| New | `src/repositories/assets.ts` — DB operations for assets table |
| Modified | `src/db.ts` — add `assets` table, drop `tracked_assets` |
| Modified | `src/index.ts` — call seed on startup |
| Modified | `src/routes/search.ts` — DB query instead of external APIs |
| Modified | `src/routes/prices.ts` — remove tracked_assets, add ETF |
| Modified | `src/services/backfill.ts` — add ETF case, use assets repo |
| Modified | `src/services/cronJob.ts` — use assets repo, add ETF case |
| Deleted | `src/services/cryptoSearch.ts` |
| Deleted | `src/services/stockSearch.ts` |
| Deleted | `src/services/fiatSearch.ts` |
| Deleted | `src/repositories/trackedAssets.ts` |

## No iOS Changes Needed

API contracts stay identical. The only new behavior is `category: "etf"` which the iOS app handles dynamically.
