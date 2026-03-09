import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createHistoryRouter } from "../history.js";

const mockGetMultiAssetPrices = vi.fn();
const mockGetMultiAssetPricesAggregated = vi.fn();
const mockBackfillAsset = vi.fn();

vi.mock("../../repositories/dailyPrices.js", () => ({
  getMultiAssetPrices: (...args: unknown[]) => mockGetMultiAssetPrices(...args),
  getMultiAssetPricesAggregated: (...args: unknown[]) => mockGetMultiAssetPricesAggregated(...args),
  assetKey: (assetId: string, category: string) => `${assetId}:${category}`,
}));

vi.mock("../../services/backfill.js", () => ({
  backfillAsset: (...args: unknown[]) => mockBackfillAsset(...args),
}));

vi.mock("../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../db.js", () => ({
  isDbReady: () => true,
}));

describe("GET /api/history", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use("/api", createHistoryRouter());
    mockBackfillAsset.mockResolvedValue(undefined);
  });

  describe("valid requests", () => {
    it("returns history for a single asset", async () => {
      mockGetMultiAssetPricesAggregated.mockResolvedValue({
        "bitcoin:crypto": [
          { date: "2024-01-01", price: 42000 },
          { date: "2024-01-02", price: 43000 },
        ],
      });

      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(200);
      expect(response.body.history["bitcoin:crypto"]).toHaveLength(2);
      expect(response.body.currency).toBe("usd");
      expect(response.body.from).toBe("2024-01-01");
      expect(response.body.to).toBe("2024-01-31");
      expect(mockGetMultiAssetPricesAggregated).toHaveBeenCalledWith(
        [{ assetId: "bitcoin", category: "crypto" }],
        "2024-01-01",
        "2024-01-31",
        "usd",
        "daily"
      );
    });

    it("returns history for multiple assets", async () => {
      mockGetMultiAssetPricesAggregated.mockResolvedValue({
        "bitcoin:crypto": [{ date: "2024-01-01", price: 42000 }],
        "AAPL:stock": [{ date: "2024-01-01", price: 185 }],
      });

      const response = await request(app).get("/api/history").query({
        assets: "bitcoin,AAPL",
        categories: "crypto,stock",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(200);
      expect(response.body.history["bitcoin:crypto"]).toHaveLength(1);
      expect(response.body.history["AAPL:stock"]).toHaveLength(1);
      expect(mockGetMultiAssetPricesAggregated).toHaveBeenCalledWith(
        [
          { assetId: "bitcoin", category: "crypto" },
          { assetId: "AAPL", category: "stock" },
        ],
        "2024-01-01",
        "2024-01-31",
        "usd",
        "daily"
      );
    });

    it("accepts EUR currency", async () => {
      mockGetMultiAssetPricesAggregated.mockResolvedValue({
        "AAPL:stock": [{ date: "2024-01-01", price: 170 }],
      });

      const response = await request(app).get("/api/history").query({
        assets: "AAPL",
        categories: "stock",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "eur",
      });

      expect(response.status).toBe(200);
      expect(mockGetMultiAssetPricesAggregated).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "eur",
        "daily"
      );
    });

    it("handles case-insensitive currency", async () => {
      mockGetMultiAssetPricesAggregated.mockResolvedValue({
        "AAPL:stock": [],
      });

      const response = await request(app).get("/api/history").query({
        assets: "AAPL",
        categories: "stock",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "USD",
      });

      expect(response.status).toBe(200);
      expect(mockGetMultiAssetPricesAggregated).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "usd",
        "daily"
      );
    });
  });

  describe("validation errors", () => {
    it("returns 400 when assets param is missing", async () => {
      const response = await request(app).get("/api/history").query({
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Missing required");
    });

    it("returns 400 when categories param is missing", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Missing required");
    });

    it("returns 400 when from date is missing", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Missing required");
    });

    it("returns 400 when currency is missing", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Missing required");
    });

    it("returns 400 when assets and categories have different lengths", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin,AAPL",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("same length");
    });

    it("returns 400 for invalid from date format", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "01-01-2024",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("valid dates");
    });

    it("returns 400 for invalid to date format", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "not-a-date",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("valid dates");
    });

    it("returns 400 for invalid currency", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "gbp",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("currency must be");
    });

    it("returns 400 for invalid category", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "gold",
        categories: "commodity",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid category");
    });

    it("returns 400 when from date is after to date", async () => {
      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-12-31",
        to: "2024-01-01",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("before or equal");
    });

    it("returns 400 when requesting more than 50 assets", async () => {
      const manyAssets = Array.from({ length: 51 }, (_, i) => `asset${i}`).join(",");
      const manyCategories = Array.from({ length: 51 }, () => "crypto").join(",");

      const response = await request(app).get("/api/history").query({
        assets: manyAssets,
        categories: manyCategories,
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Maximum 50");
    });
  });

  describe("empty history and backfill", () => {
    it("returns empty array for asset with no history and triggers backfill", async () => {
      mockGetMultiAssetPricesAggregated.mockResolvedValue({
        "bitcoin:crypto": [],
      });

      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(200);
      expect(response.body.history["bitcoin:crypto"]).toEqual([]);
      // Backfill should be triggered asynchronously
      expect(mockBackfillAsset).toHaveBeenCalledWith("bitcoin", "crypto");
    });

    it("does not trigger backfill for assets with existing history", async () => {
      mockGetMultiAssetPricesAggregated.mockResolvedValue({
        "bitcoin:crypto": [{ date: "2024-01-01", price: 42000 }],
      });

      await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(mockBackfillAsset).not.toHaveBeenCalled();
    });

    it("triggers backfill only for empty assets in a multi-asset request", async () => {
      mockGetMultiAssetPricesAggregated.mockResolvedValue({
        "bitcoin:crypto": [{ date: "2024-01-01", price: 42000 }],
        "AAPL:stock": [],
      });

      await request(app).get("/api/history").query({
        assets: "bitcoin,AAPL",
        categories: "crypto,stock",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(mockBackfillAsset).toHaveBeenCalledTimes(1);
      expect(mockBackfillAsset).toHaveBeenCalledWith("AAPL", "stock");
    });
  });

  describe("error handling", () => {
    it("returns 500 when repository throws", async () => {
      mockGetMultiAssetPricesAggregated.mockRejectedValue(new Error("DB connection failed"));

      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Internal server error");
    });
  });

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
});
