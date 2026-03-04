import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createHistoryRouter } from "../history.js";

const mockGetMultiAssetPrices = vi.fn();
const mockBackfillAsset = vi.fn();

vi.mock("../../repositories/dailyPrices.js", () => ({
  getMultiAssetPrices: (...args: unknown[]) => mockGetMultiAssetPrices(...args),
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
      mockGetMultiAssetPrices.mockResolvedValue({
        bitcoin: [
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
      expect(response.body.history.bitcoin).toHaveLength(2);
      expect(response.body.currency).toBe("usd");
      expect(response.body.from).toBe("2024-01-01");
      expect(response.body.to).toBe("2024-01-31");
      expect(mockGetMultiAssetPrices).toHaveBeenCalledWith(
        [{ assetId: "bitcoin", category: "crypto" }],
        "2024-01-01",
        "2024-01-31",
        "usd"
      );
    });

    it("returns history for multiple assets", async () => {
      mockGetMultiAssetPrices.mockResolvedValue({
        bitcoin: [{ date: "2024-01-01", price: 42000 }],
        AAPL: [{ date: "2024-01-01", price: 185 }],
      });

      const response = await request(app).get("/api/history").query({
        assets: "bitcoin,AAPL",
        categories: "crypto,stock",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(200);
      expect(response.body.history.bitcoin).toHaveLength(1);
      expect(response.body.history.AAPL).toHaveLength(1);
      expect(mockGetMultiAssetPrices).toHaveBeenCalledWith(
        [
          { assetId: "bitcoin", category: "crypto" },
          { assetId: "AAPL", category: "stock" },
        ],
        "2024-01-01",
        "2024-01-31",
        "usd"
      );
    });

    it("accepts EUR currency", async () => {
      mockGetMultiAssetPrices.mockResolvedValue({
        AAPL: [{ date: "2024-01-01", price: 170 }],
      });

      const response = await request(app).get("/api/history").query({
        assets: "AAPL",
        categories: "stock",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "eur",
      });

      expect(response.status).toBe(200);
      expect(mockGetMultiAssetPrices).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "eur"
      );
    });

    it("handles case-insensitive currency", async () => {
      mockGetMultiAssetPrices.mockResolvedValue({
        AAPL: [],
      });

      const response = await request(app).get("/api/history").query({
        assets: "AAPL",
        categories: "stock",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "USD",
      });

      expect(response.status).toBe(200);
      expect(mockGetMultiAssetPrices).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "usd"
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
  });

  describe("empty history and backfill", () => {
    it("returns empty array for asset with no history and triggers backfill", async () => {
      mockGetMultiAssetPrices.mockResolvedValue({
        bitcoin: [],
      });

      const response = await request(app).get("/api/history").query({
        assets: "bitcoin",
        categories: "crypto",
        from: "2024-01-01",
        to: "2024-01-31",
        currency: "usd",
      });

      expect(response.status).toBe(200);
      expect(response.body.history.bitcoin).toEqual([]);
      // Backfill should be triggered asynchronously
      expect(mockBackfillAsset).toHaveBeenCalledWith("bitcoin", "crypto");
    });

    it("does not trigger backfill for assets with existing history", async () => {
      mockGetMultiAssetPrices.mockResolvedValue({
        bitcoin: [{ date: "2024-01-01", price: 42000 }],
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
      mockGetMultiAssetPrices.mockResolvedValue({
        bitcoin: [{ date: "2024-01-01", price: 42000 }],
        AAPL: [],
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
      mockGetMultiAssetPrices.mockRejectedValue(new Error("DB connection failed"));

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
});
