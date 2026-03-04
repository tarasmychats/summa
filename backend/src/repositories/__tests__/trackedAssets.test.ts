import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, MockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const MockPool = vi.fn(() => ({ query: mockQuery }));
  return { mockQuery, MockPool };
});

vi.mock("pg", () => ({ default: { Pool: MockPool } }));

import { resetPool } from "../../db.js";
import {
  upsertTrackedAssets,
  getAllTrackedAssets,
} from "../trackedAssets.js";

describe("trackedAssets repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPool();
  });

  describe("upsertTrackedAssets", () => {
    it("inserts new assets with ON CONFLICT DO NOTHING", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await upsertTrackedAssets([
        { assetId: "bitcoin", category: "crypto" },
        { assetId: "AAPL", category: "stock" },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO tracked_assets");
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("DO NOTHING");
      expect(params).toEqual(["bitcoin", "crypto", "AAPL", "stock"]);
    });

    it("does nothing for empty array", async () => {
      await upsertTrackedAssets([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("handles single asset", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await upsertTrackedAssets([{ assetId: "EUR", category: "fiat" }]);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("($1, $2)");
      expect(params).toEqual(["EUR", "fiat"]);
    });

    it("builds correct parameterized placeholders for multiple assets", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await upsertTrackedAssets([
        { assetId: "a", category: "crypto" },
        { assetId: "b", category: "stock" },
        { assetId: "c", category: "fiat" },
      ]);

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("($1, $2)");
      expect(sql).toContain("($3, $4)");
      expect(sql).toContain("($5, $6)");
    });

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValue(new Error("unique violation"));

      await expect(
        upsertTrackedAssets([{ assetId: "x", category: "crypto" }])
      ).rejects.toThrow("unique violation");
    });
  });

  describe("getAllTrackedAssets", () => {
    it("returns empty object when no assets exist", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await getAllTrackedAssets();

      expect(result).toEqual({});
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("SELECT");
      expect(sql).toContain("tracked_assets");
    });

    it("returns assets grouped by category", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { asset_id: "bitcoin", category: "crypto", first_seen: new Date("2025-01-01") },
          { asset_id: "ethereum", category: "crypto", first_seen: new Date("2025-01-02") },
          { asset_id: "AAPL", category: "stock", first_seen: new Date("2025-01-01") },
          { asset_id: "EUR", category: "fiat", first_seen: new Date("2025-01-03") },
        ],
      });

      const result = await getAllTrackedAssets();

      expect(Object.keys(result)).toHaveLength(3);
      expect(result.crypto).toHaveLength(2);
      expect(result.stock).toHaveLength(1);
      expect(result.fiat).toHaveLength(1);

      expect(result.crypto[0]).toEqual({
        assetId: "bitcoin",
        category: "crypto",
        firstSeen: new Date("2025-01-01"),
      });
      expect(result.stock[0]).toEqual({
        assetId: "AAPL",
        category: "stock",
        firstSeen: new Date("2025-01-01"),
      });
    });

    it("maps snake_case DB columns to camelCase properties", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { asset_id: "BTC", category: "crypto", first_seen: new Date("2025-06-01") },
        ],
      });

      const result = await getAllTrackedAssets();

      expect(result.crypto[0].assetId).toBe("BTC");
      expect(result.crypto[0].firstSeen).toEqual(new Date("2025-06-01"));
    });

    it("queries ordered by category and asset_id", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getAllTrackedAssets();

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("ORDER BY category, asset_id");
    });

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValue(new Error("connection lost"));

      await expect(getAllTrackedAssets()).rejects.toThrow("connection lost");
    });
  });
});
