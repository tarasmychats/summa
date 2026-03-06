# Summa

Multi-asset wealth tracking app — monorepo with Node.js backend and iOS app.

## Structure

- `backend/` — Node.js/TypeScript price API server with PostgreSQL
- `mobile/Summa/` — SwiftUI iOS app
- `docs/plans/` — Design and implementation documents

## Backend architecture

- `backend/src/routes/` — Express route handlers (prices, search, history)
- `backend/src/repositories/` — data access layer (trackedAssets, dailyPrices, backfillStatus)
- `backend/src/services/` — business logic (backfill orchestrator, cron job, per-provider history fetchers)
- `backend/src/db.ts` — PostgreSQL connection pool and schema initialization

## iOS architecture

- `mobile/Summa/Summa/Models/` — SwiftData models (Asset, Transaction, UserSettings, AssetCategory)
- `mobile/Summa/Summa/Views/` — SwiftUI views (Dashboard, AssetList, AssetDetail, AssetChart, PortfolioChart, Settings, Transactions)
- `mobile/Summa/Summa/ViewModels/` — view models (DashboardViewModel)
- `mobile/Summa/Summa/Logic/` — testable business logic helpers (AssetValueFormatter, ChartSelectionHelper, DuplicateAssetDetector, PortfolioCalculator, RiskCalculator, ProjectionEngine, InsightsEngine)
- `mobile/Summa/Summa/Services/` — API client, response models, and error helpers (PriceAPIClient, PriceModels, ErrorMessageHelper)

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
- Transactions use a replay model: `delta` (add/subtract) and `snapshot` (set total) types, replayed chronologically to compute `currentAmount`
- Portfolio chart: iOS fetches price history from backend, then locally computes daily portfolio total as sum(price x amount) per day
- UserSettings singleton auto-created on first launch; stores `displayCurrency` (USD or EUR)
- Theme.swift uses Dynamic Type text styles (not fixed font sizes) with `.rounded` design for accessibility
- Charts use `.chartOverlay` with `DragGesture` for interactive selection; shared logic in `ChartSelectionHelper`
- Haptic feedback via `.sensoryFeedback` on key interactions (add asset, save transaction, chart range taps)
- Error messages use `PriceErrorMessage.userMessage(from:)` to map URLError/APIError to user-friendly strings; shared across Dashboard, Projections, and Insights
- Dashboard shows portfolio value change (amount + percentage) derived from previous day's prices via `PortfolioCalculator.valueChange()`
- AddAssetView detects duplicate assets by symbol via `DuplicateAssetDetector`; shows badge and confirmation before re-adding
- VoiceOver accessibility labels on charts, risk score, time range buttons, and allocation chart
