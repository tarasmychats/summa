import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockEnd, MockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const MockPool = vi.fn(() => ({ query: mockQuery, end: mockEnd }));
  return { mockQuery, mockEnd, MockPool };
});

vi.mock("pg", () => ({ default: { Pool: MockPool } }));

import { getPool, initDb, closePool, resetPool } from "../db.js";

describe("db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPool();
  });

  describe("getPool", () => {
    it("creates a pool with DATABASE_URL when set", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
      const pool = getPool();
      expect(MockPool).toHaveBeenCalledWith({
        connectionString: "postgresql://user:pass@host:5432/db",
      });
      expect(pool).toBeDefined();
      delete process.env.DATABASE_URL;
    });

    it("creates a pool with individual PG vars when DATABASE_URL is not set", () => {
      delete process.env.DATABASE_URL;
      process.env.PGHOST = "myhost";
      process.env.PGPORT = "5433";
      process.env.PGUSER = "myuser";
      process.env.PGPASSWORD = "mypass";
      process.env.PGDATABASE = "mydb";

      getPool();

      expect(MockPool).toHaveBeenCalledWith({
        host: "myhost",
        port: 5433,
        user: "myuser",
        password: "mypass",
        database: "mydb",
      });

      delete process.env.PGHOST;
      delete process.env.PGPORT;
      delete process.env.PGUSER;
      delete process.env.PGPASSWORD;
      delete process.env.PGDATABASE;
    });

    it("returns the same pool on subsequent calls", () => {
      const pool1 = getPool();
      const pool2 = getPool();
      expect(pool1).toBe(pool2);
      expect(MockPool).toHaveBeenCalledTimes(1);
    });
  });

  describe("initDb", () => {
    it("creates all three tables and the index", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await initDb();

      expect(mockQuery).toHaveBeenCalledTimes(4);

      const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
      expect(calls[0]).toContain("tracked_assets");
      expect(calls[1]).toContain("daily_prices");
      expect(calls[2]).toContain("idx_daily_prices_lookup");
      expect(calls[3]).toContain("backfill_status");
    });

    it("is idempotent (uses IF NOT EXISTS)", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await initDb();
      await initDb();

      // All queries use IF NOT EXISTS, so calling twice works without error
      expect(mockQuery).toHaveBeenCalledTimes(8);
    });

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection refused"));

      await expect(initDb()).rejects.toThrow("connection refused");
    });
  });

  describe("closePool", () => {
    it("ends the pool connection", async () => {
      mockEnd.mockResolvedValue(undefined);
      getPool();
      await closePool();
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });

    it("does nothing if no pool exists", async () => {
      await closePool();
      expect(mockEnd).not.toHaveBeenCalled();
    });

    it("allows creating a new pool after close", async () => {
      getPool();
      await closePool();
      getPool();
      expect(MockPool).toHaveBeenCalledTimes(2);
    });
  });
});
