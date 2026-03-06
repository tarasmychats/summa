# Replace Crypto Historical Provider with CryptoCompare

## Problem

CoinGecko free tier limits historical data to 365 days. We need 5 years of crypto price history to match stock/ETF/fiat coverage.

## Decision

Replace only the historical crypto fetcher (`cryptoHistory.ts`) with CryptoCompare. Keep CoinGecko for current prices — it works well and includes 24h change data.

CoinMarketCap was ruled out: no historical data on the free tier ($79+/mo required).

## CryptoCompare API

- Endpoint: `GET https://min-api.cryptocompare.com/data/v2/histoday`
- Params: `fsym` (symbol, e.g. BTC), `tsym` (USD), `limit` (max 2000), `toTs` (unix timestamp for pagination)
- Free tier: full daily history, generous rate limits (~50 req/sec)
- Optional API key via `CRYPTOCOMPARE_API_KEY` env var

## Changes

### 1. `backend/src/services/cryptoHistory.ts` (rewrite)

Replace CoinGecko `/market_chart` with CryptoCompare `histoday`.

- Accepts `symbol` (e.g. `BTC`) instead of CoinGecko coin ID
- Accepts `days` parameter (up to 1825 for 5 years)
- Paginates backwards with `toTs` — each call returns up to 2000 days
- Returns same `CryptoHistoryPoint[]` interface

### 2. `backend/src/services/backfill.ts`

- Change `CRYPTO_MAX_DAYS` from `365` to `1825` (5 years)
- `fetchAndMapCrypto`: look up asset symbol from DB, pass symbol to new fetcher

### 3. `backend/src/services/circuitBreaker.ts`

- Add `cryptoCompareCircuit` instance (separate from `coingeckoCircuit`)

### 4. `backend/src/config.ts`

- Add optional `cryptoCompareApiKey` from `CRYPTOCOMPARE_API_KEY` env var

### 5. Rate limiting

- Reduce `rateLimitDelay` in `cryptoHistory.ts` from 2000ms to 500ms

### 6. Tests

- Update `cryptoHistory.test.ts` for new API response shape and symbol-based calls
- Update `backfill.test.ts` for new constant (1825) and symbol lookup

## What stays the same

- CoinGecko for current prices (`crypto.ts`)
- Search endpoint
- Database schema
- Stock, ETF, fiat providers

## Asset ID mapping

CryptoCompare uses ticker symbols (`BTC`), our DB uses CoinGecko IDs (`bitcoin`) with a `symbol` column. The backfill function looks up the symbol from the assets table before calling CryptoCompare.
