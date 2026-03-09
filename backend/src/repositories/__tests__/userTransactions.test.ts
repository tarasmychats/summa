import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({
  query: mockQuery,
}));

describe("userTransactions repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTransactions", () => {
    it("returns transactions for an asset owned by user", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "t1", user_id: "u1", asset_id: "a1", type: "delta", amount: 0.5, note: "bought more", date: new Date(), created_at: new Date() },
        ],
      });

      const { getTransactions } = await import("../userTransactions.js");
      const txs = await getTransactions("u1", "a1");

      expect(txs).toHaveLength(1);
      expect(txs[0].amount).toBe(0.5);
      expect(txs[0].type).toBe("delta");
    });
  });

  describe("createTransaction", () => {
    it("inserts transaction linked to asset and user", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: "t1", user_id: "u1", asset_id: "a1", type: "delta", amount: -0.2, note: null, date: new Date(), created_at: new Date() }],
      });

      const { createTransaction } = await import("../userTransactions.js");
      const tx = await createTransaction("u1", "a1", {
        type: "delta", amount: -0.2, date: new Date().toISOString(),
      });

      expect(tx.amount).toBe(-0.2);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO user_transactions");
    });
  });

  describe("deleteTransaction", () => {
    it("deletes transaction owned by user", async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: "t1" }] });

      const { deleteTransaction } = await import("../userTransactions.js");
      const deleted = await deleteTransaction("u1", "t1");

      expect(deleted).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("DELETE FROM user_transactions");
      expect(params).toContain("u1");
    });
  });
});
