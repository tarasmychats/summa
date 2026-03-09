# Price History Aggregation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce history API payload by auto-aggregating prices based on date range width, returning last-price-per-interval instead of every daily price.

**Architecture:** Add a resolution config and aggregated query to the `dailyPrices` repository. The history route computes resolution from `from`/`to` width and passes it through. Response gains a `resolution` field. iOS gets fewer points with no client-side changes required (optional: add `resolution` to the response model).

**Tech Stack:** PostgreSQL (DISTINCT ON for aggregation), TypeScript/Express, Swift/Codable

---

### Task 1: Add resolution config and helper

**Files:**
- Create: `backend/src/config/historyResolution.ts`
- Test: `backend/src/config/__tests__/historyResolution.test.ts`

**Step 1: Write the failing test**

Create `backend/src/config/__tests__/historyResolution.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getResolution } from "../historyResolution.js";

describe("getResolution", () => {
  it("returns 'daily' for 30-day range", () => {
    expect(getResolution("2026-01-01", "2026-01-31")).toBe("daily");
  });

  it("returns 'daily' for 90-day range (boundary)", () => {
    expect(getResolution("2026-01-01", "2026-04-01")).toBe("daily");
  });

  it("returns '3day' for 91-day range", () => {
    expect(getResolution("2026-01-01", "2026-04-02")).toBe("3day");
  });

  it("returns '3day' for 180-day range (boundary)", () => {
    expect(getResolution("2026-01-01", "2026-06-30")).toBe("3day");
  });

  it("returns 'weekly' for 181-day range", () => {
    expect(getResolution("2026-01-01", "2026-07-01")).toBe("weekly");
  });

  it("returns 'weekly' for 365-day range (boundary)", () => {
    expect(getResolution("2025-01-01", "2026-01-01")).toBe("weekly");
  });

  it("returns 'monthly' for 366-day range", () => {
    expect(getResolution("2025-01-01", "2026-01-02")).toBe("monthly");
  });

  it("returns 'monthly' for 5-year range", () => {
    expect(getResolution("2021-03-09", "2026-03-09")).toBe("monthly");
  });

  it("returns 'daily' for same-day range", () => {
    expect(getResolution("2026-01-01", "2026-01-01")).toBe("daily");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/config/__tests__/historyResolution.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `backend/src/config/historyResolution.ts`:

```typescript
export type Resolution = "daily" | "3day" | "weekly" | "monthly";

interface ResolutionTier {
  maxDays: number;
  resolution: Resolution;
}

const RESOLUTION_TIERS: ResolutionTier[] = [
  { maxDays: 90, resolution: "daily" },
  { maxDays: 180, resolution: "3day" },
  { maxDays: 365, resolution: "weekly" },
  { maxDays: Infinity, resolution: "monthly" },
];

/**
 * Determine the price aggregation resolution from a date range.
 * Shorter ranges get finer granularity; longer ranges are aggregated.
 */
export function getResolution(from: string, to: string): Resolution {
  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T00:00:00Z");
  const diffDays = Math.round(
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  for (const tier of RESOLUTION_TIERS) {
    if (diffDays <= tier.maxDays) return tier.resolution;
  }
  return "monthly";
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/config/__tests__/historyResolution.test.ts`
Expected: PASS — all 9 tests

**Step 5: Commit**

```
feat: add resolution config for price history aggregation
```

---

### Task 2: Add aggregated query to dailyPrices repository

**Files:**
- Modify: `backend/src/repositories/dailyPrices.ts` (add `getMultiAssetPricesAggregated`)
- Test: `backend/src/repositories/__tests__/dailyPrices.test.ts` (add tests)

**Step 1: Write the failing tests**

Add to `backend/src/repositories/__tests__/dailyPrices.test.ts` inside a new `describe("getMultiAssetPricesAggregated")` block:

```typescript
import {
  insertDailyPrices,
  getMultiAssetPrices,
  getMultiAssetPricesAggregated,
} from "../dailyPrices.js";

// ... inside the outer describe, add:

describe("getMultiAssetPricesAggregated", () => {
  it("delegates to getMultiAssetPrices for daily resolution", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { asset_id: "bitcoin", category: "crypto", date: "2025-01-01", price: "42000.00" },
        { asset_id: "bitcoin", category: "crypto", date: "2025-01-02", price: "43000.00" },
      ],
    });

    const result = await getMultiAssetPricesAggregated(
      [{ assetId: "bitcoin", category: "crypto" }],
      "2025-01-01",
      "2025-01-31",
      "usd",
      "daily"
    );

    expect(result["bitcoin:crypto"]).toHaveLength(2);
    // Should use the same query as getMultiAssetPrices (no DISTINCT ON)
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("DISTINCT ON");
  });

  it("uses DISTINCT ON for weekly resolution", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { asset_id: "bitcoin", category: "crypto", date: "2025-01-07", price: "43000.00" },
        { asset_id: "bitcoin", category: "crypto", date: "2025-01-14", price: "44000.00" },
      ],
    });

    const result = await getMultiAssetPricesAggregated(
      [{ assetId: "bitcoin", category: "crypto" }],
      "2025-01-01",
      "2025-03-31",
      "usd",
      "weekly"
    );

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("DISTINCT ON");
    expect(sql).toContain("date_trunc('week', date)");
    expect(sql).toContain("date DESC");
    expect(result["bitcoin:crypto"]).toHaveLength(2);
  });

  it("uses DISTINCT ON for monthly resolution", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { asset_id: "bitcoin", category: "crypto", date: "2025-01-31", price: "43000.00" },
      ],
    });

    await getMultiAssetPricesAggregated(
      [{ assetId: "bitcoin", category: "crypto" }],
      "2024-01-01",
      "2025-12-31",
      "usd",
      "monthly"
    );

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("DISTINCT ON");
    expect(sql).toContain("date_trunc('month', date)");
  });

  it("uses floor-based grouping for 3day resolution", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { asset_id: "bitcoin", category: "crypto", date: "2025-01-03", price: "43000.00" },
      ],
    });

    await getMultiAssetPricesAggregated(
      [{ assetId: "bitcoin", category: "crypto" }],
      "2025-01-01",
      "2025-06-30",
      "usd",
      "3day"
    );

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("DISTINCT ON");
    expect(sql).toContain("floor");
  });

  it("returns empty arrays for assets with no data", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getMultiAssetPricesAggregated(
      [{ assetId: "AAPL", category: "stock" }],
      "2025-01-01",
      "2025-12-31",
      "usd",
      "monthly"
    );

    expect(result["AAPL:stock"]).toEqual([]);
  });

  it("returns empty object for empty assets array", async () => {
    const result = await getMultiAssetPricesAggregated(
      [],
      "2025-01-01",
      "2025-12-31",
      "usd",
      "monthly"
    );

    expect(result).toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/repositories/__tests__/dailyPrices.test.ts`
Expected: FAIL — `getMultiAssetPricesAggregated` not exported

**Step 3: Write minimal implementation**

Add to `backend/src/repositories/dailyPrices.ts`:

```typescript
import type { Resolution } from "../config/historyResolution.js";

// Add this mapping above the function:
const TRUNC_EXPR: Record<Exclude<Resolution, "daily">, string> = {
  "3day": "floor((extract(epoch from date) - extract(epoch from date_trunc('year', date))) / (3 * 86400))",
  weekly: "date_trunc('week', date)",
  monthly: "date_trunc('month', date)",
};

/**
 * Get daily prices with optional aggregation.
 * For 'daily' resolution, behaves identically to getMultiAssetPrices.
 * For other resolutions, returns the last price per interval bucket
 * using DISTINCT ON.
 */
export async function getMultiAssetPricesAggregated(
  assets: Array<{ assetId: string; category: string }>,
  from: string,
  to: string,
  currency: "usd" | "eur",
  resolution: Resolution
): Promise<Record<string, DailyPrice[]>> {
  if (resolution === "daily") {
    return getMultiAssetPrices(assets, from, to, currency);
  }

  if (assets.length === 0) return {};

  const pool = getPool();
  const priceColumn = PRICE_COLUMNS[currency];
  if (!priceColumn) throw new Error(`Invalid currency: ${currency}`);

  const conditions: string[] = [];
  const params: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const offset = i * 2;
    conditions.push(
      `(asset_id = $${offset + 1} AND category = $${offset + 2})`
    );
    params.push(assets[i].assetId, assets[i].category);
  }

  const dateFromIdx = params.length + 1;
  const dateToIdx = params.length + 2;
  params.push(from, to);

  const bucket = TRUNC_EXPR[resolution];

  const result = await pool.query(
    `SELECT DISTINCT ON (asset_id, category, ${bucket})
       asset_id, category, date, ${priceColumn} AS price
     FROM daily_prices
     WHERE (${conditions.join(" OR ")}) AND date >= $${dateFromIdx} AND date <= $${dateToIdx}
       AND ${priceColumn} IS NOT NULL
     ORDER BY asset_id, category, ${bucket}, date DESC`,
    params
  );

  const grouped: Record<string, DailyPrice[]> = {};
  for (const asset of assets) {
    grouped[assetKey(asset.assetId, asset.category)] = [];
  }

  for (const row of result.rows) {
    const key = assetKey(row.asset_id, row.category);
    grouped[key]?.push({
      date: typeof row.date === "string" ? row.date : row.date.toISOString().split("T")[0],
      price: Number(row.price),
    });
  }

  return grouped;
}
```

**Note:** The `DISTINCT ON` with `ORDER BY ... date DESC` picks the last (most recent) price per bucket. The results come out in bucket order, with each bucket represented by its last day — which is exactly what we want.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/repositories/__tests__/dailyPrices.test.ts`
Expected: PASS — all tests including new ones

**Step 5: Commit**

```
feat: add aggregated price query with resolution support
```

---

### Task 3: Wire resolution into history route and add response field

**Files:**
- Modify: `backend/src/routes/history.ts`
- Test: `backend/src/routes/__tests__/history.test.ts`

**Step 1: Write the failing tests**

Add to `backend/src/routes/__tests__/history.test.ts`:

Update the mock at the top to also export the new function:

```typescript
const mockGetMultiAssetPricesAggregated = vi.fn();

vi.mock("../../repositories/dailyPrices.js", () => ({
  getMultiAssetPrices: (...args: unknown[]) => mockGetMultiAssetPrices(...args),
  getMultiAssetPricesAggregated: (...args: unknown[]) => mockGetMultiAssetPricesAggregated(...args),
  assetKey: (assetId: string, category: string) => `${assetId}:${category}`,
}));
```

Update `beforeEach` to also reset the new mock. Then add a new describe block:

```typescript
describe("resolution and aggregation", () => {
  it("returns resolution field in response", async () => {
    mockGetMultiAssetPricesAggregated.mockResolvedValue({
      "bitcoin:crypto": [{ date: "2024-01-31", price: 42000 }],
    });

    const response = await request(app).get("/api/history").query({
      assets: "bitcoin",
      categories: "crypto",
      from: "2024-01-01",
      to: "2024-01-31",
      currency: "usd",
    });

    expect(response.status).toBe(200);
    expect(response.body.resolution).toBe("daily");
  });

  it("uses monthly resolution for 5-year range", async () => {
    mockGetMultiAssetPricesAggregated.mockResolvedValue({
      "bitcoin:crypto": [{ date: "2025-12-31", price: 50000 }],
    });

    const response = await request(app).get("/api/history").query({
      assets: "bitcoin",
      categories: "crypto",
      from: "2021-03-09",
      to: "2026-03-09",
      currency: "usd",
    });

    expect(response.status).toBe(200);
    expect(response.body.resolution).toBe("monthly");
    expect(mockGetMultiAssetPricesAggregated).toHaveBeenCalledWith(
      expect.anything(),
      "2021-03-09",
      "2026-03-09",
      "usd",
      "monthly"
    );
  });

  it("uses weekly resolution for 1-year range", async () => {
    mockGetMultiAssetPricesAggregated.mockResolvedValue({
      "bitcoin:crypto": [],
    });

    const response = await request(app).get("/api/history").query({
      assets: "bitcoin",
      categories: "crypto",
      from: "2025-03-09",
      to: "2026-03-09",
      currency: "usd",
    });

    expect(response.status).toBe(200);
    expect(response.body.resolution).toBe("weekly");
  });

  it("uses daily resolution for short ranges", async () => {
    mockGetMultiAssetPricesAggregated.mockResolvedValue({
      "bitcoin:crypto": [],
    });

    const response = await request(app).get("/api/history").query({
      assets: "bitcoin",
      categories: "crypto",
      from: "2026-02-01",
      to: "2026-03-01",
      currency: "usd",
    });

    expect(response.status).toBe(200);
    expect(response.body.resolution).toBe("daily");
  });
});
```

Also update existing tests: since the route now calls `getMultiAssetPricesAggregated` instead of `getMultiAssetPrices`, update all existing `mockGetMultiAssetPrices` references to `mockGetMultiAssetPricesAggregated` in the test file. The old `mockGetMultiAssetPrices` is no longer called directly by the route.

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/__tests__/history.test.ts`
Expected: FAIL — route still calls old function, no `resolution` in response

**Step 3: Write the implementation**

Modify `backend/src/routes/history.ts`:

1. Add imports:
```typescript
import { getMultiAssetPricesAggregated } from "../repositories/dailyPrices.js";
import { getResolution } from "../config/historyResolution.js";
```

2. Replace the `getMultiAssetPrices` call (lines 110-115) with:
```typescript
const resolution = getResolution(fromStr, toStr);

const history = await getMultiAssetPricesAggregated(
  assetPairs,
  fromStr,
  toStr,
  currencyStr,
  resolution
);
```

3. Add `resolution` to the response (line 138-143):
```typescript
res.json({
  history,
  currency: currencyStr,
  from: fromStr,
  to: toStr,
  resolution,
});
```

4. Also add `resolution` to the graceful degradation response (lines 95-101):
```typescript
import { getResolution } from "../config/historyResolution.js";
// ...
const resolution = getResolution(fromStr, toStr);
res.json({
  history: emptyHistory,
  currency: currencyStr,
  from: fromStr,
  to: toStr,
  resolution,
});
```

5. Remove the now-unused `getMultiAssetPrices` import (keep `assetKey`).

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/__tests__/history.test.ts`
Expected: PASS — all tests including new resolution tests

**Step 5: Run all backend tests**

Run: `cd backend && npm test`
Expected: PASS — no regressions

**Step 6: Commit**

```
feat: wire resolution into history route, add resolution to response
```

---

### Task 4: Add resolution field to iOS response model (optional, backward-compatible)

**Files:**
- Modify: `mobile/Summa/Summa/Services/PriceModels.swift`

**Step 1: Update HistoryResponseBody**

Add optional `resolution` field:

```swift
struct HistoryResponseBody: Codable {
    let history: [String: [HistoryDataPoint]]
    let currency: String
    let from: String
    let to: String
    let resolution: String?  // e.g. "daily", "weekly", "monthly"
}
```

Since it's optional, this is fully backward-compatible — older backend responses without the field will decode as `nil`.

**Step 2: Commit**

```
feat(ios): add optional resolution field to history response model
```

---

### Task 5: Verify with integration test

**Files:**
- Existing: `backend/Summa.integration-tests.postman_collection.json` (or manual curl)

**Step 1: Start the dev server**

Run: `cd backend && npm run dev`

**Step 2: Test short range (should be daily)**

```bash
curl "http://localhost:3000/api/history?assets=bitcoin&categories=crypto&from=2026-02-01&to=2026-03-01&currency=usd" | jq '.resolution, (.history["bitcoin:crypto"] | length)'
```

Expected: `"daily"` and roughly 28 data points.

**Step 3: Test long range (should be monthly)**

```bash
curl "http://localhost:3000/api/history?assets=bitcoin&categories=crypto&from=2021-03-09&to=2026-03-09&currency=usd" | jq '.resolution, (.history["bitcoin:crypto"] | length)'
```

Expected: `"monthly"` and roughly 60 data points (vs ~1825 before).

**Step 4: Commit any fixes**

If any issues found, fix and commit.
