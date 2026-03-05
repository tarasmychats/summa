# Curated Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace live API search with a pre-populated DB of ~308 curated assets and backfill prices for all of them.

**Architecture:** New `assets` table seeded on startup from a hardcoded list. Search becomes a DB query. `tracked_assets` table removed. ETF category added (treated like stocks for pricing). Cron backfills all assets in the `assets` table.

**Tech Stack:** Node.js/TypeScript, PostgreSQL, Express, Vitest

---

### Task 1: Add `assets` table to DB schema, remove `tracked_assets`

**Files:**
- Modify: `backend/src/db.ts`

**Step 1: Update `initDb()` in `backend/src/db.ts`**

Replace the `tracked_assets` CREATE TABLE with the new `assets` table and add a DROP for the old table:

```typescript
// In initDb(), replace the tracked_assets CREATE TABLE block with:

await db.query(`
  CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    PRIMARY KEY (id, category)
  )
`);

// Drop legacy table (safe — data now lives in seed file)
await db.query(`DROP TABLE IF EXISTS tracked_assets`);
```

Keep `daily_prices` and `backfill_status` CREATE TABLE blocks unchanged.

**Step 2: Run the existing DB test to verify schema init still works**

Run: `cd backend && npm test -- src/__tests__/db.test.ts`
Expected: PASS (tests mock the pool, so the new SQL is just validated structurally)

**Step 3: Commit**

```bash
git add backend/src/db.ts
git commit -m "feat: replace tracked_assets with assets table in DB schema"
```

---

### Task 2: Create the assets repository

**Files:**
- Create: `backend/src/repositories/assets.ts`
- Create: `backend/src/repositories/__tests__/assets.test.ts`

**Step 1: Write the test file `backend/src/repositories/__tests__/assets.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
vi.mock("../../db.js", () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { seedAssets, getAllAssets, searchAssets } from "../assets.js";

describe("assets repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  describe("seedAssets", () => {
    it("does nothing for empty array", async () => {
      await seedAssets([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("builds parameterized INSERT with ON CONFLICT DO NOTHING", async () => {
      await seedAssets([
        { id: "bitcoin", category: "crypto", name: "Bitcoin", symbol: "BTC" },
        { id: "AAPL", category: "stock", name: "Apple Inc.", symbol: "AAPL" },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO assets");
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("DO NOTHING");
      expect(params).toEqual([
        "bitcoin", "crypto", "Bitcoin", "BTC",
        "AAPL", "stock", "Apple Inc.", "AAPL",
      ]);
    });
  });

  describe("getAllAssets", () => {
    it("returns assets grouped by category", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "bitcoin", category: "crypto" },
          { id: "AAPL", category: "stock" },
          { id: "VOO", category: "etf" },
        ],
      });

      const result = await getAllAssets();
      expect(result.crypto).toEqual([{ assetId: "bitcoin", category: "crypto" }]);
      expect(result.stock).toEqual([{ assetId: "AAPL", category: "stock" }]);
      expect(result.etf).toEqual([{ assetId: "VOO", category: "etf" }]);
    });
  });

  describe("searchAssets", () => {
    it("queries with ILIKE pattern and optional category filter", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "bitcoin", category: "crypto", name: "Bitcoin", symbol: "BTC" },
        ],
      });

      const results = await searchAssets("bit");
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("ILIKE");
      expect(params[0]).toBe("%bit%");
      expect(params[1]).toBe("bit%");
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: "bitcoin",
        name: "Bitcoin",
        symbol: "BTC",
        category: "crypto",
      });
    });

    it("filters by category when provided", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await searchAssets("bit", "crypto");
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("category = ");
      expect(params).toContain("crypto");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/repositories/__tests__/assets.test.ts`
Expected: FAIL — `../assets.js` doesn't exist yet

**Step 3: Write `backend/src/repositories/assets.ts`**

```typescript
import { getPool } from "../db.js";
import type { SearchResult } from "../types.js";

export interface AssetSeed {
  id: string;
  category: string;
  name: string;
  symbol: string;
}

/**
 * Batch insert assets from seed data. ON CONFLICT DO NOTHING makes this idempotent.
 */
export async function seedAssets(assets: AssetSeed[]): Promise<void> {
  if (assets.length === 0) return;

  const pool = getPool();

  const values: string[] = [];
  const params: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const offset = i * 4;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
    );
    params.push(assets[i].id, assets[i].category, assets[i].name, assets[i].symbol);
  }

  await pool.query(
    `INSERT INTO assets (id, category, name, symbol)
     VALUES ${values.join(", ")}
     ON CONFLICT (id, category) DO NOTHING`,
    params
  );
}

/**
 * Returns all assets grouped by category (used by cron job).
 */
export async function getAllAssets(): Promise<
  Record<string, Array<{ assetId: string; category: string }>>
> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, category FROM assets ORDER BY category, id`
  );

  const grouped: Record<string, Array<{ assetId: string; category: string }>> = {};
  for (const row of result.rows) {
    if (!grouped[row.category]) {
      grouped[row.category] = [];
    }
    grouped[row.category].push({ assetId: row.id, category: row.category });
  }
  return grouped;
}

/**
 * Search assets by name, symbol, or id. Returns results ordered by relevance.
 */
export async function searchAssets(
  query: string,
  category?: string
): Promise<SearchResult[]> {
  const pool = getPool();
  const pattern = `%${query}%`;
  const prefixPattern = `${query}%`;

  let sql = `
    SELECT id, category, name, symbol FROM assets
    WHERE (name ILIKE $1 OR symbol ILIKE $1 OR id ILIKE $1)
  `;
  const params: string[] = [pattern, prefixPattern];

  if (category) {
    sql += ` AND category = $3`;
    params.push(category);
  }

  sql += `
    ORDER BY
      CASE WHEN symbol ILIKE $2 THEN 0 ELSE 1 END,
      CASE category WHEN 'fiat' THEN 0 WHEN 'stock' THEN 1 WHEN 'etf' THEN 2 WHEN 'crypto' THEN 3 END,
      name
    LIMIT 50
  `;

  const result = await pool.query(sql, params);
  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    category: row.category,
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/repositories/__tests__/assets.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/repositories/assets.ts backend/src/repositories/__tests__/assets.test.ts
git commit -m "feat: add assets repository with seed, getAll, and search"
```

---

### Task 3: Create the seed data file

**Files:**
- Create: `backend/src/seed/assets.ts`

**Step 1: Create `backend/src/seed/assets.ts`**

This file exports the curated list. Use these exact assets:

**8 Fiat currencies:**
USD, EUR, UAH, GBP, CHF, JPY, CAD, PLN

**100 Crypto** (CoinGecko IDs — top 100 by market cap):
bitcoin, ethereum, tether, ripple, binancecoin, solana, usd-coin, dogecoin, cardano, tron, avalanche-2, chainlink, shiba-inu, stellar, sui, hedera-hashgraph, bitcoin-cash, polkadot, litecoin, hyperliquid, uniswap, dai, leo-token, near, ethereum-classic, aptos, internet-computer, pepe, aave, render-token, mantle, cronos, vechain, cosmos, filecoin, kaspa, algorand, arbitrum, optimism, fantom, theta-token, the-graph, injective-protocol, immutable-x, ondo-finance, stacks, mantra, maker, celestia, flow, the-sandbox, axie-infinity, decentraland, gala, eos, neo, iota, kucoin-shares, quant-network, astar, chiliz, nexo, curve-dao-token, ecash, arweave, floki, raydium, tezos, bitcoin-sv, monero, okb, gatetoken, thorchain, fetch-ai, zcash, lido-dao, sei-network, worldcoin-wld, bonk, jupiter-exchange-solana, pyth-network, jito-governance-token, ethena, pendle, wormhole, dydx-chain, beam-2, blur, mina-protocol, synthetix-network-token, compound-governance-token, 1inch, pancakeswap-token, rocket-pool, gmx, sushiswap, convex-finance, yearn-finance, loopring, enjincoin

**100 Stocks** (tickers — top 100 by market cap):
AAPL, MSFT, NVDA, AMZN, GOOGL, META, BRK-B, LLY, TSM, AVGO, JPM, WMT, V, UNH, MA, XOM, COST, ORCL, HD, PG, NFLX, JNJ, BAC, CRM, ABBV, CVX, TMUS, KO, MRK, AMD, WFC, CSCO, NOW, ACN, LIN, MCD, IBM, ABT, PM, GE, CAT, ISRG, DIS, INTU, VZ, AMGN, QCOM, TXN, GS, PFE, BLK, MS, AXP, RTX, T, BKNG, LOW, SPGI, NEE, SCHW, DHR, HON, UNP, SYK, C, PLD, AMAT, VRTX, DE, MDT, BSX, LRCX, CB, ADI, PANW, BMY, KLAC, GILD, CI, ADP, FI, MO, SO, MDLZ, CME, REGN, SHW, SNPS, CDNS, PGR, ICE, ITW, EOG, APD, USB, ZTS, TJX, MMC, MCK

**100 ETFs** (tickers — top 100 by AUM):
SPY, IVV, VOO, VTI, QQQ, VEA, VTV, BND, IEFA, AGG, VWO, IEMG, VIG, IWF, VUG, IJH, GLD, IWM, VNQ, IJR, VXUS, SCHD, EFA, IWD, BNDX, VCIT, VO, XLF, XLK, ITOT, VCSH, VGT, LQD, IVW, VB, XLE, XLV, BSV, VYM, TIP, SCHX, IGSB, GOVT, IWB, MUB, DIA, XLI, SCHB, VEU, IWR, SPDW, DVY, IEF, VTIP, RSP, SHV, JPST, XLY, XLP, SCHA, XLU, SPYV, SDY, MINT, IWS, DFAC, VTEB, VBR, VGK, SPYG, QUAL, MDY, SCHF, EEM, SPTS, IWP, ESGU, DGRO, DFAS, IWN, SPLG, VBK, ACWI, USMV, FTCS, SPAB, DFUS, JEPI, HYG, SHY, EMB, IUSB, SCHG, IEI, VLUE, FLOT, VGSH, JPMB, VMBS, DFIV

The file structure:

```typescript
export interface SeedAsset {
  id: string;
  category: "fiat" | "crypto" | "stock" | "etf";
  name: string;
  symbol: string;
}

export const SEED_ASSETS: SeedAsset[] = [
  // === FIAT (8) ===
  { id: "USD", category: "fiat", name: "US Dollar", symbol: "USD" },
  // ... etc

  // === CRYPTO (100) ===
  { id: "bitcoin", category: "crypto", name: "Bitcoin", symbol: "BTC" },
  // ... etc

  // === STOCKS (100) ===
  { id: "AAPL", category: "stock", name: "Apple Inc.", symbol: "AAPL" },
  // ... etc

  // === ETFs (100) ===
  { id: "SPY", category: "etf", name: "SPDR S&P 500 ETF Trust", symbol: "SPY" },
  // ... etc
];
```

You must fill in the full names for all 308 assets. Use real, accurate company/fund names.

**Step 2: Commit**

```bash
git add backend/src/seed/assets.ts
git commit -m "feat: add curated seed data for 308 assets"
```

---

### Task 4: Update `AssetCategory` type to include ETF

**Files:**
- Modify: `backend/src/types.ts`

**Step 1: Update the type**

In `backend/src/types.ts`, change:

```typescript
export type AssetCategory = "crypto" | "stock" | "fiat";
```

to:

```typescript
export type AssetCategory = "crypto" | "stock" | "etf" | "fiat";
```

**Step 2: Run full test suite to check for type breakage**

Run: `cd backend && npm test`
Expected: PASS (no runtime behavior depends on the exhaustive list)

**Step 3: Commit**

```bash
git add backend/src/types.ts
git commit -m "feat: add 'etf' to AssetCategory type"
```

---

### Task 5: Rewrite search route to use DB

**Files:**
- Modify: `backend/src/routes/search.ts`
- Modify: `backend/src/routes/__tests__/search.test.ts`

**Step 1: Rewrite the test file `backend/src/routes/__tests__/search.test.ts`**

The search route now queries the DB via the assets repository instead of calling external APIs. Rewrite tests to mock the repository:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockSearchAssets = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/assets.js", () => ({
  searchAssets: mockSearchAssets,
}));

import { createSearchRouter } from "../search.js";

describe("GET /api/search", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use("/api", createSearchRouter());

    mockSearchAssets.mockResolvedValue([
      { id: "USD", name: "US Dollar", symbol: "USD", category: "fiat" },
      { id: "AAPL", name: "Apple Inc.", symbol: "AAPL", category: "stock" },
      { id: "SPY", name: "SPDR S&P 500 ETF", symbol: "SPY", category: "etf" },
      { id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: "crypto" },
    ]);
  });

  it("returns results from all categories ordered fiat → stock → etf → crypto", async () => {
    const response = await request(app).get("/api/search?q=bit");

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(4);
    expect(mockSearchAssets).toHaveBeenCalledWith("bit", undefined);
  });

  it("passes category filter to repository", async () => {
    mockSearchAssets.mockResolvedValue([
      { id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: "crypto" },
    ]);

    const response = await request(app).get("/api/search?q=bit&category=crypto");

    expect(response.status).toBe(200);
    expect(mockSearchAssets).toHaveBeenCalledWith("bit", "crypto");
    expect(response.body.results.every((r: any) => r.category === "crypto")).toBe(true);
  });

  it("returns 400 when q param is missing", async () => {
    const response = await request(app).get("/api/search");

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/routes/__tests__/search.test.ts`
Expected: FAIL — search.ts still imports the old search services

**Step 3: Rewrite `backend/src/routes/search.ts`**

```typescript
import { Router } from "express";
import { searchAssets } from "../repositories/assets.js";
import type { SearchResponse } from "../types.js";

export function createSearchRouter(): Router {
  const router = Router();

  router.get("/search", async (req, res) => {
    const q = ((req.query.q as string) ?? "").trim();
    const category = (req.query.category as string) || undefined;

    if (!q) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const results = await searchAssets(q, category);
    const response: SearchResponse = { results };
    res.json(response);
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/routes/__tests__/search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/search.ts backend/src/routes/__tests__/search.test.ts
git commit -m "feat: rewrite search to query assets table instead of external APIs"
```

---

### Task 6: Remove tracked_assets from prices route

**Files:**
- Modify: `backend/src/routes/prices.ts`
- Modify: `backend/src/routes/__tests__/prices.test.ts`

**Step 1: Update `backend/src/routes/prices.ts`**

Remove these parts:
- The import of `upsertTrackedAssets`
- The entire fire-and-forget block (lines 48-58: `validCategories`, `trackableAssets`, `upsertTrackedAssets` call)

Also add ETF support: ETFs should be fetched via `fetchStockPrices` (same provider). Change the stock filtering to include ETFs:

```typescript
const stockIds = uncachedAssets
  .filter((a) => a.category === "stock" || a.category === "etf")
  .map((a) => a.id);
```

And when creating `convertedStockPrices`, preserve the original category from the request (not hardcode "stock"):

The `fetchStockPrices` returns results with `category: "stock"`. We need to map the category back to what was requested. After `convertStockPricesToBase`, update the categories:

```typescript
const convertedStockPrices = await convertStockPricesToBase(stockPrices, base);

// Restore original category for ETFs (fetchStockPrices returns category: "stock")
const etfIds = new Set(
  uncachedAssets.filter((a) => a.category === "etf").map((a) => a.id)
);
for (const price of convertedStockPrices) {
  if (etfIds.has(price.id)) {
    (price as any).category = "etf";
  }
}
```

**Step 2: Update `backend/src/routes/__tests__/prices.test.ts`**

Remove:
- The `mockUpsertTrackedAssets` hoisted mock
- The `vi.mock("../../repositories/trackedAssets.js", ...)` block
- The test "calls upsertTrackedAssets with requested assets after fetching prices"
- The test "does not block response when upsertTrackedAssets fails"
- The test "does not call upsertTrackedAssets for invalid requests"

Add a test for ETF support:

```typescript
it("fetches ETF prices using stock provider", async () => {
  mockFetchStockPrices.mockResolvedValue([
    {
      id: "SPY",
      category: "stock",
      price: 520,
      currency: "USD",
      change24h: 0.4,
      updatedAt: "2026-02-27T00:00:00Z",
    },
  ]);

  const response = await request(app)
    .post("/api/prices")
    .send({
      assets: [{ id: "SPY", category: "etf" }],
      baseCurrency: "USD",
    });

  expect(response.status).toBe(200);
  expect(response.body.prices[0].category).toBe("etf");
  expect(response.body.prices[0].id).toBe("SPY");
});
```

**Step 3: Run test to verify it passes**

Run: `cd backend && npm test -- src/routes/__tests__/prices.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/src/routes/prices.ts backend/src/routes/__tests__/prices.test.ts
git commit -m "feat: remove tracked_assets from prices, add ETF support"
```

---

### Task 7: Add ETF support to backfill and cron

**Files:**
- Modify: `backend/src/services/backfill.ts`
- Modify: `backend/src/services/cronJob.ts`
- Modify: `backend/src/services/__tests__/backfill.test.ts`
- Modify: `backend/src/services/__tests__/cronJob.test.ts`

**Step 1: Update `backend/src/services/backfill.ts`**

In `backfillAsset()`, add the ETF case to the switch. ETFs use the same logic as stocks:

```typescript
case "etf":
  prices = await fetchAndMapStock(assetId);
  // Tag with correct category
  prices = prices.map((p) => ({ ...p, category: "etf" }));
  break;
```

In `getRateLimitDelay()`, add:

```typescript
case "etf":
  return stockRateLimit;
```

**Step 2: Update `backend/src/services/cronJob.ts`**

Replace `getAllTrackedAssets` import with `getAllAssets` from assets repository:

```typescript
// Replace:
import { getAllTrackedAssets } from "../repositories/trackedAssets.js";
// With:
import { getAllAssets } from "../repositories/assets.js";
```

In `runDailyPriceUpdate()`, replace:

```typescript
// Replace:
groupedAssets = await getAllTrackedAssets();
// With:
groupedAssets = await getAllAssets();
```

In `fetchAndStoreTodayPrice()`, add ETF case (same as stock):

```typescript
case "etf": {
  const result = await fetchStockPrices([assetId]);
  if (result.length === 0) {
    logger.warn("no ETF price returned for today", { assetId });
    return false;
  }

  const { iso: isoCurrency, divisor } = normalizeCurrency(result[0].currency);
  const nativePrice = result[0].price / divisor;

  let priceUsd: number;
  let priceEur: number | null = null;

  if (isoCurrency === "USD") {
    priceUsd = nativePrice;
    priceEur = eurPerUsd != null ? priceUsd * eurPerUsd : null;
  } else {
    try {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
      const fxRates = await fetchFiatHistory(isoCurrency, yesterday, today);
      if (fxRates.length > 0) {
        const fx = fxRates[fxRates.length - 1];
        priceUsd = nativePrice * fx.priceUsd;
        priceEur = nativePrice * fx.priceEur;
      } else {
        logger.warn("no FX rate for non-USD ETF, skipping", { assetId, nativeCurrency: isoCurrency });
        return false;
      }
    } catch (err) {
      logger.warn("FX conversion failed for non-USD ETF", {
        assetId,
        nativeCurrency: isoCurrency,
        error: String(err),
      });
      return false;
    }
  }

  prices = [
    {
      assetId,
      category: "etf",
      date: today,
      priceUsd,
      priceEur,
    },
  ];
  break;
}
```

**Step 3: Update tests**

In `backend/src/services/__tests__/backfill.test.ts`:
- Add a test case for ETF backfill (similar to stock backfill test, but with `category: "etf"`)
- Verify the category in the inserted prices is "etf"

In `backend/src/services/__tests__/cronJob.test.ts`:
- Replace all `getAllTrackedAssets` mock references with `getAllAssets` from `../../repositories/assets.js`
- Add a test for ETF in `fetchAndStoreTodayPrice` (similar to stock test but with category "etf")

**Step 4: Run tests**

Run: `cd backend && npm test -- src/services/__tests__/backfill.test.ts src/services/__tests__/cronJob.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/backfill.ts backend/src/services/cronJob.ts \
  backend/src/services/__tests__/backfill.test.ts backend/src/services/__tests__/cronJob.test.ts
git commit -m "feat: add ETF support to backfill and cron, use assets repo"
```

---

### Task 8: Wire seeding into server startup

**Files:**
- Modify: `backend/src/index.ts`

**Step 1: Update `backend/src/index.ts`**

Add import and call seed after `initDb()`:

```typescript
import { seedAssets } from "./repositories/assets.js";
import { SEED_ASSETS } from "./seed/assets.js";
```

In `startServer()`, after `setDbReady(true)`:

```typescript
try {
  await initDb();
  setDbReady(true);
  logger.info("database initialized");
  await seedAssets(SEED_ASSETS);
  logger.info("assets seeded", { count: SEED_ASSETS.length });
} catch (err) {
  // ... existing error handling
}
```

**Step 2: Run server test to verify**

Run: `cd backend && npm test -- src/__tests__/server.test.ts`
Expected: May need to add mock for the new imports. Add to the test file:

```typescript
vi.mock("../repositories/assets.js", () => ({
  seedAssets: vi.fn().mockResolvedValue(undefined),
  searchAssets: vi.fn().mockResolvedValue([]),
}));

vi.mock("../seed/assets.js", () => ({
  SEED_ASSETS: [],
}));
```

And remove the old mocks for deleted modules:
- Remove `vi.mock("../repositories/trackedAssets.js", ...)`
- Remove `vi.mock("../services/cryptoSearch.js", ...)`
- Remove `vi.mock("../services/stockSearch.js", ...)`
- Remove `vi.mock("../services/fiatSearch.js", ...)`

**Step 3: Run full test suite**

Run: `cd backend && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/src/index.ts backend/src/__tests__/server.test.ts
git commit -m "feat: seed assets on server startup"
```

---

### Task 9: Delete old files

**Files:**
- Delete: `backend/src/services/cryptoSearch.ts`
- Delete: `backend/src/services/stockSearch.ts`
- Delete: `backend/src/services/fiatSearch.ts`
- Delete: `backend/src/repositories/trackedAssets.ts`
- Delete: `backend/src/services/__tests__/cryptoSearch.test.ts` (if exists)
- Delete: `backend/src/services/__tests__/stockSearch.test.ts` (if exists)
- Delete: `backend/src/services/__tests__/fiatSearch.test.ts` (if exists)
- Delete: `backend/src/repositories/__tests__/trackedAssets.test.ts`

**Step 1: Delete the files**

```bash
cd backend
rm -f src/services/cryptoSearch.ts src/services/stockSearch.ts src/services/fiatSearch.ts
rm -f src/repositories/trackedAssets.ts
rm -f src/services/__tests__/cryptoSearch.test.ts src/services/__tests__/stockSearch.test.ts
rm -f src/services/__tests__/fiatSearch.test.ts src/services/__tests__/fiatSearch.test.ts
rm -f src/repositories/__tests__/trackedAssets.test.ts
```

**Step 2: Run full test suite to verify no broken imports**

Run: `cd backend && npm test`
Expected: PASS — all remaining tests should work since we've already updated all imports

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old search services and trackedAssets repository"
```

---

### Task 10: Final integration test

**Step 1: Build to verify TypeScript compilation**

Run: `cd backend && npm run build`
Expected: PASS — no type errors

**Step 2: Run full test suite**

Run: `cd backend && npm test`
Expected: All tests PASS

**Step 3: Manual smoke test**

Run: `cd backend && npm run dev`
Expected logs:
- "database initialized"
- "assets seeded" with count: 308
- "daily cron job scheduled"
- If `RUN_CRON_ON_STARTUP=true`: "RUN_CRON_ON_STARTUP enabled — running daily price update now"

Test search: `curl "http://localhost:3001/api/search?q=apple"`
Expected: Returns Apple Inc. (stock) and any matching ETFs/crypto

Test search with category: `curl "http://localhost:3001/api/search?q=spy&category=etf"`
Expected: Returns SPY ETF

**Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix: integration adjustments from smoke test"
```
