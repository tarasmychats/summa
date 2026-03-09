import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
vi.mock("../../db.js", () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { seedAssets, getAllAssets, searchAssets } from "../assets.js";

describe("assets repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  describe("seedAssets", () => {
    it("does nothing for empty array", async () => {
      await seedAssets([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("builds parameterized INSERT with ON CONFLICT DO UPDATE", async () => {
      await seedAssets([
        { id: "bitcoin", category: "crypto", name: "Bitcoin", symbol: "BTC", enabled: true },
        { id: "AAPL", category: "stock", name: "Apple Inc.", symbol: "AAPL" },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO assets");
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("DO UPDATE SET");
      expect(sql).toContain("enabled = EXCLUDED.enabled");
      expect(params).toEqual([
        "bitcoin", "crypto", "Bitcoin", "BTC", true,
        "AAPL", "stock", "Apple Inc.", "AAPL", false,
      ]);
    });
  });

  describe("getAllAssets", () => {
    it("returns assets grouped by category", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "bitcoin", category: "crypto" },
          { id: "AAPL", category: "stock" },
          { id: "VOO", category: "etf" },
        ],
      });

      const result = await getAllAssets();
      expect(result.crypto).toEqual([{ assetId: "bitcoin", category: "crypto" }]);
      expect(result.stock).toEqual([{ assetId: "AAPL", category: "stock" }]);
      expect(result.etf).toEqual([{ assetId: "VOO", category: "etf" }]);
    });
  });

  describe("searchAssets", () => {
    it("queries with ILIKE pattern and optional category filter", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "bitcoin", category: "crypto", name: "Bitcoin", symbol: "BTC" },
        ],
      });

      const results = await searchAssets("bit");
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("ILIKE");
      expect(params[0]).toBe("%bit%");
      expect(params[1]).toBe("bit%");
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: "bitcoin",
        name: "Bitcoin",
        symbol: "BTC",
        category: "crypto",
      });
    });

    it("filters by category when provided", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await searchAssets("bit", "crypto");
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("category = ");
      expect(params).toContain("crypto");
    });
  });
});
