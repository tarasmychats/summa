import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, MockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const MockPool = vi.fn(() => ({ query: mockQuery }));
  return { mockQuery, MockPool };
});

vi.mock("pg", () => ({ default: { Pool: MockPool } }));

import { resetPool } from "../../db.js";
import {
  insertDailyPrices,
  getMultiAssetPrices,
} from "../dailyPrices.js";

describe("dailyPrices repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPool();
  });

  describe("insertDailyPrices", () => {
    it("does nothing for empty array", async () => {
      await insertDailyPrices([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("inserts a single price row", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await insertDailyPrices([
        { assetId: "bitcoin", category: "crypto", date: "2025-01-01", priceUsd: 42000, priceEur: 38000 },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO daily_prices");
      expect(sql).toContain("($1, $2, $3, $4, $5)");
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("DO UPDATE SET");
      expect(params).toEqual(["bitcoin", "crypto", "2025-01-01", 42000, 38000]);
    });

    it("batch inserts multiple prices with correct parameterization", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await insertDailyPrices([
        { assetId: "bitcoin", category: "crypto", date: "2025-01-01", priceUsd: 42000, priceEur: 38000 },
        { assetId: "bitcoin", category: "crypto", date: "2025-01-02", priceUsd: 43000, priceEur: 39000 },
        { assetId: "AAPL", category: "stock", date: "2025-01-01", priceUsd: 180, priceEur: 165 },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("($1, $2, $3, $4, $5)");
      expect(sql).toContain("($6, $7, $8, $9, $10)");
      expect(sql).toContain("($11, $12, $13, $14, $15)");
      expect(params).toHaveLength(15);
      expect(params[0]).toBe("bitcoin");
      expect(params[5]).toBe("bitcoin");
      expect(params[10]).toBe("AAPL");
    });

    it("uses ON CONFLICT DO UPDATE to upsert existing prices", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await insertDailyPrices([
        { assetId: "bitcoin", category: "crypto", date: "2025-01-01", priceUsd: 45000, priceEur: 41000 },
      ]);

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("ON CONFLICT (asset_id, category, date)");
      expect(sql).toContain("COALESCE(EXCLUDED.price_usd, daily_prices.price_usd)");
      expect(sql).toContain("COALESCE(EXCLUDED.price_eur, daily_prices.price_eur)");
    });

    it("handles null prices", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await insertDailyPrices([
        { assetId: "EUR", category: "fiat", date: "2025-01-01", priceUsd: 1.08, priceEur: null },
      ]);

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual(["EUR", "fiat", "2025-01-01", 1.08, null]);
    });

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValue(new Error("connection refused"));

      await expect(
        insertDailyPrices([
          { assetId: "x", category: "crypto", date: "2025-01-01", priceUsd: 1, priceEur: 1 },
        ])
      ).rejects.toThrow("connection refused");
    });
  });

  describe("getMultiAssetPrices", () => {
    it("returns empty object for empty assets array", async () => {
      const result = await getMultiAssetPrices([], "2025-01-01", "2025-01-31", "usd");

      expect(result).toEqual({});
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("returns prices grouped by composite key (assetId:category)", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { asset_id: "AAPL", category: "stock", date: "2025-01-01", price: "180.00" },
          { asset_id: "AAPL", category: "stock", date: "2025-01-02", price: "182.00" },
          { asset_id: "bitcoin", category: "crypto", date: "2025-01-01", price: "42000.00" },
          { asset_id: "bitcoin", category: "crypto", date: "2025-01-02", price: "43000.00" },
        ],
      });

      const result = await getMultiAssetPrices(
        [
          { assetId: "AAPL", category: "stock" },
          { assetId: "bitcoin", category: "crypto" },
        ],
        "2025-01-01",
        "2025-01-31",
        "usd"
      );

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["AAPL:stock"]).toEqual([
        { date: "2025-01-01", price: 180 },
        { date: "2025-01-02", price: 182 },
      ]);
      expect(result["bitcoin:crypto"]).toEqual([
        { date: "2025-01-01", price: 42000 },
        { date: "2025-01-02", price: 43000 },
      ]);
    });

    it("returns empty arrays for assets with no price data", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await getMultiAssetPrices(
        [
          { assetId: "AAPL", category: "stock" },
          { assetId: "bitcoin", category: "crypto" },
        ],
        "2025-01-01",
        "2025-01-31",
        "usd"
      );

      expect(result["AAPL:stock"]).toEqual([]);
      expect(result["bitcoin:crypto"]).toEqual([]);
    });

    it("builds correct OR-based WHERE clause for multiple assets", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getMultiAssetPrices(
        [
          { assetId: "AAPL", category: "stock" },
          { assetId: "bitcoin", category: "crypto" },
        ],
        "2025-01-01",
        "2025-01-31",
        "usd"
      );

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("(asset_id = $1 AND category = $2)");
      expect(sql).toContain("(asset_id = $3 AND category = $4)");
      expect(sql).toContain("date >= $5 AND date <= $6");
      expect(sql).toContain("ORDER BY asset_id, category, date");
      expect(params).toEqual(["AAPL", "stock", "bitcoin", "crypto", "2025-01-01", "2025-01-31"]);
    });

    it("selects price_eur when currency is eur", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getMultiAssetPrices(
        [{ assetId: "AAPL", category: "stock" }],
        "2025-01-01",
        "2025-01-31",
        "eur"
      );

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("price_eur AS price");
    });

    it("handles single asset correctly", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ asset_id: "EUR", category: "fiat", date: "2025-01-01", price: "1.08" }],
      });

      const result = await getMultiAssetPrices(
        [{ assetId: "EUR", category: "fiat" }],
        "2025-01-01",
        "2025-01-31",
        "usd"
      );

      expect(result["EUR:fiat"]).toEqual([{ date: "2025-01-01", price: 1.08 }]);
    });

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValue(new Error("connection lost"));

      await expect(
        getMultiAssetPrices(
          [{ assetId: "x", category: "crypto" }],
          "2025-01-01",
          "2025-01-31",
          "usd"
        )
      ).rejects.toThrow("connection lost");
    });
  });
});
