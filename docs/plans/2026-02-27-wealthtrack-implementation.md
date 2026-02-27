# WealthTrack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native iOS wealth-tracking app with a Node.js/TypeScript price API backend, all in a monorepo.

**Architecture:** Monorepo with two workspaces — `backend/` (Node.js/TypeScript Express server proxying price APIs) and `ios/` (SwiftUI app using SwiftData + CloudKit for storage). The backend provides a single `/api/prices` endpoint. The iOS app handles all business logic (projections, risk, insights) locally.

**Tech Stack:**
- Backend: Node.js, TypeScript, Express, Vitest, yahoo-finance2, CoinGecko API, ExchangeRate-API
- iOS: Swift, SwiftUI, SwiftData, CloudKit, Charts framework, XCTest
- Monorepo: npm workspaces at root

**Design doc:** `docs/plans/2026-02-27-wealthtrack-design.md`

---

## Phase 1: Monorepo & Project Scaffolding

### Task 1: Initialize monorepo root

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `CLAUDE.md`

**Step 1: Create root package.json with npm workspaces**

```json
{
  "name": "wealthtrack",
  "private": true,
  "workspaces": ["backend"],
  "engines": {
    "node": ">=20"
  }
}
```

**Step 2: Create .nvmrc**

```
20
```

**Step 3: Create .gitignore**

```gitignore
# Node
node_modules/
dist/
.env
.env.local

# iOS
ios/build/
ios/DerivedData/
ios/*.xcuserdata/
ios/**/*.xcuserdata/

# General
.DS_Store
*.log
```

**Step 4: Create CLAUDE.md with project conventions**

```markdown
# WealthTrack

Multi-asset wealth tracking app — monorepo with Node.js backend and iOS app.

## Structure

- `backend/` — Node.js/TypeScript price API server
- `ios/WealthTrack/` — SwiftUI iOS app
- `docs/plans/` — Design and implementation documents

## Backend commands

- `cd backend && npm run dev` — start dev server
- `cd backend && npm test` — run tests
- `cd backend && npm run build` — compile TypeScript

## Key decisions

- Backend is a stateless price proxy — no user data stored server-side
- User portfolio data lives in CloudKit (via SwiftData)
- All business logic (projections, risk, insights) runs on-device in the iOS app
```

**Step 5: Commit**

```bash
git add package.json .gitignore .nvmrc CLAUDE.md
git commit -m "chore: initialize monorepo root with npm workspaces"
```

---

### Task 2: Scaffold backend project

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/index.ts`
- Create: `backend/.env.example`

**Step 1: Create backend/package.json**

```json
{
  "name": "@wealthtrack/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^5.0.0",
    "yahoo-finance2": "^3.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create backend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create backend/.env.example**

```bash
PORT=3001
COINGECKO_API_KEY=your_coingecko_demo_key_here
EXCHANGERATE_API_KEY=your_exchangerate_api_key_here
```

**Step 4: Create backend/src/index.ts (minimal server)**

```typescript
import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`WealthTrack API running on port ${PORT}`);
});

export default app;
```

**Step 5: Install dependencies and verify**

```bash
cd backend && npm install
npm run dev
# In another terminal: curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

**Step 6: Commit**

```bash
git add backend/
git commit -m "chore: scaffold backend Node.js/TypeScript project"
```

---

### Task 3: Create Xcode SwiftUI project

**Files:**
- Create: `ios/WealthTrack.xcodeproj` (via Xcode)
- Create: `ios/WealthTrack/` (app source directory)

**Step 1: Create the Xcode project**

Open Xcode and create a new project:
1. File → New → Project → iOS → App
2. Product Name: **WealthTrack**
3. Team: Select your Apple Developer account
4. Organization Identifier: `com.yourname` (e.g., `com.taras`)
5. Interface: **SwiftUI**
6. Storage: **SwiftData**
7. Save location: choose `ios/` directory inside the monorepo

**Step 2: Enable iCloud capability**

1. Select the WealthTrack target → Signing & Capabilities
2. Click `+ Capability` → **iCloud**
3. Check **CloudKit**
4. Create a new container: `iCloud.com.yourname.wealthtrack`

**Step 3: Verify project builds**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add ios/
git commit -m "chore: create SwiftUI project with CloudKit capability"
```

---

## Phase 2: Backend — Price API

### Task 4: Define shared types

**Files:**
- Create: `backend/src/types.ts`

**Step 1: Write the types file**

```typescript
export type AssetCategory = "crypto" | "stock" | "fiat";

export interface PriceRequest {
  assets: Array<{
    id: string;
    category: AssetCategory;
  }>;
  baseCurrency: string;
}

export interface AssetPrice {
  id: string;
  category: AssetCategory;
  price: number;
  currency: string;
  change24h: number | null;
  updatedAt: string;
}

export interface PriceResponse {
  prices: AssetPrice[];
  baseCurrency: string;
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}
```

**Step 2: Commit**

```bash
git add backend/src/types.ts
git commit -m "feat(backend): define price API types"
```

---

### Task 5: CoinGecko crypto price service

**Files:**
- Create: `backend/src/services/crypto.ts`
- Create: `backend/src/services/__tests__/crypto.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCryptoPrices } from "../crypto.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchCryptoPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COINGECKO_API_KEY = "test-key";
  });

  it("returns prices for requested crypto assets", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bitcoin: { usd: 95000, usd_24h_change: 1.5 },
        ethereum: { usd: 3400, usd_24h_change: -0.8 },
      }),
    });

    const result = await fetchCryptoPrices(["bitcoin", "ethereum"], "usd");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "bitcoin",
      category: "crypto",
      price: 95000,
      currency: "usd",
      change24h: 1.5,
      updatedAt: expect.any(String),
    });
    expect(result[1].id).toBe("ethereum");
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await fetchCryptoPrices(["bitcoin"], "usd");
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/crypto.test.ts
```

Expected: FAIL — module `../crypto.js` not found

**Step 3: Implement the service**

```typescript
import type { AssetPrice } from "../types.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function fetchCryptoPrices(
  coinIds: string[],
  baseCurrency: string
): Promise<AssetPrice[]> {
  if (coinIds.length === 0) return [];

  const apiKey = process.env.COINGECKO_API_KEY;
  const params = new URLSearchParams({
    ids: coinIds.join(","),
    vs_currencies: baseCurrency,
    include_24hr_change: "true",
  });
  if (apiKey) {
    params.set("x_cg_demo_api_key", apiKey);
  }

  try {
    const response = await fetch(`${COINGECKO_BASE}/simple/price?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    const now = new Date().toISOString();

    return coinIds
      .filter((id) => data[id])
      .map((id) => ({
        id,
        category: "crypto" as const,
        price: data[id][baseCurrency],
        currency: baseCurrency,
        change24h: data[id][`${baseCurrency}_24h_change`] ?? null,
        updatedAt: now,
      }));
  } catch {
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/services/__tests__/crypto.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/
git commit -m "feat(backend): add CoinGecko crypto price service"
```

---

### Task 6: Stock/ETF price service

**Files:**
- Create: `backend/src/services/stocks.ts`
- Create: `backend/src/services/__tests__/stocks.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStockPrices } from "../stocks.js";

vi.mock("yahoo-finance2", () => ({
  default: {
    quote: vi.fn(),
  },
}));

import yahooFinance from "yahoo-finance2";

describe("fetchStockPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns prices for requested stock tickers", async () => {
    vi.mocked(yahooFinance.quote).mockResolvedValueOnce([
      {
        symbol: "VOO",
        regularMarketPrice: 520.5,
        regularMarketChangePercent: 0.45,
        currency: "USD",
      },
    ] as any);

    const result = await fetchStockPrices(["VOO"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "VOO",
      category: "stock",
      price: 520.5,
      currency: "USD",
      change24h: 0.45,
      updatedAt: expect.any(String),
    });
  });

  it("returns empty array on error", async () => {
    vi.mocked(yahooFinance.quote).mockRejectedValueOnce(new Error("API down"));

    const result = await fetchStockPrices(["VOO"]);
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/stocks.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement the service**

```typescript
import yahooFinance from "yahoo-finance2";
import type { AssetPrice } from "../types.js";

export async function fetchStockPrices(
  tickers: string[]
): Promise<AssetPrice[]> {
  if (tickers.length === 0) return [];

  try {
    const results = await yahooFinance.quote(tickers);
    const quotes = Array.isArray(results) ? results : [results];
    const now = new Date().toISOString();

    return quotes
      .filter((q: any) => q.regularMarketPrice != null)
      .map((q: any) => ({
        id: q.symbol,
        category: "stock" as const,
        price: q.regularMarketPrice,
        currency: q.currency ?? "USD",
        change24h: q.regularMarketChangePercent ?? null,
        updatedAt: now,
      }));
  } catch {
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/services/__tests__/stocks.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/stocks.ts backend/src/services/__tests__/stocks.test.ts
git commit -m "feat(backend): add Yahoo Finance stock price service"
```

---

### Task 7: Fiat exchange rate service

**Files:**
- Create: `backend/src/services/fiat.ts`
- Create: `backend/src/services/__tests__/fiat.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchExchangeRates } from "../fiat.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchExchangeRates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXCHANGERATE_API_KEY = "test-key";
  });

  it("returns exchange rates relative to base currency", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: "success",
        conversion_rates: {
          USD: 1,
          EUR: 0.92,
          UAH: 41.5,
        },
      }),
    });

    const result = await fetchExchangeRates("USD", ["EUR", "UAH"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "EUR",
      category: "fiat",
      price: 0.92,
      currency: "USD",
      change24h: null,
      updatedAt: expect.any(String),
    });
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchExchangeRates("USD", ["EUR"]);
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/fiat.test.ts
```

Expected: FAIL

**Step 3: Implement the service**

```typescript
import type { AssetPrice } from "../types.js";

const EXCHANGERATE_BASE = "https://v6.exchangerate-api.com/v6";

export async function fetchExchangeRates(
  baseCurrency: string,
  targetCurrencies: string[]
): Promise<AssetPrice[]> {
  if (targetCurrencies.length === 0) return [];

  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `${EXCHANGERATE_BASE}/${apiKey}/latest/${baseCurrency}`
    );
    if (!response.ok) return [];

    const data = await response.json();
    if (data.result !== "success") return [];

    const now = new Date().toISOString();
    const rates = data.conversion_rates;

    return targetCurrencies
      .filter((currency) => rates[currency] != null)
      .map((currency) => ({
        id: currency,
        category: "fiat" as const,
        price: rates[currency],
        currency: baseCurrency,
        change24h: null,
        updatedAt: now,
      }));
  } catch {
    return [];
  }
}
```

**Step 4: Run tests**

```bash
cd backend && npx vitest run src/services/__tests__/fiat.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/fiat.ts backend/src/services/__tests__/fiat.test.ts
git commit -m "feat(backend): add fiat exchange rate service"
```

---

### Task 8: In-memory price cache

**Files:**
- Create: `backend/src/cache.ts`
- Create: `backend/src/__tests__/cache.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PriceCache } from "../cache.js";

describe("PriceCache", () => {
  let cache: PriceCache;

  beforeEach(() => {
    cache = new PriceCache(60_000); // 60s TTL
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    cache.set("btc", { price: 95000 });
    expect(cache.get("btc")).toEqual({ price: 95000 });
  });

  it("returns undefined for expired entries", () => {
    cache.set("btc", { price: 95000 });

    // Advance time past TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);

    expect(cache.get("btc")).toBeUndefined();
    vi.useRealTimers();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/__tests__/cache.test.ts
```

Expected: FAIL

**Step 3: Implement the cache**

```typescript
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class PriceCache {
  private store = new Map<string, CacheEntry<any>>();
  private ttlMs: number;

  constructor(ttlMs: number = 60_000) {
    this.ttlMs = ttlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}
```

**Step 4: Run tests**

```bash
cd backend && npx vitest run src/__tests__/cache.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/cache.ts backend/src/__tests__/cache.test.ts
git commit -m "feat(backend): add in-memory price cache with TTL"
```

---

### Task 9: Unified `/api/prices` endpoint

**Files:**
- Create: `backend/src/routes/prices.ts`
- Modify: `backend/src/index.ts`
- Create: `backend/src/routes/__tests__/prices.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPricesRouter } from "../prices.js";

// We'll test the router with mocked services
vi.mock("../../services/crypto.js", () => ({
  fetchCryptoPrices: vi.fn().mockResolvedValue([
    {
      id: "bitcoin",
      category: "crypto",
      price: 95000,
      currency: "usd",
      change24h: 1.5,
      updatedAt: "2026-02-27T00:00:00Z",
    },
  ]),
}));

vi.mock("../../services/stocks.js", () => ({
  fetchStockPrices: vi.fn().mockResolvedValue([
    {
      id: "VOO",
      category: "stock",
      price: 520,
      currency: "USD",
      change24h: 0.4,
      updatedAt: "2026-02-27T00:00:00Z",
    },
  ]),
}));

vi.mock("../../services/fiat.js", () => ({
  fetchExchangeRates: vi.fn().mockResolvedValue([
    {
      id: "EUR",
      category: "fiat",
      price: 0.92,
      currency: "USD",
      change24h: null,
      updatedAt: "2026-02-27T00:00:00Z",
    },
  ]),
}));

describe("POST /api/prices", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api", createPricesRouter());
  });

  it("returns prices for mixed asset request", async () => {
    const response = await request(app)
      .post("/api/prices")
      .send({
        assets: [
          { id: "bitcoin", category: "crypto" },
          { id: "VOO", category: "stock" },
          { id: "EUR", category: "fiat" },
        ],
        baseCurrency: "USD",
      });

    expect(response.status).toBe(200);
    expect(response.body.prices).toHaveLength(3);
    expect(response.body.baseCurrency).toBe("USD");
    expect(response.body.timestamp).toBeDefined();
  });

  it("returns 400 for invalid request body", async () => {
    const response = await request(app)
      .post("/api/prices")
      .send({ invalid: true });

    expect(response.status).toBe(400);
  });
});
```

**Step 2: Install supertest, run test to verify it fails**

```bash
cd backend && npm install -D supertest @types/supertest
npx vitest run src/routes/__tests__/prices.test.ts
```

Expected: FAIL

**Step 3: Implement the router**

```typescript
import { Router } from "express";
import { fetchCryptoPrices } from "../services/crypto.js";
import { fetchStockPrices } from "../services/stocks.js";
import { fetchExchangeRates } from "../services/fiat.js";
import { PriceCache } from "../cache.js";
import type { PriceRequest, AssetPrice, PriceResponse } from "../types.js";

const cache = new PriceCache(60_000); // 1 minute cache

export function createPricesRouter(): Router {
  const router = Router();

  router.post("/prices", async (req, res) => {
    const body = req.body as PriceRequest;

    if (!body.assets || !Array.isArray(body.assets) || !body.baseCurrency) {
      res.status(400).json({ error: "Invalid request. Required: assets[], baseCurrency" });
      return;
    }

    const base = body.baseCurrency.toUpperCase();

    const cryptoIds = body.assets
      .filter((a) => a.category === "crypto")
      .map((a) => a.id);
    const stockIds = body.assets
      .filter((a) => a.category === "stock")
      .map((a) => a.id);
    const fiatIds = body.assets
      .filter((a) => a.category === "fiat")
      .map((a) => a.id);

    const cacheKey = `${cryptoIds.join(",")}_${stockIds.join(",")}_${fiatIds.join(",")}_${base}`;
    const cached = cache.get<AssetPrice[]>(cacheKey);

    if (cached) {
      const response: PriceResponse = {
        prices: cached,
        baseCurrency: base,
        timestamp: new Date().toISOString(),
      };
      res.json(response);
      return;
    }

    const [cryptoPrices, stockPrices, fiatPrices] = await Promise.all([
      fetchCryptoPrices(cryptoIds, base.toLowerCase()),
      fetchStockPrices(stockIds),
      fetchExchangeRates(base, fiatIds),
    ]);

    const allPrices = [...cryptoPrices, ...stockPrices, ...fiatPrices];
    cache.set(cacheKey, allPrices);

    const response: PriceResponse = {
      prices: allPrices,
      baseCurrency: base,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  });

  return router;
}
```

**Step 4: Update index.ts to mount the router**

```typescript
import express from "express";
import { createPricesRouter } from "./routes/prices.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", createPricesRouter());

app.listen(PORT, () => {
  console.log(`WealthTrack API running on port ${PORT}`);
});

export default app;
```

**Step 5: Run all tests**

```bash
cd backend && npx vitest run
```

Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): add unified /api/prices endpoint with caching"
```

---

## Phase 3: iOS — Data Layer

### Task 10: Define SwiftData models

**Files:**
- Create: `ios/WealthTrack/Models/Asset.swift`
- Create: `ios/WealthTrack/Models/AssetCategory.swift`
- Create: `ios/WealthTrack/Models/UserSettings.swift`

**Step 1: Create AssetCategory enum**

```swift
import Foundation

enum AssetCategory: String, Codable, CaseIterable {
    case crypto
    case stock
    case fiat

    var displayName: String {
        switch self {
        case .crypto: return "Crypto"
        case .stock: return "Stocks & ETFs"
        case .fiat: return "Cash"
        }
    }

    var iconName: String {
        switch self {
        case .crypto: return "bitcoinsign.circle.fill"
        case .stock: return "chart.line.uptrend.xyaxis"
        case .fiat: return "banknote.fill"
        }
    }
}
```

**Step 2: Create Asset model with SwiftData**

```swift
import Foundation
import SwiftData

@Model
final class Asset {
    var id: UUID
    var name: String        // e.g., "Bitcoin", "S&P 500 ETF", "US Dollar"
    var symbol: String      // e.g., "bitcoin" (CoinGecko ID), "VOO", "USD"
    var category: String    // raw value of AssetCategory
    var amount: Double      // how much user owns (e.g., 1.5 BTC, 5000 USD)
    var createdAt: Date

    var assetCategory: AssetCategory {
        AssetCategory(rawValue: category) ?? .fiat
    }

    init(name: String, symbol: String, category: AssetCategory, amount: Double) {
        self.id = UUID()
        self.name = name
        self.symbol = symbol
        self.category = category.rawValue
        self.amount = amount
        self.createdAt = Date()
    }
}
```

**Step 3: Create UserSettings model**

```swift
import Foundation
import SwiftData

@Model
final class UserSettings {
    var id: UUID
    var displayCurrency: String  // e.g., "USD", "EUR", "UAH"
    var isPremium: Bool

    init(displayCurrency: String = "USD") {
        self.id = UUID()
        self.displayCurrency = displayCurrency
        self.isPremium = false
    }
}
```

**Step 4: Verify project builds**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add ios/
git commit -m "feat(ios): add SwiftData models for Asset and UserSettings"
```

---

### Task 11: Configure SwiftData with CloudKit sync

**Files:**
- Modify: `ios/WealthTrack/WealthTrackApp.swift`

**Step 1: Update the main app file to configure SwiftData + CloudKit**

```swift
import SwiftUI
import SwiftData

@main
struct WealthTrackApp: App {
    let modelContainer: ModelContainer

    init() {
        let schema = Schema([Asset.self, UserSettings.self])
        let config = ModelConfiguration(
            schema: schema,
            cloudKitDatabase: .automatic
        )
        do {
            modelContainer = try ModelContainer(
                for: schema,
                configurations: [config]
            )
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(modelContainer)
    }
}
```

**Step 2: Build and run on simulator**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add ios/
git commit -m "feat(ios): configure SwiftData with CloudKit automatic sync"
```

---

### Task 12: Price API client service

**Files:**
- Create: `ios/WealthTrack/Services/PriceAPIClient.swift`
- Create: `ios/WealthTrack/Services/PriceModels.swift`

**Step 1: Create response models matching the backend API**

```swift
import Foundation

struct PriceRequestBody: Codable {
    let assets: [AssetRequest]
    let baseCurrency: String
}

struct AssetRequest: Codable {
    let id: String
    let category: String
}

struct PriceResponseBody: Codable {
    let prices: [AssetPriceData]
    let baseCurrency: String
    let timestamp: String
}

struct AssetPriceData: Codable {
    let id: String
    let category: String
    let price: Double
    let currency: String
    let change24h: Double?
    let updatedAt: String
}
```

**Step 2: Create the API client**

```swift
import Foundation

class PriceAPIClient {
    static let shared = PriceAPIClient()

    // TODO: Change to production URL before App Store release
    private let baseURL = "http://localhost:3001/api"

    func fetchPrices(
        assets: [Asset],
        baseCurrency: String
    ) async throws -> [AssetPriceData] {
        guard let url = URL(string: "\(baseURL)/prices") else {
            throw APIError.invalidURL
        }

        let requestBody = PriceRequestBody(
            assets: assets.map { asset in
                AssetRequest(id: asset.symbol, category: asset.category)
            },
            baseCurrency: baseCurrency
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError
        }

        let decoded = try JSONDecoder().decode(PriceResponseBody.self, from: data)
        return decoded.prices
    }

    enum APIError: Error, LocalizedError {
        case invalidURL
        case serverError

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid API URL"
            case .serverError: return "Server error. Please try again."
            }
        }
    }
}
```

**Step 3: Build**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add ios/
git commit -m "feat(ios): add price API client service"
```

---

## Phase 4: iOS — Core Business Logic

### Task 13: Portfolio calculator

**Files:**
- Create: `ios/WealthTrack/Logic/PortfolioCalculator.swift`
- Create: `ios/WealthTrackTests/PortfolioCalculatorTests.swift`

**Step 1: Write the failing test**

```swift
import XCTest
@testable import WealthTrack

final class PortfolioCalculatorTests: XCTestCase {

    func testTotalValue() {
        let holdings: [PortfolioHolding] = [
            PortfolioHolding(name: "Bitcoin", amount: 1.0, pricePerUnit: 95000, category: .crypto),
            PortfolioHolding(name: "S&P 500", amount: 10, pricePerUnit: 520, category: .stock),
            PortfolioHolding(name: "USD Cash", amount: 5000, pricePerUnit: 1, category: .fiat),
        ]

        let total = PortfolioCalculator.totalValue(holdings: holdings)
        XCTAssertEqual(total, 105200, accuracy: 0.01)
    }

    func testCategoryBreakdown() {
        let holdings: [PortfolioHolding] = [
            PortfolioHolding(name: "Bitcoin", amount: 1.0, pricePerUnit: 50000, category: .crypto),
            PortfolioHolding(name: "USD", amount: 50000, pricePerUnit: 1.0, category: .fiat),
        ]

        let breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        XCTAssertEqual(breakdown[.crypto], 0.5, accuracy: 0.01)
        XCTAssertEqual(breakdown[.fiat], 0.5, accuracy: 0.01)
    }
}
```

**Step 2: Run test to verify it fails**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: FAIL — types not found

**Step 3: Implement**

```swift
import Foundation

struct PortfolioHolding {
    let name: String
    let amount: Double
    let pricePerUnit: Double
    let category: AssetCategory

    var totalValue: Double {
        amount * pricePerUnit
    }
}

enum PortfolioCalculator {
    static func totalValue(holdings: [PortfolioHolding]) -> Double {
        holdings.reduce(0) { $0 + $1.totalValue }
    }

    static func categoryBreakdown(holdings: [PortfolioHolding]) -> [AssetCategory: Double] {
        let total = totalValue(holdings: holdings)
        guard total > 0 else { return [:] }

        var breakdown: [AssetCategory: Double] = [:]
        for category in AssetCategory.allCases {
            let categoryTotal = holdings
                .filter { $0.category == category }
                .reduce(0) { $0 + $1.totalValue }
            if categoryTotal > 0 {
                breakdown[category] = categoryTotal / total
            }
        }
        return breakdown
    }
}
```

**Step 4: Run tests**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: PASS

**Step 5: Commit**

```bash
git add ios/
git commit -m "feat(ios): add portfolio calculator with total value and breakdown"
```

---

### Task 14: Risk score calculator

**Files:**
- Create: `ios/WealthTrack/Logic/RiskCalculator.swift`
- Create: `ios/WealthTrackTests/RiskCalculatorTests.swift`

**Step 1: Write the failing test**

```swift
import XCTest
@testable import WealthTrack

final class RiskCalculatorTests: XCTestCase {

    func testAllCashIsLowRisk() {
        let holdings = [
            PortfolioHolding(name: "USD", amount: 10000, pricePerUnit: 1, category: .fiat),
        ]
        let score = RiskCalculator.riskScore(holdings: holdings)
        XCTAssertEqual(score.value, 1)
        XCTAssertEqual(score.label, "Conservative")
    }

    func testAllCryptoIsHighRisk() {
        let holdings = [
            PortfolioHolding(name: "SOL", amount: 100, pricePerUnit: 185, category: .crypto),
        ]
        let score = RiskCalculator.riskScore(holdings: holdings)
        XCTAssertGreaterThanOrEqual(score.value, 7)
        XCTAssertEqual(score.label, "Aggressive")
    }

    func testMixedPortfolio() {
        // 30% stocks (weight 4), 50% BTC (weight 7), 20% cash (weight 1)
        // Expected: 0.3*4 + 0.5*7 + 0.2*1 = 1.2 + 3.5 + 0.2 = 4.9 → 5
        let holdings = [
            PortfolioHolding(name: "S&P 500", amount: 30, pricePerUnit: 100, category: .stock),
            PortfolioHolding(name: "Bitcoin", amount: 50, pricePerUnit: 100, category: .crypto),
            PortfolioHolding(name: "USD", amount: 2000, pricePerUnit: 1, category: .fiat),
        ]
        let score = RiskCalculator.riskScore(holdings: holdings)
        XCTAssertEqual(score.value, 5)
        XCTAssertEqual(score.label, "Moderate")
    }

    func testEmptyPortfolio() {
        let score = RiskCalculator.riskScore(holdings: [])
        XCTAssertEqual(score.value, 0)
    }
}
```

**Step 2: Run test to verify it fails**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: FAIL

**Step 3: Implement**

```swift
import Foundation

struct RiskScore {
    let value: Int      // 0-10
    let label: String   // Conservative, Moderate, Aggressive

    static let riskWeights: [AssetCategory: Double] = [
        .fiat: 1,
        .stock: 4,
        .crypto: 8,  // average of BTC(7), ETH(8), alts(9)
    ]

    static func label(for value: Int) -> String {
        switch value {
        case 0: return "No Assets"
        case 1...3: return "Conservative"
        case 4...6: return "Moderate"
        default: return "Aggressive"
        }
    }
}

enum RiskCalculator {
    static func riskScore(holdings: [PortfolioHolding]) -> RiskScore {
        let total = PortfolioCalculator.totalValue(holdings: holdings)
        guard total > 0 else {
            return RiskScore(value: 0, label: "No Assets")
        }

        var weightedSum = 0.0
        for holding in holdings {
            let fraction = holding.totalValue / total
            let weight = RiskScore.riskWeights[holding.category] ?? 5
            weightedSum += fraction * weight
        }

        let rounded = Int(weightedSum.rounded())
        let clamped = min(max(rounded, 1), 10)
        return RiskScore(value: clamped, label: RiskScore.label(for: clamped))
    }
}
```

**Step 4: Run tests**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: PASS

**Step 5: Commit**

```bash
git add ios/
git commit -m "feat(ios): add risk score calculator"
```

---

### Task 15: Projection engine

**Files:**
- Create: `ios/WealthTrack/Logic/ProjectionEngine.swift`
- Create: `ios/WealthTrackTests/ProjectionEngineTests.swift`

**Step 1: Write the failing test**

```swift
import XCTest
@testable import WealthTrack

final class ProjectionEngineTests: XCTestCase {

    func testCompoundGrowth() {
        // $10,000 at 10%/yr for 10 years = $10,000 * (1.1)^10 = $25,937.42
        let result = ProjectionEngine.compoundGrowth(
            presentValue: 10000,
            annualRate: 0.10,
            years: 10
        )
        XCTAssertEqual(result, 25937.42, accuracy: 1.0)
    }

    func testProjectPortfolio() {
        let holdings = [
            PortfolioHolding(name: "S&P 500", amount: 100, pricePerUnit: 100, category: .stock),
        ]

        let projection = ProjectionEngine.project(holdings: holdings, years: 10)

        // Stock expected rate: 8%
        // $10,000 * (1.08)^10 = $21,589.25
        XCTAssertEqual(projection.expected, 21589.25, accuracy: 100)
        XCTAssertLessThan(projection.pessimistic, projection.expected)
        XCTAssertGreaterThan(projection.optimistic, projection.expected)
    }

    func testCashLosesToInflation() {
        let holdings = [
            PortfolioHolding(name: "USD", amount: 10000, pricePerUnit: 1, category: .fiat),
        ]

        let projection = ProjectionEngine.project(holdings: holdings, years: 10)

        // Cash expected rate: -3% (inflation)
        // All three scenarios should show loss
        XCTAssertLessThan(projection.expected, 10000)
        XCTAssertLessThan(projection.pessimistic, projection.expected)
    }
}
```

**Step 2: Run test to verify it fails**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: FAIL

**Step 3: Implement**

```swift
import Foundation

struct Projection {
    let pessimistic: Double
    let expected: Double
    let optimistic: Double
    let years: Int
}

enum ProjectionEngine {

    struct Rates {
        let pessimistic: Double
        let expected: Double
        let optimistic: Double
    }

    static let annualRates: [AssetCategory: Rates] = [
        .fiat:   Rates(pessimistic: -0.05, expected: -0.03, optimistic: -0.01),
        .stock:  Rates(pessimistic: 0.04,  expected: 0.08,  optimistic: 0.12),
        .crypto: Rates(pessimistic: -0.10, expected: 0.15,  optimistic: 0.40),
    ]

    static func compoundGrowth(presentValue: Double, annualRate: Double, years: Int) -> Double {
        presentValue * pow(1 + annualRate, Double(years))
    }

    static func project(holdings: [PortfolioHolding], years: Int) -> Projection {
        var pessimisticTotal = 0.0
        var expectedTotal = 0.0
        var optimisticTotal = 0.0

        for holding in holdings {
            let rates = annualRates[holding.category] ?? Rates(pessimistic: 0, expected: 0, optimistic: 0)
            let value = holding.totalValue

            pessimisticTotal += compoundGrowth(presentValue: value, annualRate: rates.pessimistic, years: years)
            expectedTotal += compoundGrowth(presentValue: value, annualRate: rates.expected, years: years)
            optimisticTotal += compoundGrowth(presentValue: value, annualRate: rates.optimistic, years: years)
        }

        return Projection(
            pessimistic: pessimisticTotal,
            expected: expectedTotal,
            optimistic: optimisticTotal,
            years: years
        )
    }
}
```

**Step 4: Run tests**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: PASS

**Step 5: Commit**

```bash
git add ios/
git commit -m "feat(ios): add projection engine with three-scenario model"
```

---

### Task 16: Educational insights engine

**Files:**
- Create: `ios/WealthTrack/Logic/InsightsEngine.swift`
- Create: `ios/WealthTrackTests/InsightsEngineTests.swift`

**Step 1: Write the failing test**

```swift
import XCTest
@testable import WealthTrack

final class InsightsEngineTests: XCTestCase {

    func testHighCryptoWarning() {
        let holdings = [
            PortfolioHolding(name: "BTC", amount: 1, pricePerUnit: 80000, category: .crypto),
            PortfolioHolding(name: "USD", amount: 10000, pricePerUnit: 1, category: .fiat),
        ]
        // 89% crypto
        let insights = InsightsEngine.generate(holdings: holdings)
        XCTAssertTrue(insights.contains { $0.id == "high_crypto" })
    }

    func testHighCashWarning() {
        let holdings = [
            PortfolioHolding(name: "USD", amount: 60000, pricePerUnit: 1, category: .fiat),
            PortfolioHolding(name: "BTC", amount: 0.1, pricePerUnit: 95000, category: .crypto),
        ]
        // ~86% cash
        let insights = InsightsEngine.generate(holdings: holdings)
        XCTAssertTrue(insights.contains { $0.id == "high_cash" })
    }

    func testNoInsightsForBalancedPortfolio() {
        let holdings = [
            PortfolioHolding(name: "BTC", amount: 1, pricePerUnit: 33333, category: .crypto),
            PortfolioHolding(name: "VOO", amount: 64, pricePerUnit: 520, category: .stock),
            PortfolioHolding(name: "USD", amount: 33333, pricePerUnit: 1, category: .fiat),
        ]
        // ~33% each
        let insights = InsightsEngine.generate(holdings: holdings)
        XCTAssertTrue(insights.isEmpty)
    }
}
```

**Step 2: Run test to verify it fails**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: FAIL

**Step 3: Implement**

```swift
import Foundation

struct Insight: Identifiable {
    let id: String
    let title: String
    let message: String
    let severity: Severity

    enum Severity {
        case info, warning
    }
}

enum InsightsEngine {
    static func generate(holdings: [PortfolioHolding]) -> [Insight] {
        let breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        var insights: [Insight] = []

        let cryptoShare = breakdown[.crypto] ?? 0
        let cashShare = breakdown[.fiat] ?? 0
        let stockShare = breakdown[.stock] ?? 0

        if cryptoShare > 0.70 {
            insights.append(Insight(
                id: "high_crypto",
                title: "High Crypto Exposure",
                message: "Crypto is highly volatile. Your portfolio could drop 50%+ in a downturn. Consider diversifying into index funds or cash.",
                severity: .warning
            ))
        }

        if cashShare > 0.50 {
            insights.append(Insight(
                id: "high_cash",
                title: "Cash Losing Value",
                message: "Cash loses ~3% per year to inflation. Historically, index funds like S&P 500 have returned ~8% per year.",
                severity: .info
            ))
        }

        if stockShare == 0 && holdings.count > 1 {
            insights.append(Insight(
                id: "no_index_funds",
                title: "No Index Funds",
                message: "Index funds offer moderate risk with historically strong returns (~8%/yr). They're a common building block of diversified portfolios.",
                severity: .info
            ))
        }

        return insights
    }
}
```

**Step 4: Run tests**

```bash
cd ios && xcodebuild test -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: PASS

**Step 5: Commit**

```bash
git add ios/
git commit -m "feat(ios): add educational insights engine with rule-based tips"
```

---

## Phase 5: iOS — User Interface

### Task 17: App navigation structure

**Files:**
- Modify: `ios/WealthTrack/ContentView.swift`
- Create: `ios/WealthTrack/Views/DashboardView.swift`
- Create: `ios/WealthTrack/Views/ProjectionsView.swift`
- Create: `ios/WealthTrack/Views/InsightsView.swift`

**Step 1: Create placeholder views**

DashboardView.swift:
```swift
import SwiftUI

struct DashboardView: View {
    var body: some View {
        Text("Dashboard")
            .font(.title)
    }
}
```

ProjectionsView.swift:
```swift
import SwiftUI

struct ProjectionsView: View {
    var body: some View {
        Text("Projections")
            .font(.title)
    }
}
```

InsightsView.swift:
```swift
import SwiftUI

struct InsightsView: View {
    var body: some View {
        Text("Insights")
            .font(.title)
    }
}
```

**Step 2: Set up TabView navigation in ContentView**

```swift
import SwiftUI
import SwiftData

struct ContentView: View {
    @Query private var assets: [Asset]

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "chart.pie.fill")
                }

            ProjectionsView()
                .tabItem {
                    Label("Projections", systemImage: "chart.line.uptrend.xyaxis")
                }

            InsightsView()
                .tabItem {
                    Label("Insights", systemImage: "lightbulb.fill")
                }
        }
    }
}
```

**Step 3: Build and run**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add ios/
git commit -m "feat(ios): add tab navigation with Dashboard, Projections, Insights"
```

---

### Task 18: Add Asset flow

**Files:**
- Create: `ios/WealthTrack/Views/AddAssetView.swift`
- Create: `ios/WealthTrack/Data/AssetCatalog.swift`

**Step 1: Create a catalog of known assets users can pick from**

```swift
import Foundation

struct AssetDefinition: Identifiable, Hashable {
    let id: String       // e.g., "bitcoin", "VOO", "USD"
    let name: String     // e.g., "Bitcoin", "Vanguard S&P 500 ETF"
    let symbol: String   // display symbol, e.g., "BTC", "VOO", "USD"
    let category: AssetCategory
}

enum AssetCatalog {
    static let crypto: [AssetDefinition] = [
        AssetDefinition(id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: .crypto),
        AssetDefinition(id: "ethereum", name: "Ethereum", symbol: "ETH", category: .crypto),
        AssetDefinition(id: "solana", name: "Solana", symbol: "SOL", category: .crypto),
        AssetDefinition(id: "binancecoin", name: "BNB", symbol: "BNB", category: .crypto),
        AssetDefinition(id: "ripple", name: "XRP", symbol: "XRP", category: .crypto),
        AssetDefinition(id: "cardano", name: "Cardano", symbol: "ADA", category: .crypto),
    ]

    static let stocks: [AssetDefinition] = [
        AssetDefinition(id: "VOO", name: "Vanguard S&P 500 ETF", symbol: "VOO", category: .stock),
        AssetDefinition(id: "SPY", name: "SPDR S&P 500 ETF", symbol: "SPY", category: .stock),
        AssetDefinition(id: "QQQ", name: "Invesco Nasdaq 100 ETF", symbol: "QQQ", category: .stock),
        AssetDefinition(id: "AAPL", name: "Apple", symbol: "AAPL", category: .stock),
        AssetDefinition(id: "MSFT", name: "Microsoft", symbol: "MSFT", category: .stock),
        AssetDefinition(id: "GOOGL", name: "Alphabet (Google)", symbol: "GOOGL", category: .stock),
    ]

    static let fiat: [AssetDefinition] = [
        AssetDefinition(id: "USD", name: "US Dollar", symbol: "USD", category: .fiat),
        AssetDefinition(id: "EUR", name: "Euro", symbol: "EUR", category: .fiat),
        AssetDefinition(id: "UAH", name: "Ukrainian Hryvnia", symbol: "UAH", category: .fiat),
        AssetDefinition(id: "GBP", name: "British Pound", symbol: "GBP", category: .fiat),
    ]

    static var all: [AssetDefinition] {
        crypto + stocks + fiat
    }

    static func search(query: String) -> [AssetDefinition] {
        let q = query.lowercased()
        return all.filter {
            $0.name.lowercased().contains(q) || $0.symbol.lowercased().contains(q)
        }
    }
}
```

**Step 2: Create AddAssetView**

```swift
import SwiftUI
import SwiftData

struct AddAssetView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var selectedAsset: AssetDefinition?
    @State private var amount = ""

    private var filteredAssets: [AssetDefinition] {
        if searchText.isEmpty {
            return AssetCatalog.all
        }
        return AssetCatalog.search(query: searchText)
    }

    var body: some View {
        NavigationStack {
            VStack {
                if let selected = selectedAsset {
                    amountInput(for: selected)
                } else {
                    assetPicker
                }
            }
            .navigationTitle("Add Asset")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var assetPicker: some View {
        List {
            ForEach(AssetCategory.allCases, id: \.self) { category in
                let assets = filteredAssets.filter { $0.category == category }
                if !assets.isEmpty {
                    Section(category.displayName) {
                        ForEach(assets) { asset in
                            Button {
                                selectedAsset = asset
                            } label: {
                                HStack {
                                    Image(systemName: category.iconName)
                                        .foregroundStyle(.secondary)
                                    VStack(alignment: .leading) {
                                        Text(asset.name)
                                        Text(asset.symbol)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search assets...")
    }

    private func amountInput(for asset: AssetDefinition) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Text(asset.name)
                .font(.title2.bold())

            TextField("Amount", text: $amount)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .font(.title)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Text("How much \(asset.symbol) do you own?")
                .foregroundStyle(.secondary)

            Button("Add to Portfolio") {
                saveAsset(asset)
            }
            .buttonStyle(.borderedProminent)
            .disabled(Double(amount) == nil || Double(amount)! <= 0)

            Button("Back") {
                selectedAsset = nil
                amount = ""
            }
            .foregroundStyle(.secondary)

            Spacer()
        }
    }

    private func saveAsset(_ definition: AssetDefinition) {
        guard let value = Double(amount), value > 0 else { return }

        let asset = Asset(
            name: definition.name,
            symbol: definition.id,
            category: definition.category,
            amount: value
        )
        modelContext.insert(asset)
        dismiss()
    }
}
```

**Step 3: Build**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add ios/
git commit -m "feat(ios): add asset selection and amount input flow"
```

---

### Task 19: Dashboard view

**Files:**
- Modify: `ios/WealthTrack/Views/DashboardView.swift`
- Create: `ios/WealthTrack/ViewModels/DashboardViewModel.swift`

**Step 1: Create the ViewModel**

```swift
import Foundation
import SwiftData
import Observation

@Observable
class DashboardViewModel {
    var holdings: [PortfolioHolding] = []
    var totalValue: Double = 0
    var breakdown: [AssetCategory: Double] = [:]
    var riskScore: RiskScore = RiskScore(value: 0, label: "No Assets")
    var projectionPreview: Projection?
    var isLoading = false

    func refresh(assets: [Asset]) async {
        isLoading = true

        // Fetch prices from API
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: "USD" // TODO: use UserSettings
            )

            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })

            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            // Use zero prices on error — user still sees their assets
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
                    pricePerUnit: 0,
                    category: asset.assetCategory
                )
            }
        }

        totalValue = PortfolioCalculator.totalValue(holdings: holdings)
        breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        riskScore = RiskCalculator.riskScore(holdings: holdings)
        projectionPreview = ProjectionEngine.project(holdings: holdings, years: 10)
        isLoading = false
    }
}
```

**Step 2: Build the Dashboard UI**

```swift
import SwiftUI
import SwiftData
import Charts

struct DashboardView: View {
    @Query private var assets: [Asset]
    @State private var viewModel = DashboardViewModel()
    @State private var showingAddAsset = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if assets.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 20) {
                        totalValueCard
                        breakdownChart
                        riskScoreCard
                        if let preview = viewModel.projectionPreview {
                            projectionPreviewCard(preview)
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("WealthTrack")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingAddAsset = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddAsset) {
                AddAssetView()
            }
            .task(id: assets.count) {
                await viewModel.refresh(assets: assets)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "chart.pie.fill")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("What do you own?")
                .font(.title2.bold())
            Text("Add your first asset to start tracking your wealth.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Add Asset") {
                showingAddAsset = true
            }
            .buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
    }

    private var totalValueCard: some View {
        VStack(spacing: 4) {
            Text("Total Portfolio Value")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(viewModel.totalValue, format: .currency(code: "USD"))
                .font(.system(size: 36, weight: .bold, design: .rounded))
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var breakdownChart: some View {
        VStack(alignment: .leading) {
            Text("Allocation")
                .font(.headline)
            Chart {
                ForEach(Array(viewModel.breakdown.keys.sorted(by: { $0.rawValue < $1.rawValue })), id: \.self) { category in
                    SectorMark(
                        angle: .value(category.displayName, viewModel.breakdown[category] ?? 0),
                        angularInset: 1.5
                    )
                    .foregroundStyle(by: .value("Category", category.displayName))
                }
            }
            .frame(height: 200)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var riskScoreCard: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("Risk Score")
                    .font(.headline)
                Text(viewModel.riskScore.label)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(viewModel.riskScore.value)")
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .foregroundStyle(riskColor)
            Text("/ 10")
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var riskColor: Color {
        switch viewModel.riskScore.value {
        case 1...3: return .green
        case 4...6: return .yellow
        default: return .red
        }
    }

    private func projectionPreviewCard(_ projection: Projection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("10-Year Projection")
                .font(.headline)
            HStack {
                projectionColumn(label: "Pessimistic", value: projection.pessimistic, color: .red)
                projectionColumn(label: "Expected", value: projection.expected, color: .blue)
                projectionColumn(label: "Optimistic", value: projection.optimistic, color: .green)
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func projectionColumn(label: String, value: Double, color: Color) -> some View {
        VStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value, format: .currency(code: "USD"))
                .font(.subheadline.bold())
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
    }
}
```

**Step 3: Build**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add ios/
git commit -m "feat(ios): build dashboard with total value, pie chart, risk score, projection preview"
```

---

### Task 20: Projections view with line chart

**Files:**
- Modify: `ios/WealthTrack/Views/ProjectionsView.swift`

**Step 1: Implement full projections view**

```swift
import SwiftUI
import SwiftData
import Charts

struct ProjectionsView: View {
    @Query private var assets: [Asset]
    @State private var selectedYears = 10
    @State private var holdings: [PortfolioHolding] = []

    private let yearOptions = [10, 20, 50]

    private var projection: Projection {
        ProjectionEngine.project(holdings: holdings, years: selectedYears)
    }

    private var chartData: [ProjectionPoint] {
        (0...selectedYears).flatMap { year in
            let p = ProjectionEngine.project(holdings: holdings, years: year)
            return [
                ProjectionPoint(year: year, value: p.pessimistic, scenario: "Pessimistic"),
                ProjectionPoint(year: year, value: p.expected, scenario: "Expected"),
                ProjectionPoint(year: year, value: p.optimistic, scenario: "Optimistic"),
            ]
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Picker("Timeframe", selection: $selectedYears) {
                        ForEach(yearOptions, id: \.self) { years in
                            Text("\(years) Years").tag(years)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    Chart(chartData) { point in
                        LineMark(
                            x: .value("Year", point.year),
                            y: .value("Value", point.value)
                        )
                        .foregroundStyle(by: .value("Scenario", point.scenario))
                    }
                    .chartForegroundStyleScale([
                        "Pessimistic": .red,
                        "Expected": .blue,
                        "Optimistic": .green,
                    ])
                    .frame(height: 300)
                    .padding()

                    // Final values
                    VStack(spacing: 12) {
                        projectionRow("Pessimistic", value: projection.pessimistic, color: .red)
                        projectionRow("Expected", value: projection.expected, color: .blue)
                        projectionRow("Optimistic", value: projection.optimistic, color: .green)
                    }
                    .padding()

                    Text("Based on historical average returns. Past performance does not guarantee future results.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
                }
            }
            .navigationTitle("Projections")
            .task(id: assets.count) {
                await refreshHoldings()
            }
        }
    }

    private func projectionRow(_ label: String, value: Double, color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 12, height: 12)
            Text(label)
            Spacer()
            Text(value, format: .currency(code: "USD"))
                .bold()
        }
    }

    private func refreshHoldings() async {
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: "USD"
            )
            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
                    pricePerUnit: 0,
                    category: asset.assetCategory
                )
            }
        }
    }
}

struct ProjectionPoint: Identifiable {
    let id = UUID()
    let year: Int
    let value: Double
    let scenario: String
}
```

**Step 2: Build**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add ios/
git commit -m "feat(ios): add projections view with line chart and scenario picker"
```

---

### Task 21: Insights view

**Files:**
- Modify: `ios/WealthTrack/Views/InsightsView.swift`

**Step 1: Implement insights view**

```swift
import SwiftUI
import SwiftData

struct InsightsView: View {
    @Query private var assets: [Asset]
    @State private var holdings: [PortfolioHolding] = []

    private var insights: [Insight] {
        InsightsEngine.generate(holdings: holdings)
    }

    var body: some View {
        NavigationStack {
            List {
                if insights.isEmpty && !holdings.isEmpty {
                    ContentUnavailableView(
                        "Portfolio Looks Good",
                        systemImage: "checkmark.circle.fill",
                        description: Text("No concerns with your current allocation.")
                    )
                } else if holdings.isEmpty {
                    ContentUnavailableView(
                        "Add Assets First",
                        systemImage: "plus.circle",
                        description: Text("Add assets to your portfolio to see insights.")
                    )
                } else {
                    ForEach(insights) { insight in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: insight.severity == .warning ? "exclamationmark.triangle.fill" : "info.circle.fill")
                                .foregroundStyle(insight.severity == .warning ? .orange : .blue)
                                .font(.title3)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(insight.title)
                                    .font(.headline)
                                Text(insight.message)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Insights")
            .task(id: assets.count) {
                await refreshHoldings()
            }
        }
    }

    private func refreshHoldings() async {
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: "USD"
            )
            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            holdings = []
        }
    }
}
```

**Step 2: Build**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add ios/
git commit -m "feat(ios): add insights view with educational tips"
```

---

## Phase 6: Freemium & Polish

### Task 22: Asset limit enforcement (free tier: 5 assets)

**Files:**
- Create: `ios/WealthTrack/Logic/PremiumGate.swift`
- Modify: `ios/WealthTrack/Views/AddAssetView.swift`

**Step 1: Create PremiumGate**

```swift
import Foundation

enum PremiumGate {
    static let freeAssetLimit = 5

    static func canAddAsset(currentCount: Int, isPremium: Bool) -> Bool {
        isPremium || currentCount < freeAssetLimit
    }
}
```

**Step 2: Add gate check in AddAssetView**

In `AddAssetView`, add a check before showing the asset picker. If the user has reached the limit and is not premium, show an upgrade prompt instead of the picker.

Add to AddAssetView body:

```swift
// Inside the VStack in body, before the existing if/else:
@Query private var allAssets: [Asset]

// In body, wrap existing content:
if !PremiumGate.canAddAsset(currentCount: allAssets.count, isPremium: false) {
    upgradePrompt
} else if let selected = selectedAsset {
    amountInput(for: selected)
} else {
    assetPicker
}
```

Add upgrade prompt view:
```swift
private var upgradePrompt: some View {
    VStack(spacing: 16) {
        Spacer()
        Image(systemName: "lock.fill")
            .font(.system(size: 48))
            .foregroundStyle(.secondary)
        Text("Free Limit Reached")
            .font(.title2.bold())
        Text("Upgrade to Premium to track unlimited assets.")
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        // TODO: Add StoreKit purchase button in future
        Button("Maybe Later") { dismiss() }
            .foregroundStyle(.secondary)
        Spacer()
    }
    .padding()
}
```

**Step 3: Build**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add ios/
git commit -m "feat(ios): add freemium gate with 5-asset limit for free tier"
```

---

### Task 23: Asset management (edit/delete)

**Files:**
- Create: `ios/WealthTrack/Views/AssetListView.swift`
- Modify: `ios/WealthTrack/Views/DashboardView.swift`

**Step 1: Create an asset list view with swipe-to-delete and edit**

```swift
import SwiftUI
import SwiftData

struct AssetListView: View {
    @Query private var assets: [Asset]
    @Environment(\.modelContext) private var modelContext
    @State private var editingAsset: Asset?

    var body: some View {
        List {
            ForEach(assets) { asset in
                HStack {
                    Image(systemName: asset.assetCategory.iconName)
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading) {
                        Text(asset.name)
                            .font(.headline)
                        Text("\(asset.amount, specifier: "%.4g") \(asset.symbol.uppercased())")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    editingAsset = asset
                }
            }
            .onDelete { indexSet in
                for index in indexSet {
                    modelContext.delete(assets[index])
                }
            }
        }
        .navigationTitle("My Assets")
        .sheet(item: $editingAsset) { asset in
            EditAssetView(asset: asset)
        }
    }
}

struct EditAssetView: View {
    @Bindable var asset: Asset
    @Environment(\.dismiss) private var dismiss
    @State private var amountText: String = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                Text(asset.name)
                    .font(.title2.bold())
                TextField("Amount", text: $amountText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .font(.title)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Button("Save") {
                    if let value = Double(amountText), value > 0 {
                        asset.amount = value
                    }
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                Spacer()
            }
            .navigationTitle("Edit \(asset.name)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                amountText = String(asset.amount)
            }
        }
    }
}
```

**Step 2: Add navigation to AssetListView from DashboardView**

In DashboardView, add a NavigationLink somewhere (e.g., add a toolbar button or a "View All Assets" row).

Add to the toolbar in DashboardView:
```swift
ToolbarItem(placement: .navigation) {
    NavigationLink(destination: AssetListView()) {
        Image(systemName: "list.bullet")
    }
}
```

**Step 3: Build**

```bash
cd ios && xcodebuild -scheme WealthTrack -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add ios/
git commit -m "feat(ios): add asset list with edit and swipe-to-delete"
```

---

### Task 24: End-to-end manual test

This is not a code task — it's a verification step.

**Step 1: Start the backend**

```bash
cd backend && cp .env.example .env
# Edit .env with real API keys (CoinGecko demo key, ExchangeRate API key)
npm run dev
```

**Step 2: Run the iOS app on simulator**

Open Xcode, select iPhone 16 simulator, press Run.

**Step 3: Test the full flow**

1. App opens → see "What do you own?" empty state
2. Tap "Add Asset" → see asset catalog with search
3. Add Bitcoin with amount 0.5
4. Add VOO (S&P 500 ETF) with amount 10
5. Add USD cash with amount 5000
6. Dashboard shows total value, pie chart, risk score, 10-year preview
7. Projections tab shows line chart with three scenarios
8. Insights tab shows relevant tips
9. Try adding a 6th asset → should hit free limit gate
10. Swipe to delete an asset → asset removed
11. Kill and reopen app → data persists (SwiftData)

**Step 4: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```

---

## Summary: Task Order and Dependencies

```
Phase 1: Scaffolding
  Task 1:  Monorepo root           ← no dependencies
  Task 2:  Backend scaffold        ← depends on Task 1
  Task 3:  Xcode project           ← depends on Task 1

Phase 2: Backend
  Task 4:  Shared types            ← depends on Task 2
  Task 5:  Crypto price service    ← depends on Task 4
  Task 6:  Stock price service     ← depends on Task 4
  Task 7:  Fiat exchange service   ← depends on Task 4
  Task 8:  Price cache             ← depends on Task 4
  Task 9:  Unified /api/prices     ← depends on Tasks 5-8

Phase 3: iOS Data Layer
  Task 10: SwiftData models        ← depends on Task 3
  Task 11: CloudKit config         ← depends on Task 10
  Task 12: Price API client        ← depends on Tasks 10, 9

Phase 4: iOS Business Logic
  Task 13: Portfolio calculator    ← depends on Task 10
  Task 14: Risk calculator         ← depends on Task 13
  Task 15: Projection engine       ← depends on Task 13
  Task 16: Insights engine         ← depends on Task 13

Phase 5: iOS UI
  Task 17: Navigation structure    ← depends on Task 11
  Task 18: Add asset flow          ← depends on Task 17
  Task 19: Dashboard view          ← depends on Tasks 12-16, 18
  Task 20: Projections view        ← depends on Tasks 12, 15
  Task 21: Insights view           ← depends on Tasks 12, 16
  Task 22: Freemium gate           ← depends on Task 18
  Task 23: Asset edit/delete       ← depends on Task 19

Phase 6: Verification
  Task 24: End-to-end test         ← depends on all above
```

**Total: 24 tasks across 6 phases. Each task is ~5-15 minutes of focused work.**
