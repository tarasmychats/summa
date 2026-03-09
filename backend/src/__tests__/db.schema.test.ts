import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockEnd, MockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const MockPool = vi.fn(() => ({ query: mockQuery, end: mockEnd }));
  return { mockQuery, mockEnd, MockPool };
});

vi.mock("pg", () => ({ default: { Pool: MockPool } }));

vi.mock("../config.js", () => ({
  config: {
    db: {
      connectionString: undefined,
      host: "localhost",
      port: 5432,
      user: "wealthtrack",
      password: "wealthtrack",
      database: "wealthtrack",
    },
  },
}));

import { initDb, resetPool } from "../db.js";

describe("db schema — user tables", () => {
  beforeEach(() => {
    resetPool();
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it("creates users table", async () => {
    await initDb();
    const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
    const usersCall = calls.find(
      (sql: string) => sql.includes("CREATE TABLE IF NOT EXISTS users")
    );
    expect(usersCall).toBeDefined();
    expect(usersCall).toContain("apple_user_id VARCHAR UNIQUE");
    expect(usersCall).toContain("auth_type VARCHAR NOT NULL");
    expect(usersCall).toContain("id UUID PRIMARY KEY DEFAULT gen_random_uuid()");
  });

  it("creates user_settings table", async () => {
    await initDb();
    const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
    const settingsCall = calls.find(
      (sql: string) => sql.includes("CREATE TABLE IF NOT EXISTS user_settings")
    );
    expect(settingsCall).toBeDefined();
    expect(settingsCall).toContain("user_id UUID REFERENCES users(id) ON DELETE CASCADE");
    expect(settingsCall).toContain("display_currency VARCHAR DEFAULT 'USD'");
    expect(settingsCall).toContain("is_premium BOOLEAN DEFAULT false");
    expect(settingsCall).toContain("UNIQUE(user_id)");
  });

  it("creates user_assets table", async () => {
    await initDb();
    const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
    const assetsCall = calls.find(
      (sql: string) => sql.includes("CREATE TABLE IF NOT EXISTS user_assets")
    );
    expect(assetsCall).toBeDefined();
    expect(assetsCall).toContain("user_id UUID REFERENCES users(id) ON DELETE CASCADE");
    expect(assetsCall).toContain("name VARCHAR NOT NULL");
    expect(assetsCall).toContain("symbol VARCHAR NOT NULL");
    expect(assetsCall).toContain("ticker VARCHAR NOT NULL");
    expect(assetsCall).toContain("category VARCHAR NOT NULL");
    expect(assetsCall).not.toContain("amount");
  });

  it("creates user_transactions table", async () => {
    await initDb();
    const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
    const txCall = calls.find(
      (sql: string) => sql.includes("CREATE TABLE IF NOT EXISTS user_transactions")
    );
    expect(txCall).toBeDefined();
    expect(txCall).toContain("user_id UUID REFERENCES users(id) ON DELETE CASCADE");
    expect(txCall).toContain("asset_id UUID REFERENCES user_assets(id) ON DELETE CASCADE");
    expect(txCall).toContain("type VARCHAR NOT NULL");
    expect(txCall).toContain("amount DOUBLE PRECISION NOT NULL");
    expect(txCall).toContain("note TEXT");
    expect(txCall).toContain("date TIMESTAMP NOT NULL");
  });

  it("creates user tables after existing tables", async () => {
    await initDb();
    const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
    const backfillIdx = calls.findIndex(
      (sql: string) => sql.includes("backfill_status")
    );
    const usersIdx = calls.findIndex(
      (sql: string) => sql.includes("CREATE TABLE IF NOT EXISTS users")
    );
    expect(usersIdx).toBeGreaterThan(backfillIdx);
  });
});
