# WealthTrack

Multi-asset wealth tracking app — monorepo with Node.js backend and iOS app.

## Structure

- `backend/` — Node.js/TypeScript price API server with PostgreSQL
- `mobile/WealthTrack/` — SwiftUI iOS app
- `docs/plans/` — Design and implementation documents

## Backend commands

- `cd backend && npm run dev` — start dev server (requires PostgreSQL)
- `cd backend && npm run dev:db` — start PostgreSQL via docker-compose
- `cd backend && npm run dev:db:stop` — stop PostgreSQL
- `cd backend && npm test` — run tests
- `cd backend && npm run build` — compile TypeScript

## Backend setup

1. Copy `backend/.env.example` to `backend/.env` and fill in values
2. Start PostgreSQL: `cd backend && npm run dev:db`
3. Start server: `cd backend && npm run dev` (runs DB migrations on startup)

## API endpoints

- `GET /health` — health check (includes DB status)
- `POST /api/prices` — fetch current prices for assets (also registers them for tracking)
- `GET /api/search?q=<query>&category=<optional>` — search assets (ordered: fiat, stocks, crypto)
- `GET /api/history?assets=<ids>&categories=<cats>&from=<date>&to=<date>&currency=<usd|eur>` — historical price data

## Key decisions

- Backend caches historical prices in PostgreSQL; no user data stored server-side
- Daily cron job (02:00 UTC) backfills and updates price history
- User portfolio data lives in CloudKit (via SwiftData)
- All business logic (projections, risk, insights) runs on-device in the iOS app
