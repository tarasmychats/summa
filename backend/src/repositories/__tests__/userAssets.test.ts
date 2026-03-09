import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({
  query: mockQuery,
}));

describe("userAssets repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserAssets", () => {
    it("returns assets with computed currentAmount", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: "a1", user_id: "u1", name: "Bitcoin", symbol: "bitcoin",
            ticker: "BTC", category: "crypto", amount: 1.0,
            current_amount: 1.5, created_at: new Date(),
          },
        ],
      });

      const { getUserAssets } = await import("../userAssets.js");
      const assets = await getUserAssets("u1");

      expect(assets).toHaveLength(1);
      expect(assets[0].symbol).toBe("bitcoin");
      expect(assets[0].currentAmount).toBe(1.5);

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("user_transactions");
      expect(sql).toContain("current_amount");
    });
  });

  describe("createAsset", () => {
    it("inserts asset and returns it", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: "a1", user_id: "u1", name: "Ethereum", symbol: "ethereum", ticker: "ETH", category: "crypto", amount: 10, created_at: new Date() }],
      });

      const { createAsset } = await import("../userAssets.js");
      const asset = await createAsset("u1", {
        name: "Ethereum", symbol: "ethereum", ticker: "ETH", category: "crypto", amount: 10,
      });

      expect(asset.name).toBe("Ethereum");
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO user_assets");
    });
  });

  describe("deleteAsset", () => {
    it("deletes asset owned by user", async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: "a1" }] });

      const { deleteAsset } = await import("../userAssets.js");
      await deleteAsset("u1", "a1");

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("DELETE FROM user_assets");
      expect(params).toContain("u1");
      expect(params).toContain("a1");
    });
  });
});
