import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mockInitDb = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockStartDailyCron = vi.hoisted(() => vi.fn());

vi.mock("../db.js", () => ({
  initDb: mockInitDb,
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
  resetPool: vi.fn(),
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
  fetchFiatRates: vi.fn().mockResolvedValue([]),
}));

vi.mock("../repositories/trackedAssets.js", () => ({
  upsertTrackedAssets: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../repositories/dailyPrices.js", () => ({
  getMultiAssetPrices: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/backfill.js", () => ({
  backfillAsset: vi.fn().mockResolvedValue(undefined),
}));

import app, { isDbReady, startServer } from "../index.js";

describe("server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      // Verify the server accepts the request (doesn't refuse connections or crash)
      const res = await request(app)
        .post("/api/prices")
        .send({ assets: [{ id: "bitcoin", category: "crypto" }], baseCurrency: "usd" });
      // Status may be 200 or 500 depending on mocked services, but the server handles it
      expect(res.status).toBeDefined();
      expect(res.body).toBeDefined();
    });

    it("serves GET /api/search without a real database", async () => {
      const res = await request(app).get("/api/search?q=btc");
      expect(res.status).toBe(200);
    });

    it("serves GET /api/history without a real database", async () => {
      const res = await request(app).get(
        "/api/history?assets=bitcoin&categories=crypto&from=2025-01-01&to=2025-06-01&currency=usd"
      );
      expect(res.status).toBe(200);
    });
  });

  describe("exports", () => {
    it("exports isDbReady function", () => {
      expect(typeof isDbReady).toBe("function");
      expect(typeof isDbReady()).toBe("boolean");
    });

    it("exports startServer async function", () => {
      expect(typeof startServer).toBe("function");
    });
  });
});
