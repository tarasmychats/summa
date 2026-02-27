# Asset Search API — Design Document

**Date:** 2026-02-27
**Status:** Approved

## Problem

The iOS app has a hardcoded catalog of 16 assets (6 crypto, 6 stocks, 4 fiat). Users can only add assets from this fixed list. We need dynamic search so users can find any crypto, stock/ETF, or fiat currency.

## Solution

Add a single `GET /api/search` endpoint to the backend that proxies search across CoinGecko (crypto), Yahoo Finance (stocks), and ExchangeRate API (fiat). The iOS app replaces its hardcoded catalog with API-driven search.

## Backend: `GET /api/search`

**Query params:**
- `q` (string, required) — search text
- `category` (string, optional) — `crypto`, `stock`, or `fiat`. If omitted, searches all three.

**Response:**
```json
{
  "results": [
    { "id": "bitcoin", "name": "Bitcoin", "symbol": "BTC", "category": "crypto" }
  ]
}
```

**Data sources:**
- **Crypto:** CoinGecko `GET /api/v3/search?query=...` — returns coins with id, name, symbol
- **Stocks:** yahoo-finance2 `search()` — returns quotes with symbol and shortname
- **Fiat:** ExchangeRate API currency list from `/latest/USD` — filter currency codes by query. Cache for 24 hours.

**Caching:**
- Fiat currency list: 24 hours (currencies rarely change)
- Search results: 5 minutes (keyed by query + category)

**Error handling:** Return empty results on upstream API failure (graceful degradation).

## iOS Changes

- Remove hardcoded asset lists from `AssetCatalog`, keep `AssetDefinition` struct
- Add `searchAssets(query:)` method to `PriceAPIClient`
- Update `AddAssetView` to use debounced search (300ms) calling the API
- Show loading spinner during search, "No results" on empty, grouped by category

## Error Handling

- Backend: empty results on upstream failure
- iOS: "No results found" on empty response, "Search failed" on network error
