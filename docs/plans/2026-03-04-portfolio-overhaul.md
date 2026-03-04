# Portfolio Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform WealthTrack from a current-price viewer into a full portfolio tracker with transactions, historical price charts, base currency selection, and improved search ranking.

**Architecture:** PostgreSQL for historical price cache (user data stays on-device in SwiftData). Background cron job populates daily prices. iOS computes portfolio charts locally from price history + transaction data.

**Tech Stack:**
- Backend: Express, PostgreSQL (via `pg`), `node-cron`, yahoo-finance2, CoinGecko API, Frankfurter API
- iOS: SwiftUI, SwiftData, Swift Charts, async/await

**Design doc:** `docs/plans/2026-03-04-portfolio-overhaul-design.md`

---

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task** — no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

---

## Phase 1: Backend — PostgreSQL & Database Layer

### Task 1: Add PostgreSQL and database connection

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/db.ts`
- Create: `backend/docker-compose.yml`
- Modify: `backend/.env.example` (or create if not exists)

- [x] Add `pg` and `@types/pg` dependencies to `backend/package.json`
- [x] Create `backend/docker-compose.yml` with PostgreSQL 16 service (port 5432, db: `wealthtrack`, user: `wealthtrack`, password from env)
- [x] Create `backend/src/db.ts` — Pool singleton with connection config from env vars (`DATABASE_URL` or individual `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`)
- [x] Add `initDb()` function that creates tables if not exist (`tracked_assets`, `daily_prices`, `backfill_status`) using the schema from design doc
- [x] Add env vars to `.env.example`: `DATABASE_URL=postgresql://wealthtrack:wealthtrack@localhost:5432/wealthtrack`
- [x] Write tests for `initDb()` (table creation is idempotent)
- [x] Write tests for pool connection error handling
- [x] Run `npm test` — must pass before next task

### Task 2: Create tracked assets repository

**Files:**
- Create: `backend/src/repositories/trackedAssets.ts`

- [x] Create `upsertTrackedAssets(assets: Array<{assetId: string, category: string}>)` — batch upsert into `tracked_assets` using `ON CONFLICT DO NOTHING`
- [x] Create `getAllTrackedAssets()` — returns all tracked assets grouped by category
- [x] Write tests for `upsertTrackedAssets` (insert new, ignore duplicate)
- [x] Write tests for `getAllTrackedAssets` (empty, with data, grouped correctly)
- [x] Run `npm test` — must pass before next task

### Task 3: Create daily prices repository

**Files:**
- Create: `backend/src/repositories/dailyPrices.ts`

- [x] Create `insertDailyPrices(prices: Array<{assetId, category, date, priceUsd, priceEur}>)` — batch insert with `ON CONFLICT DO UPDATE`
- [x] Create `getDailyPrices(assetId, category, from, to, currency)` — returns array of `{date, price}` sorted by date
- [x] Create `getMultiAssetPrices(assets: Array<{assetId, category}>, from, to, currency)` — returns `Record<assetId, Array<{date, price}>>`
- [x] Write tests for `insertDailyPrices` (insert, upsert/update existing)
- [x] Write tests for `getDailyPrices` (date range filtering, currency selection, empty results)
- [x] Write tests for `getMultiAssetPrices` (multiple assets, correct grouping)
- [x] Run `npm test` — must pass before next task

### Task 4: Create backfill status repository

**Files:**
- Create: `backend/src/repositories/backfillStatus.ts`

- [x] Create `getBackfillStatus(assetId, category)` — returns `{oldestDate, lastUpdated}` or null
- [x] Create `upsertBackfillStatus(assetId, category, oldestDate)` — insert or update backfill record
- [x] Write tests for both functions (new asset, existing asset, null case)
- [x] Run `npm test` — must pass before next task

---

## Phase 2: Backend — Historical Data Fetching Services

### Task 5: Add historical crypto price service

**Files:**
- Create: `backend/src/services/cryptoHistory.ts`

- [x] Create `fetchCryptoHistory(coinId: string, days: number)` — calls CoinGecko `/coins/{id}/market_chart?vs_currency=usd&days={days}&interval=daily`
- [x] Parse response: extract daily prices from `prices` array (timestamp + price pairs)
- [x] Handle API key (optional, same pattern as existing `crypto.ts`)
- [x] Add rate limiting delay (2s between calls) when called in batch
- [x] Write tests for successful fetch (mock HTTP response)
- [x] Write tests for error handling (API error, rate limit, invalid coin ID)
- [x] Run `npm test` — must pass before next task

### Task 6: Add historical stock price service

**Files:**
- Create: `backend/src/services/stockHistory.ts`

- [x] Create `fetchStockHistory(symbol: string, years: number)` — uses yahoo-finance2 `.historical(symbol, { period1: fiveYearsAgo, period2: today, interval: '1d' })`
- [x] Parse response: extract daily `{date, close}` prices
- [x] Handle yahoo-finance2 errors (invalid symbol, no data)
- [x] Write tests for successful fetch (mock yahoo-finance2)
- [x] Write tests for error handling (invalid symbol, empty result)
- [x] Run `npm test` — must pass before next task

### Task 7: Add historical fiat rate service (Frankfurter)

**Files:**
- Create: `backend/src/services/fiatHistory.ts`

- [x] Create `fetchFiatHistory(currency: string, from: string, to: string)` — calls Frankfurter `https://api.frankfurter.dev/{from}..{to}?base=USD&symbols={currency}`
- [x] Parse response: `rates` object keyed by date, each containing `{currency: rate}`
- [x] Also compute EUR→USD inverse for the `price_eur` column
- [x] Handle errors (unsupported currency, API down)
- [x] Write tests for successful fetch (mock HTTP response)
- [x] Write tests for error handling (invalid currency, empty range)
- [x] Run `npm test` — must pass before next task

---

## Phase 3: Backend — Backfill & Cron Job

### Task 8: Create backfill orchestrator

**Files:**
- Create: `backend/src/services/backfill.ts`

- [x] Create `backfillAsset(assetId, category)` — checks `backfill_status`, fetches missing history using appropriate service (crypto/stock/fiat), inserts into `daily_prices`, updates `backfill_status`
- [x] For crypto: fetch 365 days max (CoinGecko free limit)
- [x] For stocks: fetch 5 years
- [x] For fiat: fetch 5 years via Frankfurter
- [x] Add rate limit awareness — respect per-provider delays
- [x] Write tests for backfill logic (already backfilled → skip, new asset → fetch, partial backfill → fill gap)
- [x] Write tests for error recovery (API fails mid-backfill)
- [x] Run `npm test` — must pass before next task

### Task 9: Create daily cron job

**Files:**
- Modify: `backend/package.json` (add `node-cron` dependency)
- Create: `backend/src/services/cronJob.ts`
- Modify: `backend/src/index.ts` (start cron on server boot)

- [x] Add `node-cron` and `@types/node-cron` dependencies
- [x] Create `startDailyCron()` — schedules job at `0 2 * * *` (02:00 UTC)
- [x] Job logic: get all `tracked_assets`, fetch today's price for each (reuse existing price services), convert to USD/EUR, insert into `daily_prices`
- [x] On first run for a new asset (no `backfill_status`), trigger `backfillAsset()`
- [x] Add structured logging (reuse existing pino logger)
- [x] Call `startDailyCron()` in `index.ts` server startup
- [x] Write tests for cron job logic (mock services, verify DB calls)
- [x] Run `npm test` — must pass before next task

---

## Phase 4: Backend — History API Endpoint

### Task 10: Add GET /api/history endpoint

**Files:**
- Modify: `backend/src/index.ts`

- [x] Add `GET /api/history` route with query params: `assets` (comma-separated), `categories` (comma-separated), `from` (date), `to` (date), `currency` (usd|eur)
- [x] Validate query params (assets and categories arrays must be same length, dates valid, currency is usd or eur)
- [x] Call `getMultiAssetPrices()` from daily prices repository
- [x] Return `{ history: { [assetId]: [{date, price}] }, currency, from, to }`
- [x] Handle case where asset has no history yet — return empty array, trigger async backfill
- [x] Write tests for valid request (mock repository)
- [x] Write tests for validation errors (missing params, invalid dates, invalid currency)
- [x] Write tests for empty history response
- [x] Run `npm test` — must pass before next task

### Task 11: Modify POST /api/prices to track assets

**Files:**
- Modify: `backend/src/index.ts`

- [x] After fetching prices, call `upsertTrackedAssets()` with the requested assets
- [x] This is fire-and-forget — don't block the response on DB write
- [x] Write tests verifying tracked assets are upserted on price request
- [x] Run `npm test` — must pass before next task

---

## Phase 5: Backend — Search Reordering

### Task 12: Reorder search results (fiat → stocks → crypto)

**Files:**
- Modify: `backend/src/index.ts` (search handler)

- [x] Change result concatenation order from `[...crypto, ...stock, ...fiat]` to `[...fiat, ...stock, ...crypto]`
- [x] Update existing search tests to verify new ordering
- [x] Write test specifically checking that "apple" returns stock results before crypto
- [x] Run `npm test` — must pass before next task

---

## Phase 6: Backend — Database Initialization on Startup

### Task 13: Wire up database init and migrations

**Files:**
- Modify: `backend/src/index.ts`

- [x] Call `initDb()` on server startup (before listening)
- [x] Handle DB connection failure gracefully — log error, still serve current-price endpoints (degrade gracefully)
- [x] Update `npm run dev` script or add instructions for starting PostgreSQL via docker-compose
- [x] Write integration test: server starts, DB tables exist
- [x] Run `npm test` — must pass before next task

---

## Phase 7: iOS — Transaction Model & CRUD

### Task 14: Add Transaction SwiftData model

**Files:**
- Create: `mobile/WealthTrack/WealthTrack/Models/Transaction.swift`
- Modify: `mobile/WealthTrack/WealthTrack/Models/Asset.swift` (add relationship)

- [x] Create `Transaction` model with fields: `id` (UUID), `date` (Date), `type` (TransactionType enum: `.delta`, `.snapshot`), `amount` (Double), `note` (String?), `createdAt` (Date)
- [x] Add `@Relationship` from Asset to Transaction (cascade delete)
- [x] Create `TransactionType` enum (String raw value, Codable)
- [x] Add computed property on Asset: `currentAmount` — replays transactions to compute current balance (if transactions exist, use them; otherwise fall back to `asset.amount`)
- [x] Verify SwiftData migration works (existing assets without transactions still load)

### Task 15: Create TransactionListView

**Files:**
- Create: `mobile/WealthTrack/WealthTrack/Views/TransactionListView.swift`

- [x] List all transactions for a given asset, sorted by date descending
- [x] Show date, type badge (delta/snapshot), amount, and optional note
- [x] Swipe-to-delete on each row
- [x] "Add Transaction" button in toolbar
- [x] Empty state: "No transactions yet"

### Task 16: Create AddTransactionView

**Files:**
- Create: `mobile/WealthTrack/WealthTrack/Views/AddTransactionView.swift`

- [x] Date picker (default: today)
- [x] Segmented picker for type: "Add/Subtract Amount" (delta) vs "Set New Total" (snapshot)
- [x] Amount text field with decimal keyboard
- [x] Optional note text field
- [x] Save button — creates Transaction, updates `asset.amount` to new computed value
- [x] Validation: amount must be > 0 for snapshot, non-zero for delta

### Task 17: Integrate transactions into AssetListView

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Views/AssetListView.swift`

- [x] Tap on asset row → navigate to asset detail (new view or sheet)
- [x] Asset detail shows: current amount (from transactions), current value, transaction list
- [x] "Edit" button to modify asset name/ticker (existing functionality)
- [x] Display `asset.currentAmount` instead of `asset.amount` where applicable

---

## Phase 8: iOS — Settings & Base Currency

### Task 18: Create SettingsView with currency picker

**Files:**
- Create: `mobile/WealthTrack/WealthTrack/Views/SettingsView.swift`
- Modify: `mobile/WealthTrack/WealthTrack/Models/UserSettings.swift`

- [ ] Create SettingsView with a Picker for base currency: USD, EUR
- [ ] Read/write `UserSettings.displayCurrency` via SwiftData
- [ ] Ensure `UserSettings` singleton is created on first launch if not exists
- [ ] Add Settings tab or navigation link from DashboardView

### Task 19: Pass base currency through price fetching

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Services/PriceAPIClient.swift`
- Modify views that call `fetchPrices`

- [ ] Read `displayCurrency` from UserSettings
- [ ] Pass it as `baseCurrency` parameter to `POST /api/prices`
- [ ] Pass it as `currency` parameter to `GET /api/history`
- [ ] Update DashboardView to display values with correct currency symbol

---

## Phase 9: iOS — Portfolio Chart

### Task 20: Add history endpoint to PriceAPIClient

**Files:**
- Modify: `mobile/WealthTrack/WealthTrack/Services/PriceAPIClient.swift`

- [ ] Add `fetchHistory(assets: [(id: String, category: String)], from: Date, to: Date, currency: String) async throws -> [String: [(date: String, price: Double)]]`
- [ ] Call `GET /api/history` with query parameters
- [ ] Parse JSON response into typed result

### Task 21: Create PortfolioChartView on DashboardView

**Files:**
- Create: `mobile/WealthTrack/WealthTrack/Views/PortfolioChartView.swift`
- Modify: `mobile/WealthTrack/WealthTrack/Views/DashboardView.swift`

- [ ] Create `PortfolioChartView` using Swift Charts `LineMark`
- [ ] On appear: fetch history for all held assets via `PriceAPIClient.fetchHistory()`
- [ ] Compute daily portfolio total: for each day, `total = Σ(assetPrice[day] × amountAtDay[asset])`
- [ ] `amountAtDay` = replay transactions up to that date for each asset
- [ ] Show time range selector: 1M, 3M, 6M, 1Y, 5Y (filter displayed data range)
- [ ] Add loading state and error handling
- [ ] Embed `PortfolioChartView` at top of DashboardView (above asset list)

### Task 22: Create AssetChartView for individual assets

**Files:**
- Create: `mobile/WealthTrack/WealthTrack/Views/AssetChartView.swift`

- [ ] Line chart showing single asset price over time
- [ ] Time range selector: 1M, 3M, 6M, 1Y, 5Y
- [ ] Show in asset detail view (from Task 17)
- [ ] Display price in user's base currency

---

## Phase 10: Verification & Documentation

### Task 23: Verify acceptance criteria

- [ ] Verify: assets can be added, removed, searched
- [ ] Verify: transactions can be created (delta and snapshot), updated, deleted per asset
- [ ] Verify: transaction list shows per asset
- [ ] Verify: dashboard shows portfolio value chart over time
- [ ] Verify: individual asset charts work on detail page
- [ ] Verify: base currency can be changed in settings (USD/EUR)
- [ ] Verify: search returns fiat first, then stocks, then crypto
- [ ] Verify: historical prices populate via cron job
- [ ] Run full backend test suite — all pass
- [ ] Run linter — all issues fixed

### Task 24: [Final] Update documentation

- [ ] Update `CLAUDE.md` with new backend commands (docker-compose, migrations)
- [ ] Update `backend/README.md` or create one with PostgreSQL setup instructions
- [ ] Document new API endpoints in existing Postman collection or README

---

## Technical Details

### Data Flow: Portfolio Chart
```
iOS App                          Backend                        PostgreSQL
   |                               |                               |
   |-- GET /api/history ---------->|                               |
   |   ?assets=BTC,AAPL            |-- SELECT from daily_prices -->|
   |   &from=2021-01-01            |<-- rows --------------------- |
   |   &currency=usd               |                               |
   |<-- { history: {...} } --------|                               |
   |                               |                               |
   | [compute locally]             |                               |
   | for each day:                 |                               |
   |   total = Σ(price × amount)   |                               |
   | render LineMark chart         |                               |
```

### Backfill Flow
```
Cron (02:00 UTC)
   |
   |--> get all tracked_assets
   |--> for each asset:
   |      check backfill_status
   |      if no status → backfill (5yr stocks, 365d crypto, 5yr fiat)
   |      fetch today's price → insert daily_prices
   |      update backfill_status
```

### Rate Limits
- CoinGecko: 30 req/min → 2s delay between historical fetches
- Yahoo Finance: unofficial → 5s delay between symbols
- Frankfurter: no documented limit → 1s delay to be polite

## Post-Completion

**Manual verification:**
- Test portfolio chart with real data on simulator
- Test on physical device (verify API connectivity)
- Test currency switching updates all views
- Test transaction replay accuracy with mixed delta/snapshot transactions

**Infrastructure:**
- Set up PostgreSQL for production (managed DB service)
- Configure `DATABASE_URL` in production environment
- Set cron job timezone considerations for production
