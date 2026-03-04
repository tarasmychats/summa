import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, MockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const MockPool = vi.fn(() => ({ query: mockQuery }));
  return { mockQuery, MockPool };
});

vi.mock("pg", () => ({ default: { Pool: MockPool } }));

import { resetPool } from "../../db.js";
import {
  getBackfillStatus,
  upsertBackfillStatus,
} from "../backfillStatus.js";

describe("backfillStatus repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPool();
  });

  describe("getBackfillStatus", () => {
    it("returns null when asset has no backfill record", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await getBackfillStatus("bitcoin", "crypto");

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("SELECT");
      expect(sql).toContain("backfill_status");
      expect(params).toEqual(["bitcoin", "crypto"]);
    });

    it("returns status for an existing asset", async () => {
      const oldestDate = new Date("2024-01-01");
      const lastUpdated = new Date("2025-03-01T12:00:00Z");
      mockQuery.mockResolvedValue({
        rows: [{ oldest_date: oldestDate, last_updated: lastUpdated }],
      });

      const result = await getBackfillStatus("AAPL", "stock");

      expect(result).toEqual({
        oldestDate,
        lastUpdated,
      });
    });

    it("queries with correct asset_id and category", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getBackfillStatus("EUR", "fiat");

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("asset_id = $1");
      expect(sql).toContain("category = $2");
      expect(params).toEqual(["EUR", "fiat"]);
    });

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValue(new Error("connection refused"));

      await expect(getBackfillStatus("BTC", "crypto")).rejects.toThrow(
        "connection refused"
      );
    });
  });

  describe("upsertBackfillStatus", () => {
    it("inserts a new backfill status record", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await upsertBackfillStatus("bitcoin", "crypto", new Date("2024-01-01"));

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO backfill_status");
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("DO UPDATE");
      expect(params).toEqual(["bitcoin", "crypto", new Date("2024-01-01")]);
    });

    it("updates oldest_date and last_updated on conflict", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await upsertBackfillStatus("AAPL", "stock", new Date("2020-01-01"));

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("ON CONFLICT (asset_id, category)");
      expect(sql).toContain("SET oldest_date = EXCLUDED.oldest_date");
      expect(sql).toContain("last_updated = NOW()");
    });

    it("uses NOW() for last_updated on both insert and update", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await upsertBackfillStatus("EUR", "fiat", new Date("2021-06-15"));

      const [sql] = mockQuery.mock.calls[0];
      // NOW() appears in both VALUES and the UPDATE SET clause
      const nowMatches = sql.match(/NOW\(\)/g);
      expect(nowMatches).toHaveLength(2);
    });

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValue(new Error("disk full"));

      await expect(
        upsertBackfillStatus("BTC", "crypto", new Date("2024-01-01"))
      ).rejects.toThrow("disk full");
    });
  });
});
