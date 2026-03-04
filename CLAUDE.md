# WealthTrack

Multi-asset wealth tracking app — monorepo with Node.js backend and iOS app.

## Structure

- `backend/` — Node.js/TypeScript price API server with PostgreSQL
- `mobile/WealthTrack/` — SwiftUI iOS app
- `docs/plans/` — Design and implementation documents

## Backend architecture

- `backend/src/routes/` — Express route handlers (prices, search, history)
- `backend/src/repositories/` — data access layer (trackedAssets, dailyPrices, backfillStatus)
- `backend/src/services/` — business logic (backfill orchestrator, cron job, per-provider history fetchers)
- `backend/src/db.ts` — PostgreSQL connection pool and schema initialization

## Backend commands

- `cd backend && npm run dev` — start dev server (requires Docker + PostgreSQL)
- `cd backend && npm run dev:db` — start PostgreSQL via docker-compose
- `cd backend && npm run dev:db:stop` — stop PostgreSQL
- `cd backend && npm test` — run tests
- `cd backend && npm run test:watch` — run tests in watch mode
- `cd backend && npm run build` — compile TypeScript

## Backend setup

Prerequisites: Node.js, Docker (for PostgreSQL)

1. Copy `backend/.env.example` to `backend/.env` and fill in values
2. Start PostgreSQL: `cd backend && npm run dev:db` (requires Docker)
3. Start server: `cd backend && npm run dev` (runs DB migrations on startup)

## API endpoints

- `GET /health` — health check (includes DB status)
- `POST /api/prices` — fetch current prices for assets (also registers them for tracking)
- `GET /api/search?q=<query>&category=<optional>` — search assets (ordered: fiat, stocks, crypto)
- `GET /api/history?assets=<ids>&categories=<cats>&from=<date>&to=<date>&currency=<usd|eur>` — historical price data

## Key decisions

- Backend caches historical prices in PostgreSQL; no user data stored server-side
- Daily cron job (02:00 UTC) backfills and updates price history
- Server starts without PostgreSQL; history and cron features degrade gracefully
- User portfolio data lives in CloudKit (via SwiftData)
- All business logic (projections, risk, insights) runs on-device in the iOS app
- Dependencies: `pg` (PostgreSQL driver), `node-cron` (scheduled jobs), `yahoo-finance2`, CoinGecko API, Frankfurter API
