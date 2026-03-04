import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exports config with defaults when no env vars set", async () => {
    // Use empty strings instead of delete — dotenv re-injects from .env on
    // re-import, but `|| undefined` in config.ts normalises blanks to undefined.
    process.env.PORT = "";
    process.env.LOG_LEVEL = "";
    process.env.DATABASE_URL = "";
    process.env.PGHOST = "";
    process.env.PGPORT = "";
    process.env.PGUSER = "";
    process.env.PGPASSWORD = "";
    process.env.PGDATABASE = "";
    process.env.COINGECKO_API_KEY = "";
    process.env.EXCHANGERATE_API_KEY = "";

    const { config } = await import("../config.js");

    expect(config.port).toBe(3001);
    expect(config.logLevel).toBe("info");
    expect(config.db.connectionString).toBeUndefined();
    expect(config.db.host).toBe("localhost");
    expect(config.db.port).toBe(5432);
    expect(config.db.user).toBe("wealthtrack");
    expect(config.db.password).toBe("wealthtrack");
    expect(config.db.database).toBe("wealthtrack");
    expect(config.coingeckoApiKey).toBeUndefined();
    expect(config.exchangerateApiKey).toBeUndefined();
  });

  it("reads all env vars when set", async () => {
    process.env.PORT = "4000";
    process.env.LOG_LEVEL = "debug";
    process.env.DATABASE_URL = "postgresql://u:p@h:1234/d";
    process.env.PGHOST = "dbhost";
    process.env.PGPORT = "5433";
    process.env.PGUSER = "admin";
    process.env.PGPASSWORD = "secret";
    process.env.PGDATABASE = "mydb";
    process.env.COINGECKO_API_KEY = "cg-key";
    process.env.EXCHANGERATE_API_KEY = "er-key";

    const { config } = await import("../config.js");

    expect(config.port).toBe(4000);
    expect(config.logLevel).toBe("debug");
    expect(config.db.connectionString).toBe("postgresql://u:p@h:1234/d");
    expect(config.db.host).toBe("dbhost");
    expect(config.db.port).toBe(5433);
    expect(config.db.user).toBe("admin");
    expect(config.db.password).toBe("secret");
    expect(config.db.database).toBe("mydb");
    expect(config.coingeckoApiKey).toBe("cg-key");
    expect(config.exchangerateApiKey).toBe("er-key");
  });

  it("defaults invalid LOG_LEVEL to info", async () => {
    process.env.LOG_LEVEL = "verbose";
    const { config } = await import("../config.js");
    expect(config.logLevel).toBe("info");
  });

  it("accepts all valid log levels", async () => {
    for (const level of ["debug", "info", "warn", "error"]) {
      vi.resetModules();
      process.env.LOG_LEVEL = level;
      const { config } = await import("../config.js");
      expect(config.logLevel).toBe(level);
    }
  });
});
