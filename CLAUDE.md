# Summa

Multi-asset wealth tracking app — monorepo with Node.js backend and iOS app.

## Structure

- `backend/` — Node.js/TypeScript price API server with PostgreSQL
- `mobile/Summa/` — SwiftUI iOS app
- `docs/plans/` — Design and implementation documents

## Backend architecture

- `backend/src/routes/` — Express route handlers (prices, search, history)
- `backend/src/routes/auth.ts` — authentication endpoints
- `backend/src/routes/user.ts` — user data endpoints
- `backend/src/repositories/` — data access layer (trackedAssets, dailyPrices, backfillStatus)
- `backend/src/repositories/users.ts` — user CRUD (create, find, merge, delete)
- `backend/src/repositories/userSettings.ts` — user settings CRUD
- `backend/src/repositories/userAssets.ts` — user assets CRUD with currentAmount
- `backend/src/repositories/userTransactions.ts` — transaction CRUD
- `backend/src/services/` — business logic (backfill orchestrator, cron job, per-provider history fetchers)
- `backend/src/services/auth.ts` — JWT signing/verification, Apple token validation
- `backend/src/middleware/` — auth middleware (JWT verification)
- `backend/src/db.ts` — PostgreSQL connection pool and schema initialization

## iOS architecture

- `mobile/Summa/Summa/Models/` — plain Codable structs (Asset, Transaction, UserSettings, AssetCategory) — no longer SwiftData @Model
- `mobile/Summa/Summa/Views/` — SwiftUI views (Dashboard, AssetList, AssetDetail, AssetChart, PortfolioChart, Settings, Transactions)
- `mobile/Summa/Summa/ViewModels/` — view models (DashboardViewModel)
- `mobile/Summa/Summa/Logic/` — testable business logic helpers (AssetValueFormatter, ChartSelectionHelper, DuplicateAssetDetector, PortfolioCalculator, RiskCalculator, ProjectionEngine, InsightsEngine)
- `mobile/Summa/Summa/Services/` — API client, response models, and error helpers (PriceAPIClient, PriceModels, ErrorMessageHelper)
- `mobile/Summa/Summa/Services/AuthManager.swift` — auth state management (anonymous + Apple Sign In)
- `mobile/Summa/Summa/Services/UserAPIClient.swift` — authenticated HTTP client for user data
- `mobile/Summa/Summa/Services/KeychainHelper.swift` — secure token storage

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
- `POST /api/auth/anonymous` — create anonymous user, return JWT tokens
- `POST /api/auth/apple` — sign in with Apple, return JWT tokens
- `POST /api/auth/merge` — merge anonymous into Apple account
- `POST /api/auth/refresh` — refresh access token
- `GET /api/user/settings` — get user settings
- `PATCH /api/user/settings` — update display currency, premium
- `GET /api/user/assets` — list assets with computed currentAmount
- `POST /api/user/assets` — add an asset
- `PATCH /api/user/assets/:id` — update an asset
- `DELETE /api/user/assets/:id` — delete asset + transactions
- `GET /api/user/assets/:id/transactions` — list transactions
- `POST /api/user/assets/:id/transactions` — add a transaction
- `DELETE /api/user/assets/:id/transactions/:txId` — delete a transaction
- `DELETE /api/user/account` — delete user and all data

## Key decisions

- User data (assets, transactions, settings) stored in backend PostgreSQL, not on-device
- Auth: anonymous device tokens (auto-created on first launch) + Apple Sign In with auto-merge
- JWT access tokens (1h) + refresh tokens (30d) stored in iOS Keychain
- All /api/user/* endpoints require JWT auth; existing price/search/history endpoints remain unauthenticated
- Account deletion cascades to all user data (App Store requirement)
- Backend caches historical prices in PostgreSQL
- Daily cron job (02:00 UTC) backfills and updates price history
- Server starts without PostgreSQL; history and cron features degrade gracefully
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
