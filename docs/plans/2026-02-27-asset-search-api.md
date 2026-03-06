# Asset Search API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded iOS asset catalog with a dynamic `GET /api/search` backend endpoint that proxies CoinGecko (crypto), Yahoo Finance (stocks), and ExchangeRate API (fiat).

**Architecture:** New search service modules per category on the backend, unified via a search router. The iOS app replaces its local `AssetCatalog` with an API call from `PriceAPIClient`, and `AddAssetView` uses debounced async search.

**Tech Stack:**
- Backend: Express router, CoinGecko `/search` API, yahoo-finance2 `search()`, ExchangeRate API currency list, PriceCache
- iOS: Swift async/await, Combine debounce (via `task` modifier), `PriceAPIClient`

**Design doc:** `docs/plans/2026-02-27-asset-search-api-design.md`

---

## Phase 1: Backend — Search Services

### Task 1: Add search types

**Files:**
- Modify: `backend/src/types.ts`

**Step 1: Add SearchResult and SearchResponse types to types.ts**

Add at the end of the existing file:

```typescript
export interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  category: AssetCategory;
}

export interface SearchResponse {
  results: SearchResult[];
}
```

**Step 2: Commit**

```bash
git add backend/src/types.ts
git commit -m "feat(backend): add search API types"
```

---

### Task 2: Crypto search service

**Files:**
- Create: `backend/src/services/cryptoSearch.ts`
- Create: `backend/src/services/__tests__/cryptoSearch.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCrypto } from "../cryptoSearch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("searchCrypto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching coins from CoinGecko search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        coins: [
          { id: "bitcoin", name: "Bitcoin", symbol: "BTC" },
          { id: "bitcoin-cash", name: "Bitcoin Cash", symbol: "BCH" },
        ],
      }),
    });

    const result = await searchCrypto("bitcoin");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      category: "crypto",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/search?query=bitcoin")
    );
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await searchCrypto("bitcoin");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty query", async () => {
    const result = await searchCrypto("");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/cryptoSearch.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement the service**

```typescript
import type { SearchResult } from "../types.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function searchCrypto(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const apiKey = process.env.COINGECKO_API_KEY;
  const params = new URLSearchParams({ query });
  if (apiKey) {
    params.set("x_cg_demo_api_key", apiKey);
  }

  try {
    const response = await fetch(`${COINGECKO_BASE}/search?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    const coins = data.coins ?? [];

    return coins.slice(0, 20).map((coin: any) => ({
      id: coin.id,
      name: coin.name,
      symbol: (coin.symbol ?? "").toUpperCase(),
      category: "crypto" as const,
    }));
  } catch {
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/services/__tests__/cryptoSearch.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/cryptoSearch.ts backend/src/services/__tests__/cryptoSearch.test.ts
git commit -m "feat(backend): add CoinGecko crypto search service"
```

---

### Task 3: Stock search service

**Files:**
- Create: `backend/src/services/stockSearch.ts`
- Create: `backend/src/services/__tests__/stockSearch.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchStocks } from "../stockSearch.js";

vi.mock("yahoo-finance2", () => ({
  default: {
    search: vi.fn(),
  },
}));

import yahooFinance from "yahoo-finance2";

describe("searchStocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching stocks from Yahoo Finance", async () => {
    vi.mocked(yahooFinance.search).mockResolvedValueOnce({
      quotes: [
        {
          symbol: "AAPL",
          shortname: "Apple Inc.",
          quoteType: "EQUITY",
          isYahooFinance: true,
          exchange: "NMS",
          index: "quotes",
          score: 100,
        },
        {
          symbol: "QQQ",
          shortname: "Invesco QQQ Trust",
          quoteType: "ETF",
          isYahooFinance: true,
          exchange: "NMS",
          index: "quotes",
          score: 90,
        },
      ],
      news: [],
      explains: [],
      count: 2,
      nav: [],
      lists: [],
      researchReports: [],
      totalTime: 100,
      timeTakenForQuotes: 50,
      timeTakenForNews: 30,
      timeTakenForAlgowatchlist: 0,
      timeTakenForPredefinedScreener: 0,
      timeTakenForCrunchbase: 0,
      timeTakenForNav: 0,
      timeTakenForResearchReports: 0,
      timeTakenForScreenerField: 0,
      timeTakenForCulturalAssets: 0,
      timeTakenForSearchLists: 0,
    } as any);

    const result = await searchStocks("apple");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "AAPL",
      name: "Apple Inc.",
      symbol: "AAPL",
      category: "stock",
    });
    expect(result[1]).toEqual({
      id: "QQQ",
      name: "Invesco QQQ Trust",
      symbol: "QQQ",
      category: "stock",
    });
  });

  it("filters out non-Yahoo results", async () => {
    vi.mocked(yahooFinance.search).mockResolvedValueOnce({
      quotes: [
        {
          name: "Some Startup",
          permalink: "some-startup",
          isYahooFinance: false,
          index: "crunchbase",
        },
      ],
      news: [],
      explains: [],
      count: 1,
      nav: [],
      lists: [],
      researchReports: [],
      totalTime: 50,
      timeTakenForQuotes: 25,
      timeTakenForNews: 10,
      timeTakenForAlgowatchlist: 0,
      timeTakenForPredefinedScreener: 0,
      timeTakenForCrunchbase: 0,
      timeTakenForNav: 0,
      timeTakenForResearchReports: 0,
      timeTakenForScreenerField: 0,
      timeTakenForCulturalAssets: 0,
      timeTakenForSearchLists: 0,
    } as any);

    const result = await searchStocks("startup");
    expect(result).toEqual([]);
  });

  it("returns empty array on error", async () => {
    vi.mocked(yahooFinance.search).mockRejectedValueOnce(new Error("API down"));

    const result = await searchStocks("apple");
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/stockSearch.test.ts
```

Expected: FAIL

**Step 3: Implement the service**

```typescript
import yahooFinance from "yahoo-finance2";
import type { SearchResult } from "../types.js";

export async function searchStocks(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    const result = await yahooFinance.search(query, { quotesCount: 20, newsCount: 0 });
    const quotes = result.quotes ?? [];

    return quotes
      .filter((q: any) => q.isYahooFinance && q.symbol)
      .slice(0, 20)
      .map((q: any) => ({
        id: q.symbol,
        name: q.shortname ?? q.longname ?? q.symbol,
        symbol: q.symbol,
        category: "stock" as const,
      }));
  } catch {
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/services/__tests__/stockSearch.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/stockSearch.ts backend/src/services/__tests__/stockSearch.test.ts
git commit -m "feat(backend): add Yahoo Finance stock search service"
```

---

### Task 4: Fiat currency search service

**Files:**
- Create: `backend/src/services/fiatSearch.ts`
- Create: `backend/src/services/__tests__/fiatSearch.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchFiat } from "../fiatSearch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("searchFiat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXCHANGERATE_API_KEY = "test-key";
  });

  it("returns currencies matching query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: "success",
        conversion_rates: {
          USD: 1,
          EUR: 0.92,
          UAH: 41.5,
          GBP: 0.79,
          JPY: 149.5,
        },
      }),
    });

    const result = await searchFiat("eur");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "EUR",
      name: "EUR",
      symbol: "EUR",
      category: "fiat",
    });
  });

  it("returns all currencies for empty query", async () => {
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

    const result = await searchFiat("");
    expect(result).toHaveLength(3);
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await searchFiat("usd");
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/fiatSearch.test.ts
```

Expected: FAIL

**Step 3: Implement the service**

The fiat search fetches the full currency list from ExchangeRate API (cached 24h by the router) and filters by query.

```typescript
import type { SearchResult } from "../types.js";

const EXCHANGERATE_BASE = "https://v6.exchangerate-api.com/v6";

// Well-known currency names for better display
const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar", EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen",
  UAH: "Ukrainian Hryvnia", CHF: "Swiss Franc", CAD: "Canadian Dollar",
  AUD: "Australian Dollar", CNY: "Chinese Yuan", INR: "Indian Rupee",
  BRL: "Brazilian Real", KRW: "South Korean Won", MXN: "Mexican Peso",
  PLN: "Polish Zloty", SEK: "Swedish Krona", NOK: "Norwegian Krone",
  DKK: "Danish Krone", CZK: "Czech Koruna", HUF: "Hungarian Forint",
  TRY: "Turkish Lira", ZAR: "South African Rand", SGD: "Singapore Dollar",
  HKD: "Hong Kong Dollar", NZD: "New Zealand Dollar", THB: "Thai Baht",
  ILS: "Israeli Shekel", PHP: "Philippine Peso", TWD: "Taiwan Dollar",
  AED: "UAE Dirham", SAR: "Saudi Riyal", EGP: "Egyptian Pound",
};

export async function searchFiat(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `${EXCHANGERATE_BASE}/${apiKey}/latest/USD`
    );
    if (!response.ok) return [];

    const data = await response.json();
    if (data.result !== "success") return [];

    const currencies = Object.keys(data.conversion_rates);
    const q = query.trim().toUpperCase();

    const filtered = q
      ? currencies.filter((code) => {
          const name = (CURRENCY_NAMES[code] ?? code).toUpperCase();
          return code.includes(q) || name.includes(q);
        })
      : currencies;

    return filtered.map((code) => ({
      id: code,
      name: CURRENCY_NAMES[code] ?? code,
      symbol: code,
      category: "fiat" as const,
    }));
  } catch {
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/services/__tests__/fiatSearch.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/fiatSearch.ts backend/src/services/__tests__/fiatSearch.test.ts
git commit -m "feat(backend): add fiat currency search service"
```

---

### Task 5: Search router with caching

**Files:**
- Create: `backend/src/routes/search.ts`
- Create: `backend/src/routes/__tests__/search.test.ts`
- Modify: `backend/src/index.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createSearchRouter } from "../search.js";

vi.mock("../../services/cryptoSearch.js", () => ({
  searchCrypto: vi.fn().mockResolvedValue([
    { id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: "crypto" },
  ]),
}));

vi.mock("../../services/stockSearch.js", () => ({
  searchStocks: vi.fn().mockResolvedValue([
    { id: "AAPL", name: "Apple Inc.", symbol: "AAPL", category: "stock" },
  ]),
}));

vi.mock("../../services/fiatSearch.js", () => ({
  searchFiat: vi.fn().mockResolvedValue([
    { id: "USD", name: "US Dollar", symbol: "USD", category: "fiat" },
  ]),
}));

describe("GET /api/search", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use("/api", createSearchRouter());
  });

  it("returns results from all categories when no category specified", async () => {
    const response = await request(app).get("/api/search?q=bit");

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(3);
    expect(response.body.results.map((r: any) => r.category)).toContain("crypto");
    expect(response.body.results.map((r: any) => r.category)).toContain("stock");
    expect(response.body.results.map((r: any) => r.category)).toContain("fiat");
  });

  it("filters by category when specified", async () => {
    const response = await request(app).get("/api/search?q=bit&category=crypto");

    expect(response.status).toBe(200);
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

```bash
cd backend && npx vitest run src/routes/__tests__/search.test.ts
```

Expected: FAIL

**Step 3: Implement the router**

```typescript
import { Router } from "express";
import { searchCrypto } from "../services/cryptoSearch.js";
import { searchStocks } from "../services/stockSearch.js";
import { searchFiat } from "../services/fiatSearch.js";
import { PriceCache } from "../cache.js";
import type { SearchResult, SearchResponse, AssetCategory } from "../types.js";

const searchCache = new PriceCache(300_000); // 5 minute cache
const fiatCache = new PriceCache(86_400_000); // 24 hour cache for fiat list

export function createSearchRouter(): Router {
  const router = Router();

  router.get("/search", async (req, res) => {
    const q = (req.query.q as string ?? "").trim();
    const category = req.query.category as AssetCategory | undefined;

    if (!q) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const cacheKey = `search_${q.toLowerCase()}_${category ?? "all"}`;
    const cached = searchCache.get<SearchResult[]>(cacheKey);

    if (cached) {
      const response: SearchResponse = { results: cached };
      res.json(response);
      return;
    }

    const searches: Promise<SearchResult[]>[] = [];

    if (!category || category === "crypto") {
      searches.push(searchCrypto(q));
    }
    if (!category || category === "stock") {
      searches.push(searchStocks(q));
    }
    if (!category || category === "fiat") {
      // Use separate long-lived cache for fiat
      const fiatCacheKey = `fiat_list_${q.toLowerCase()}`;
      const cachedFiat = fiatCache.get<SearchResult[]>(fiatCacheKey);
      if (cachedFiat) {
        searches.push(Promise.resolve(cachedFiat));
      } else {
        searches.push(
          searchFiat(q).then((results) => {
            fiatCache.set(fiatCacheKey, results);
            return results;
          })
        );
      }
    }

    const results = (await Promise.all(searches)).flat();
    searchCache.set(cacheKey, results);

    const response: SearchResponse = { results };
    res.json(response);
  });

  return router;
}
```

**Step 4: Mount the router in index.ts**

Update `backend/src/index.ts` — add import and mount:

```typescript
import express from "express";
import { createPricesRouter } from "./routes/prices.js";
import { createSearchRouter } from "./routes/search.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", createPricesRouter());
app.use("/api", createSearchRouter());

app.listen(PORT, () => {
  console.log(`Summa API running on port ${PORT}`);
});

export default app;
```

**Step 5: Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/src/routes/search.ts backend/src/routes/__tests__/search.test.ts backend/src/index.ts
git commit -m "feat(backend): add unified /api/search endpoint with caching"
```

---

## Phase 2: iOS — Dynamic Search

### Task 6: Add search API to PriceAPIClient

**Files:**
- Modify: `mobile/Summa/Summa/Services/PriceModels.swift`
- Modify: `mobile/Summa/Summa/Services/PriceAPIClient.swift`

**Step 1: Add search response model to PriceModels.swift**

Add at the end of the file:

```swift
struct SearchResponseBody: Codable {
    let results: [SearchResultItem]
}

struct SearchResultItem: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let symbol: String
    let category: String
}
```

**Step 2: Add searchAssets method to PriceAPIClient.swift**

Add inside the `PriceAPIClient` class, after the existing `fetchPrices` method:

```swift
    func searchAssets(query: String) async throws -> [SearchResultItem] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            return []
        }

        var components = URLComponents(string: "\(baseURL)/search")
        components?.queryItems = [URLQueryItem(name: "q", value: query)]

        guard let url = components?.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError
        }

        let decoded = try JSONDecoder().decode(SearchResponseBody.self, from: data)
        return decoded.results
    }
```

**Step 3: Build**

```bash
cd mobile/Summa && /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 17' build
```

Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add mobile/Summa/Summa/Services/
git commit -m "feat(ios): add asset search API to PriceAPIClient"
```

---

### Task 7: Replace AssetCatalog with API-driven search in AddAssetView

**Files:**
- Modify: `mobile/Summa/Summa/Data/AssetCatalog.swift`
- Modify: `mobile/Summa/Summa/Views/AddAssetView.swift`

**Step 1: Simplify AssetCatalog — remove hardcoded data, keep only the struct**

Replace `AssetCatalog.swift` entirely:

```swift
import Foundation

struct AssetDefinition: Identifiable, Hashable {
    let id: String
    let name: String
    let symbol: String
    let category: AssetCategory

    init(id: String, name: String, symbol: String, category: AssetCategory) {
        self.id = id
        self.name = name
        self.symbol = symbol
        self.category = category
    }

    init(from searchResult: SearchResultItem) {
        self.id = searchResult.id
        self.name = searchResult.name
        self.symbol = searchResult.symbol
        self.category = AssetCategory(rawValue: searchResult.category) ?? .fiat
    }
}
```

**Step 2: Rewrite AddAssetView with debounced API search**

Replace `AddAssetView.swift` entirely:

```swift
import SwiftUI
import SwiftData

struct AddAssetView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var allAssets: [Asset]

    @State private var searchText = ""
    @State private var selectedAsset: AssetDefinition?
    @State private var amount = ""
    @State private var searchResults: [AssetDefinition] = []
    @State private var isSearching = false
    @State private var searchError: String?
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack {
                if !PremiumGate.canAddAsset(currentCount: allAssets.count, isPremium: false) {
                    upgradePrompt
                } else if let selected = selectedAsset {
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
            if searchText.isEmpty {
                Section {
                    Text("Type to search for crypto, stocks, ETFs, or currencies")
                        .foregroundStyle(.secondary)
                }
            } else if isSearching {
                Section {
                    HStack {
                        ProgressView()
                        Text("Searching...")
                            .foregroundStyle(.secondary)
                    }
                }
            } else if let error = searchError {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                }
            } else if searchResults.isEmpty {
                Section {
                    Text("No results for \"\(searchText)\"")
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(AssetCategory.allCases, id: \.self) { category in
                    let assets = searchResults.filter { $0.category == category }
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
        }
        .searchable(text: $searchText, prompt: "Search crypto, stocks, currencies...")
        .onChange(of: searchText) { _, newValue in
            debounceSearch(query: newValue)
        }
    }

    private func debounceSearch(query: String) {
        searchTask?.cancel()

        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            searchResults = []
            searchError = nil
            isSearching = false
            return
        }

        isSearching = true
        searchError = nil

        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))

            guard !Task.isCancelled else { return }

            do {
                let results = try await PriceAPIClient.shared.searchAssets(query: query)
                guard !Task.isCancelled else { return }

                searchResults = results.map { AssetDefinition(from: $0) }
                searchError = nil
            } catch {
                guard !Task.isCancelled else { return }
                searchResults = []
                searchError = "Search failed. Check your connection."
            }
            isSearching = false
        }
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
            Button("Maybe Later") { dismiss() }
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
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
cd mobile/Summa && /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 17' build
```

Expected: BUILD SUCCEEDED

**Step 4: Run all tests**

```bash
cd mobile/Summa && /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test -scheme Summa -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:SummaTests
```

Expected: ALL PASS (existing logic tests unaffected)

**Step 5: Commit**

```bash
git add mobile/Summa/Summa/Data/AssetCatalog.swift mobile/Summa/Summa/Views/AddAssetView.swift
git commit -m "feat(ios): replace hardcoded asset catalog with API-driven search"
```
