import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mockInitDb = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockStartDailyCron = vi.hoisted(() => vi.fn());

let mockDbReady = false;
vi.mock("../db.js", () => ({
  initDb: mockInitDb,
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
  resetPool: vi.fn(),
  isDbReady: () => mockDbReady,
  setDbReady: (v: boolean) => { mockDbReady = v; },
}));

vi.mock("../services/cronJob.js", () => ({
  startDailyCron: mockStartDailyCron,
}));

vi.mock("../services/crypto.js", () => ({
  fetchCryptoPrices: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/stocks.js", () => ({
  fetchStockPrices: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/fiat.js", () => ({
  fetchExchangeRates: vi.fn().mockResolvedValue([]),
}));

vi.mock("../repositories/trackedAssets.js", () => ({
  upsertTrackedAssets: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../repositories/dailyPrices.js", () => ({
  getMultiAssetPrices: vi.fn().mockResolvedValue({}),
  assetKey: (assetId: string, category: string) => `${assetId}:${category}`,
}));

vi.mock("../services/cryptoSearch.js", () => ({
  searchCrypto: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/stockSearch.js", () => ({
  searchStocks: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/fiatSearch.js", () => ({
  searchFiat: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/backfill.js", () => ({
  backfillAsset: vi.fn().mockResolvedValue(undefined),
}));

import app from "../index.js";

describe("server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReady = false;
  });

  describe("health endpoint", () => {
    it("returns status ok with db readiness", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body).toHaveProperty("db");
      expect(typeof res.body.db).toBe("boolean");
    });
  });

  describe("graceful degradation", () => {
    it("serves POST /api/prices without a real database", async () => {
      const res = await request(app)
        .post("/api/prices")
        .send({ assets: [{ id: "bitcoin", category: "crypto" }], baseCurrency: "usd" });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("prices");
      expect(res.body).toHaveProperty("baseCurrency");
    });

    it("serves GET /api/search without a real database", async () => {
      const res = await request(app).get("/api/search?q=btc");
      expect(res.status).toBe(200);
    });

    it("serves GET /api/history with empty results when DB is not ready", async () => {
      const res = await request(app).get(
        "/api/history?assets=bitcoin&categories=crypto&from=2025-01-01&to=2025-06-01&currency=usd"
      );
      expect(res.status).toBe(200);
      expect(res.body.history).toHaveProperty("bitcoin:crypto");
      expect(res.body.history["bitcoin:crypto"]).toEqual([]);
    });
  });
});
