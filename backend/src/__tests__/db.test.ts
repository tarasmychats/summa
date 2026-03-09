import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockEnd, MockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const MockPool = vi.fn(() => ({ query: mockQuery, end: mockEnd }));
  return { mockQuery, mockEnd, MockPool };
});

vi.mock("pg", () => ({ default: { Pool: MockPool } }));

const mockConfig = vi.hoisted(() => ({
  db: {
    connectionString: undefined as string | undefined,
    host: "localhost",
    port: 5432,
    user: "wealthtrack",
    password: "wealthtrack",
    database: "wealthtrack",
  },
}));

vi.mock("../config.js", () => ({ config: mockConfig }));

import { getPool, initDb, closePool, resetPool } from "../db.js";

describe("db", () => {
  beforeEach(() => {
    resetPool();
    vi.clearAllMocks();
    mockConfig.db = {
      connectionString: undefined,
      host: "localhost",
      port: 5432,
      user: "wealthtrack",
      password: "wealthtrack",
      database: "wealthtrack",
    };
  });

  describe("getPool", () => {
    it("creates a pool with connectionString when set", () => {
      mockConfig.db.connectionString = "postgresql://user:pass@host:5432/db";
      const pool = getPool();
      expect(MockPool).toHaveBeenCalledWith({
        connectionString: "postgresql://user:pass@host:5432/db",
      });
      expect(pool).toBeDefined();
    });

    it("creates a pool with individual config when connectionString not set", () => {
      mockConfig.db.host = "myhost";
      mockConfig.db.port = 5433;
      mockConfig.db.user = "myuser";
      mockConfig.db.password = "mypass";
      mockConfig.db.database = "mydb";

      getPool();

      expect(MockPool).toHaveBeenCalledWith({
        host: "myhost",
        port: 5433,
        user: "myuser",
        password: "mypass",
        database: "mydb",
      });
    });

    it("returns the same pool on subsequent calls", () => {
      const pool1 = getPool();
      const pool2 = getPool();
      expect(pool1).toBe(pool2);
      expect(MockPool).toHaveBeenCalledTimes(1);
    });
  });

  describe("initDb", () => {
    it("creates assets table and drops legacy tracked_assets", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await initDb();
      expect(mockQuery).toHaveBeenCalledTimes(10);
      const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
      expect(calls[0]).toContain("assets");
      expect(calls[1]).toContain("ADD COLUMN IF NOT EXISTS enabled");
      expect(calls[2]).toContain("DROP TABLE IF EXISTS tracked_assets");
      expect(calls[3]).toContain("daily_prices");
      expect(calls[4]).toContain("backfill_status");
      expect(calls[5]).toContain("users");
      expect(calls[6]).toContain("user_settings");
      expect(calls[7]).toContain("user_assets");
      expect(calls[8]).toContain("DROP COLUMN IF EXISTS amount");
      expect(calls[9]).toContain("user_transactions");
    });

    it("is idempotent (uses IF NOT EXISTS)", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await initDb();
      await initDb();
      expect(mockQuery).toHaveBeenCalledTimes(20);
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
