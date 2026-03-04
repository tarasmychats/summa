# WealthTrack Backend

Node.js/TypeScript price API server with PostgreSQL for historical price caching.

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL) or a PostgreSQL 16 instance

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create environment file:
   ```
   cp .env.example .env
   ```

   Configure these variables in `.env`:
   | Variable | Description | Default |
   |----------|-------------|---------|
   | `PORT` | Server port | `3001` |
   | `DATABASE_URL` | PostgreSQL connection string | `postgresql://wealthtrack:wealthtrack@localhost:5432/wealthtrack` |
   | `COINGECKO_API_KEY` | CoinGecko demo API key (optional, increases rate limits) | — |
   | `EXCHANGERATE_API_KEY` | ExchangeRate API key | — |

3. Start PostgreSQL:
   ```
   npm run dev:db
   ```
   This runs `docker compose up -d postgres` with PostgreSQL 16 on port 5432.

4. Start the dev server:
   ```
   npm run dev
   ```
   The server automatically runs database migrations on startup (creates tables if they don't exist). If PostgreSQL is unavailable, the server still starts but historical price features are disabled.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run dev:db` | Start PostgreSQL via docker-compose |
| `npm run dev:db:stop` | Stop PostgreSQL |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm test` | Run tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |

## API Endpoints

### GET /health

Health check. Returns `{ status: "ok", db: true|false }`.

### POST /api/prices

Fetch current prices for a list of assets. Also registers assets for historical tracking.

**Request body:**
```json
{
  "assets": [
    { "id": "bitcoin", "category": "crypto" },
    { "id": "AAPL", "category": "stock" },
    { "id": "EUR", "category": "fiat" }
  ],
  "baseCurrency": "usd"
}
```

**Response:**
```json
{
  "prices": {
    "bitcoin": { "price": 65000, "change24h": 2.5 },
    "AAPL": { "price": 178.5, "change24h": -0.3 },
    "EUR": { "price": 0.92, "change24h": 0.1 }
  },
  "baseCurrency": "usd"
}
```

### GET /api/search

Search for assets across all categories.

**Query parameters:**
- `q` (required) — search query
- `category` (optional) — filter by category: `crypto`, `stock`, or `fiat`

Results are ordered: fiat first, then stocks, then crypto.

**Response:**
```json
{
  "results": [
    { "id": "EUR", "name": "Euro", "category": "fiat" },
    { "id": "AAPL", "name": "Apple Inc.", "category": "stock" },
    { "id": "bitcoin", "name": "Bitcoin", "category": "crypto" }
  ]
}
```

### GET /api/history

Fetch historical daily prices for one or more assets.

**Query parameters:**
- `assets` (required) — comma-separated asset IDs (e.g., `bitcoin,AAPL`)
- `categories` (required) — comma-separated categories matching assets (e.g., `crypto,stock`)
- `from` (required) — start date, ISO format (e.g., `2024-01-01`)
- `to` (required) — end date, ISO format (e.g., `2025-01-01`)
- `currency` (required) — `usd` or `eur`

The `assets` and `categories` arrays must have the same length.

Response keys use the composite format `assetId:category` to disambiguate assets that may share an ID across categories.

**Response:**
```json
{
  "history": {
    "bitcoin:crypto": [
      { "date": "2024-01-01", "price": 42000 },
      { "date": "2024-01-02", "price": 42500 }
    ],
    "AAPL:stock": [
      { "date": "2024-01-01", "price": 185.2 },
      { "date": "2024-01-02", "price": 186.1 }
    ]
  },
  "currency": "usd",
  "from": "2024-01-01",
  "to": "2025-01-01"
}
```

If an asset has no history yet, its array will be empty and a background backfill is triggered.

## Database Schema

The server uses three tables (auto-created on startup):

- **tracked_assets** — assets that have been requested via the prices endpoint
- **daily_prices** — cached daily prices in USD and EUR
- **backfill_status** — tracks how far back historical data has been fetched per asset

## Background Jobs

A daily cron job runs at 02:00 UTC that:
1. Fetches today's price for all tracked assets
2. Inserts prices into `daily_prices`
3. Triggers backfill for any new assets (up to 365 days for crypto, 5 years for stocks/fiat)

Rate limits are respected per provider (CoinGecko: 2s delay, Yahoo Finance: 5s delay, Frankfurter: 1s delay).

## Architecture

```
Client (iOS App)
    |
    v
Express Server (stateless)
    |
    +-- POST /api/prices -----> CoinGecko / Yahoo Finance / Frankfurter (live prices)
    +-- GET /api/search ------> CoinGecko / Yahoo Finance / Frankfurter (search)
    +-- GET /api/history -----> PostgreSQL (cached daily prices)
    +-- Cron (02:00 UTC) -----> Fetches + caches prices into PostgreSQL
```

No user data is stored server-side. The database only caches publicly available price data.
