# CryptoCompare History Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace CoinGecko historical crypto fetcher with CryptoCompare to get 5 years of daily price history instead of 365 days.

**Architecture:** Rewrite `cryptoHistory.ts` to call CryptoCompare `histoday` API instead of CoinGecko `market_chart`. Update `backfill.ts` to pass symbol (from DB) instead of coin ID, and bump max days to 1825. Add new circuit breaker instance and config entry.

**Tech Stack:** Node.js/TypeScript, CryptoCompare REST API, vitest for tests

---

### Task 1: Add CryptoCompare config and circuit breaker

**Files:**
- Modify: `backend/src/config.ts:34` (add new config entry)
- Modify: `backend/src/services/circuitBreaker.ts:181` (add new instance)
- Modify: `backend/.env.example:2` (add new env var)

**Step 1: Add config entry**

In `backend/src/config.ts`, add after line 34 (`coingeckoApiKey`):

```typescript
  cryptoCompareApiKey: process.env.CRYPTOCOMPARE_API_KEY || undefined,
```

**Step 2: Add circuit breaker instance**

In `backend/src/services/circuitBreaker.ts`, add after line 181:

```typescript
/** Shared circuit breaker instance for all CryptoCompare calls. */
export const cryptoCompareCircuit = new CircuitBreaker({ name: "cryptocompare" });
```

**Step 3: Add env var to .env.example**

In `backend/.env.example`, add after the `COINGECKO_API_KEY` line:

```
CRYPTOCOMPARE_API_KEY=
```

**Step 4: Commit**

```bash
git add backend/src/config.ts backend/src/services/circuitBreaker.ts backend/.env.example
git commit -m "feat: add CryptoCompare config and circuit breaker"
```

---

### Task 2: Rewrite cryptoHistory.ts for CryptoCompare

**Files:**
- Rewrite: `backend/src/services/cryptoHistory.ts`

**Step 1: Rewrite the file**

Replace the entire contents of `backend/src/services/cryptoHistory.ts` with:

```typescript
import { logger } from "../logger.js";
import { config } from "../config.js";
import { cryptoCompareCircuit } from "./circuitBreaker.js";

const CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data/v2";

export interface CryptoHistoryPoint {
  date: string; // YYYY-MM-DD
  price: number;
}

/**
 * Fetches historical daily prices for a cryptocurrency from CryptoCompare.
 * Paginates backwards using `toTs` when days > 2000.
 */
export async function fetchCryptoHistory(
  symbol: string,
  days: number
): Promise<CryptoHistoryPoint[]> {
  const allPoints: CryptoHistoryPoint[] = [];
  let remaining = days;
  let toTs: number | undefined;

  while (remaining > 0) {
    const limit = Math.min(remaining, 2000);
    const points = await fetchPage(symbol, limit, toTs);

    if (points.length === 0) break;

    allPoints.push(...points);
    remaining -= points.length;

    // Set toTs to the day before the oldest point for next page
    const oldestDate = points[points.length - 1].date;
    toTs = Math.floor(new Date(oldestDate).getTime() / 1000) - 86400;
  }

  // Sort chronologically and deduplicate by date
  const seen = new Set<string>();
  return allPoints
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((p) => {
      if (seen.has(p.date)) return false;
      seen.add(p.date);
      return true;
    });
}

async function fetchPage(
  symbol: string,
  limit: number,
  toTs?: number
): Promise<CryptoHistoryPoint[]> {
  const params = new URLSearchParams({
    fsym: symbol,
    tsym: "USD",
    limit: String(limit),
  });
  if (toTs != null) {
    params.set("toTs", String(toTs));
  }
  const apiKey = config.cryptoCompareApiKey;
  if (apiKey) {
    params.set("api_key", apiKey);
  }

  try {
    const response = await cryptoCompareCircuit.fetch(
      `${CRYPTOCOMPARE_BASE}/histoday?${params}`
    );
    if (!response.ok) {
      const msg = `CryptoCompare API returned ${response.status}`;
      logger.warn("crypto history fetch failed", {
        status: response.status,
        symbol,
        limit,
      });
      throw new Error(msg);
    }

    const data = await response.json();

    if (data.Response === "Error") {
      logger.warn("CryptoCompare API error response", {
        symbol,
        message: data.Message,
      });
      throw new Error(`CryptoCompare API error: ${data.Message}`);
    }

    if (!data.Data?.Data || !Array.isArray(data.Data.Data)) {
      logger.warn("crypto history response missing Data.Data array", { symbol });
      return [];
    }

    return data.Data.Data
      .filter((point: any) => point.close > 0)
      .map((point: any) => ({
        date: new Date(point.time * 1000).toISOString().split("T")[0],
        price: point.close,
      }));
  } catch (err) {
    logger.error("crypto history fetch error", {
      symbol,
      limit,
      error: String(err),
    });
    throw err;
  }
}

/**
 * Delays execution for rate limiting between CryptoCompare API calls.
 * CryptoCompare free tier is generous (~50 req/sec), but we add a small delay.
 */
export function rateLimitDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}
```

**Step 2: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/services/cryptoHistory.ts
git commit -m "feat: rewrite cryptoHistory to use CryptoCompare API"
```

---

### Task 3: Rewrite cryptoHistory tests

**Files:**
- Rewrite: `backend/src/services/__tests__/cryptoHistory.test.ts`

**Step 1: Rewrite the test file**

Replace the entire contents of `backend/src/services/__tests__/cryptoHistory.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cryptoCompareCircuit } from "../circuitBreaker.js";

const mockConfig = vi.hoisted(() => ({
  cryptoCompareApiKey: "test-key" as string | undefined,
}));

vi.mock("../../config.js", () => ({ config: mockConfig }));

import { fetchCryptoHistory, rateLimitDelay } from "../cryptoHistory.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeCryptoCompareResponse(
  points: Array<{ time: number; close: number }>
) {
  return {
    ok: true,
    json: async () => ({
      Response: "Success",
      Data: {
        Data: points,
      },
    }),
  };
}

describe("fetchCryptoHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cryptoCompareCircuit.reset();
    mockConfig.cryptoCompareApiKey = "test-key";
  });

  it("returns daily prices for a valid symbol", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000.5 }, // 2024-01-01
        { time: 1704153600, close: 43000.75 }, // 2024-01-02
        { time: 1704240000, close: 41500.25 }, // 2024-01-03
      ])
    );

    const result = await fetchCryptoHistory("BTC", 30);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: "2024-01-01", price: 42000.5 });
    expect(result[1]).toEqual({ date: "2024-01-02", price: 43000.75 });
    expect(result[2]).toEqual({ date: "2024-01-03", price: 41500.25 });
  });

  it("calls CryptoCompare with correct URL and params", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([])
    );

    await fetchCryptoHistory("ETH", 30);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/data/v2/histoday");
    expect(url).toContain("fsym=ETH");
    expect(url).toContain("tsym=USD");
    expect(url).toContain("limit=30");
    expect(url).toContain("api_key=test-key");
  });

  it("omits API key when not set", async () => {
    mockConfig.cryptoCompareApiKey = undefined;
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([])
    );

    await fetchCryptoHistory("BTC", 30);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("api_key");
  });

  it("filters out points with zero close price", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000 },
        { time: 1704153600, close: 0 },
        { time: 1704240000, close: 41500 },
      ])
    );

    const result = await fetchCryptoHistory("BTC", 30);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2024-01-01");
    expect(result[1].date).toBe("2024-01-03");
  });

  it("paginates when days > 2000", async () => {
    // First page: 2000 points
    const page1Points = Array.from({ length: 2000 }, (_, i) => ({
      time: 1704067200 + i * 86400,
      close: 42000 + i,
    }));
    mockFetch.mockResolvedValueOnce(makeCryptoCompareResponse(page1Points));

    // Second page: remaining points
    const page2Points = Array.from({ length: 500 }, (_, i) => ({
      time: 1704067200 - (i + 1) * 86400,
      close: 41000 - i,
    }));
    mockFetch.mockResolvedValueOnce(makeCryptoCompareResponse(page2Points));

    const result = await fetchCryptoHistory("BTC", 2500);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.length).toBe(2500);

    // Second call should have toTs parameter
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toContain("toTs=");
  });

  it("deduplicates points with same date", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000 }, // 2024-01-01
        { time: 1704067200, close: 42001 }, // 2024-01-01 duplicate
      ])
    );

    const result = await fetchCryptoHistory("BTC", 30);
    expect(result).toHaveLength(1);
  });

  it("throws when API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers(),
    });

    await expect(fetchCryptoHistory("BTC", 30)).rejects.toThrow(
      "CryptoCompare API returned 429"
    );
  });

  it("throws when API returns error response body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Response: "Error",
        Message: "Invalid symbol",
      }),
    });

    await expect(fetchCryptoHistory("INVALID", 30)).rejects.toThrow(
      "CryptoCompare API error: Invalid symbol"
    );
  });

  it("returns empty array when response has no Data.Data array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Response: "Success", Data: {} }),
    });

    const result = await fetchCryptoHistory("BTC", 30);
    expect(result).toEqual([]);
  });

  it("throws when fetch throws network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(fetchCryptoHistory("BTC", 30)).rejects.toThrow(
      "Network error"
    );
  });

  it("stops paginating when a page returns no points", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000 },
      ])
    );
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([])
    );

    const result = await fetchCryptoHistory("BTC", 2500);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });
});

describe("rateLimitDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves after 500ms", async () => {
    const promise = rateLimitDelay();
    vi.advanceTimersByTime(500);
    await promise;
    vi.useRealTimers();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd backend && npm test -- --run src/services/__tests__/cryptoHistory.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/src/services/__tests__/cryptoHistory.test.ts
git commit -m "test: rewrite cryptoHistory tests for CryptoCompare API"
```

---

### Task 4: Add getAssetSymbol repository function

**Files:**
- Modify: `backend/src/repositories/assets.ts`

**Step 1: Add function to look up symbol by asset ID**

Add at end of `backend/src/repositories/assets.ts`:

```typescript
/**
 * Looks up the symbol for an asset by its ID and category.
 * Returns null if the asset is not found.
 */
export async function getAssetSymbol(
  assetId: string,
  category: string
): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT symbol FROM assets WHERE id = $1 AND category = $2`,
    [assetId, category]
  );
  return result.rows.length > 0 ? result.rows[0].symbol : null;
}
```

**Step 2: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/repositories/assets.ts
git commit -m "feat: add getAssetSymbol repository function"
```

---

### Task 5: Update backfill.ts for CryptoCompare

**Files:**
- Modify: `backend/src/services/backfill.ts:26` (change constant)
- Modify: `backend/src/services/backfill.ts:1-6` (add import)
- Modify: `backend/src/services/backfill.ts:124-134` (update fetchAndMapCrypto)

**Step 1: Change CRYPTO_MAX_DAYS**

In `backend/src/services/backfill.ts` line 26, change:

```typescript
const CRYPTO_MAX_DAYS = 365;
```

to:

```typescript
const CRYPTO_MAX_DAYS = 1825;
```

**Step 2: Add import for getAssetSymbol**

Add to the imports at the top of `backend/src/services/backfill.ts`:

```typescript
import { getAssetSymbol } from "../repositories/assets.js";
```

**Step 3: Update fetchAndMapCrypto to look up symbol**

Replace the `fetchAndMapCrypto` function (lines 124-134) with:

```typescript
async function fetchAndMapCrypto(coinId: string): Promise<DailyPriceInput[]> {
  const symbol = await getAssetSymbol(coinId, "crypto");
  if (!symbol) {
    logger.warn("no symbol found for crypto asset, skipping", { coinId });
    return [];
  }
  const history = await fetchCryptoHistory(symbol, CRYPTO_MAX_DAYS);
  const usdPrices = history.map((point) => ({
    assetId: coinId,
    category: "crypto",
    date: point.date,
    priceUsd: point.price,
    priceEur: null as number | null,
  }));
  return applyEurConversion(usdPrices);
}
```

**Step 4: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add backend/src/services/backfill.ts
git commit -m "feat: update backfill to use CryptoCompare with 5-year history"
```

---

### Task 6: Update backfill tests

**Files:**
- Modify: `backend/src/services/__tests__/backfill.test.ts`

**Step 1: Add mock for getAssetSymbol**

Add after line 16 (after `mockInsertDailyPrices`):

```typescript
const mockGetAssetSymbol = vi.fn();
```

Add a new `vi.mock` block after the `dailyPrices` mock (after line 16):

```typescript
vi.mock("../../repositories/assets.js", () => ({
  getAssetSymbol: (...args: unknown[]) => mockGetAssetSymbol(...args),
}));
```

**Step 2: Set default mock return in beforeEach**

In the `beforeEach` block (around line 44-49), add:

```typescript
    // Default: symbol lookup returns the uppercase of the assetId
    mockGetAssetSymbol.mockResolvedValue("BTC");
```

**Step 3: Update crypto test assertions**

In the test `"fetches crypto history (365 days) for new crypto asset"` (line 86):
- Change the test description to `"fetches crypto history (1825 days) for new crypto asset"`
- Add `mockGetAssetSymbol.mockResolvedValueOnce("BTC");` before the `backfillAsset` call
- Change the assertion from `expect(mockFetchCryptoHistory).toHaveBeenCalledWith("bitcoin", 365)` to `expect(mockFetchCryptoHistory).toHaveBeenCalledWith("BTC", 1825)`
- Add: `expect(mockGetAssetSymbol).toHaveBeenCalledWith("bitcoin", "crypto");`

**Step 4: Add test for missing symbol**

Add a new test in the `"new asset - full backfill"` describe block:

```typescript
    it("returns empty prices when symbol not found in DB", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockGetAssetSymbol.mockResolvedValueOnce(null);

      await backfillAsset("unknown-coin", "crypto");

      expect(mockFetchCryptoHistory).not.toHaveBeenCalled();
      // Still updates status to prevent retry loops
      expect(mockUpsertBackfillStatus).toHaveBeenCalledWith(
        "unknown-coin",
        "crypto",
        expect.any(Date)
      );
    });
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && npm test -- --run src/services/__tests__/backfill.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add backend/src/services/__tests__/backfill.test.ts
git commit -m "test: update backfill tests for CryptoCompare integration"
```

---

### Task 7: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd backend && npm test`
Expected: All tests PASS

**Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 3: Final commit if any fixups needed**

If any tests fail, fix them and commit the fixes.
