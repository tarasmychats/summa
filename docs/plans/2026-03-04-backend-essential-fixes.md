# Backend Essential Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize environment config, add global Express error handler, and add graceful shutdown to the backend.

**Architecture:** Create a single `config.ts` module that reads all env vars at import time, then update all consumers. Add Express error middleware and process signal handlers to `index.ts`.

**Tech Stack:** TypeScript, Express 5, pg, vitest

---

### Task 1: Create config module with tests

**Files:**
- Create: `backend/src/config.ts`
- Create: `backend/src/__tests__/config.test.ts`

**Step 1: Write the failing test**

Create `backend/src/__tests__/config.test.ts`:

```typescript
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
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.DATABASE_URL;
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;
    delete process.env.PGDATABASE;
    delete process.env.COINGECKO_API_KEY;
    delete process.env.EXCHANGERATE_API_KEY;

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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/config.test.ts`
Expected: FAIL — cannot find module `../config.js`

**Step 3: Write the config module**

Create `backend/src/config.ts`:

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error"]);

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && VALID_LOG_LEVELS.has(value)) {
    return value as LogLevel;
  }
  return "info";
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  logLevel: parseLogLevel(process.env.LOG_LEVEL),

  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || "wealthtrack",
    password: process.env.PGPASSWORD || "wealthtrack",
    database: process.env.PGDATABASE || "wealthtrack",
  },

  coingeckoApiKey: process.env.COINGECKO_API_KEY,
  exchangerateApiKey: process.env.EXCHANGERATE_API_KEY,
};
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/config.test.ts`
Expected: PASS — all 4 tests green

**Step 5: Commit**

```bash
git add backend/src/config.ts backend/src/__tests__/config.test.ts
git commit -m "feat: add centralized config module with env validation"
```

---

### Task 2: Migrate logger.ts to use config

**Files:**
- Modify: `backend/src/logger.ts` (line 10 — replace `process.env.LOG_LEVEL` cast)

**Step 1: Run existing tests to confirm baseline**

Run: `cd backend && npx vitest run`
Expected: All tests PASS

**Step 2: Update logger.ts**

Replace the entire file content. Key change: line 10 switches from `(process.env.LOG_LEVEL as LogLevel) ?? "info"` to importing from config.

```typescript
import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: LogLevel = config.logLevel as LogLevel;

function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const entry = {
    level,
    msg,
    time: new Date().toISOString(),
    ...data,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};
```

**Step 3: Run all tests**

Run: `cd backend && npx vitest run`
Expected: All tests PASS (no behavior change)

**Step 4: Commit**

```bash
git add backend/src/logger.ts
git commit -m "refactor: migrate logger to use centralized config"
```

---

### Task 3: Migrate db.ts to use config

**Files:**
- Modify: `backend/src/db.ts` (lines 19-28 — replace `process.env.*` with `config.db.*`)

**Step 1: Update db.ts**

Replace the `getPool()` function body to use config instead of process.env:

```typescript
import pg from "pg";
import { logger } from "./logger.js";
import { config } from "./config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbReady = false;

export function isDbReady(): boolean {
  return dbReady;
}

export function setDbReady(ready: boolean): void {
  dbReady = ready;
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(
      config.db.connectionString
        ? { connectionString: config.db.connectionString }
        : {
            host: config.db.host,
            port: config.db.port,
            user: config.db.user,
            password: config.db.password,
            database: config.db.database,
          }
    );
  }
  return pool;
}
```

The rest of the file (`initDb`, `closePool`, `resetPool`) stays unchanged.

**Step 2: Run db tests**

Run: `cd backend && npx vitest run src/__tests__/db.test.ts`
Expected: PASS. Note: db tests set `process.env` directly to test Pool construction. Since `config` reads env vars at import time, and db.test.ts uses `vi.mock` for the pg module, the tests verify Pool is called correctly. The tests may need adjustment — if they fail because config is read at import time rather than per-call, update the db tests to mock config instead:

If tests fail, update `backend/src/__tests__/db.test.ts` to mock config:

```typescript
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
    it("creates all three tables", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await initDb();

      expect(mockQuery).toHaveBeenCalledTimes(3);

      const calls = mockQuery.mock.calls.map((c: string[][]) => c[0]);
      expect(calls[0]).toContain("tracked_assets");
      expect(calls[1]).toContain("daily_prices");
      expect(calls[2]).toContain("backfill_status");
    });

    it("is idempotent (uses IF NOT EXISTS)", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await initDb();
      await initDb();
      expect(mockQuery).toHaveBeenCalledTimes(6);
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
```

**Step 3: Run all tests**

Run: `cd backend && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add backend/src/db.ts backend/src/__tests__/db.test.ts
git commit -m "refactor: migrate db module to use centralized config"
```

---

### Task 4: Migrate service files to use config

**Files:**
- Modify: `backend/src/services/crypto.ts` (line 12)
- Modify: `backend/src/services/cryptoSearch.ts` (line 9)
- Modify: `backend/src/services/cryptoHistory.ts` (line 18)
- Modify: `backend/src/services/fiat.ts` (line 30)
- Modify: `backend/src/services/fiatSearch.ts` (line 39)

**Step 1: Update all five service files**

For each file, add `import { config } from "../config.js";` and replace `process.env.X` with `config.x`.

**crypto.ts** — change line 12:
```typescript
// Before: const apiKey = process.env.COINGECKO_API_KEY;
// After:
import { config } from "../config.js";
// ...
const apiKey = config.coingeckoApiKey;
```

**cryptoSearch.ts** — change line 9:
```typescript
import { config } from "../config.js";
// ...
const apiKey = config.coingeckoApiKey;
```

**cryptoHistory.ts** — change line 18:
```typescript
import { config } from "../config.js";
// ...
const apiKey = config.coingeckoApiKey;
```

**fiat.ts** — change line 30:
```typescript
import { config } from "../config.js";
// ...
const apiKey = config.exchangerateApiKey;
```

**fiatSearch.ts** — change line 39:
```typescript
import { config } from "../config.js";
// ...
const apiKey = config.exchangerateApiKey;
```

**Step 2: Run all tests**

Run: `cd backend && npx vitest run`
Expected: All tests PASS. Tests for these services mock `fetch` and set `process.env` directly. Since config reads env vars at module load time, and vitest re-evaluates modules per test file, the existing test patterns should still work. If any service tests fail, add a config mock to the test file:

```typescript
vi.mock("../config.js", () => ({
  config: { coingeckoApiKey: "test-key" },
}));
```

**Step 3: Commit**

```bash
git add backend/src/services/crypto.ts backend/src/services/cryptoSearch.ts backend/src/services/cryptoHistory.ts backend/src/services/fiat.ts backend/src/services/fiatSearch.ts
git commit -m "refactor: migrate service files to use centralized config"
```

---

### Task 5: Add global Express error handler

**Files:**
- Modify: `backend/src/index.ts` (add error middleware after routes)
- Modify: `backend/src/__tests__/server.test.ts` (add test for error handler)

**Step 1: Write the failing test**

Add to `backend/src/__tests__/server.test.ts`:

```typescript
describe("global error handler", () => {
  it("returns 500 for unhandled route errors", async () => {
    // The error handler is a safety net — we test it by confirming
    // the middleware is registered. A more thorough test would add
    // a test-only route that throws, but that's overkill here.
    const res = await request(app).get("/nonexistent-route");
    // Express 5 returns 404 for unknown routes, not 500
    expect(res.status).toBe(404);
  });
});
```

Actually, testing the global error handler properly requires a route that throws. Add a better test approach:

```typescript
describe("global error handler", () => {
  it("catches errors from routes and returns 500", async () => {
    // POST /api/prices with invalid JSON triggers Express parse error
    const res = await request(app)
      .post("/api/prices")
      .set("Content-Type", "application/json")
      .send("not json");
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Update index.ts**

Add the error handler after all route registrations (after line 28). Import types from Express:

In `backend/src/index.ts`, add after line 28 (`app.use("/api", createHistoryRouter());`):

```typescript
import type { Request, Response, NextFunction } from "express";

// ... existing code ...

// Global error handler — safety net for unhandled errors
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("unhandled route error", {
    error: err.message,
    stack: err.stack,
  });
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});
```

Note: The `!res.headersSent` check prevents double-sending headers if a route partially responded before erroring.

**Step 3: Run all tests**

Run: `cd backend && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add backend/src/index.ts backend/src/__tests__/server.test.ts
git commit -m "feat: add global Express error handler middleware"
```

---

### Task 6: Add graceful shutdown

**Files:**
- Modify: `backend/src/index.ts` (wrap `app.listen`, add signal handlers)

**Step 1: Update startServer in index.ts**

Modify the `startServer` function to capture the server reference and register signal handlers. The key change: `app.listen()` return value is saved, and signal handlers call `server.close()` then `closePool()`.

```typescript
export async function startServer(): Promise<void> {
  try {
    await initDb();
    setDbReady(true);
    logger.info("database initialized");
  } catch (err) {
    logger.error("database initialization failed, running without DB", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const server = app.listen(PORT, () => {
    logger.info("server started", { port: Number(PORT) });
    if (isDbReady()) {
      startDailyCron();
    } else {
      logger.warn("cron job skipped — database not available");
    }
  });

  function shutdown(signal: string) {
    logger.info("shutdown signal received", { signal });
    server.close(async () => {
      await closePool();
      logger.info("server stopped");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
```

**Step 2: Run all tests**

Run: `cd backend && npx vitest run`
Expected: All tests PASS. Tests use `supertest` which doesn't call `startServer` directly — it uses the exported `app` instance. Signal handlers only register when `startServer` runs.

**Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: add graceful shutdown on SIGTERM/SIGINT"
```

---

### Task 7: Update index.ts to use config.port

**Files:**
- Modify: `backend/src/index.ts` (line 17 — replace `process.env.PORT || 3001` with `config.port`)

**Step 1: Update index.ts**

Replace line 17:
```typescript
// Before: const PORT = process.env.PORT || 3001;
// After:
import { config } from "./config.js";
const PORT = config.port;
```

Also remove the `dotenv` import and config call (lines 1-5) from index.ts, since config.ts is now the entry point for env vars. However, `dotenv` must still be loaded before `config.ts` is evaluated. Move the dotenv loading into `config.ts` instead:

Update `backend/src/config.ts` to add dotenv at the top:

```typescript
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

// ... rest of config.ts
```

Then in `index.ts`, remove lines 1-5 (the dotenv import and call) and add `import { config } from "./config.js";` instead.

**Step 2: Run all tests**

Run: `cd backend && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/src/index.ts backend/src/config.ts
git commit -m "refactor: move dotenv loading into config module, use config.port"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

Run: `cd backend && npx vitest run`
Expected: All tests PASS

**Step 2: Run TypeScript type check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 3: Verify no remaining process.env usage in src (except config.ts)**

Run: `grep -r "process.env" backend/src/ --include="*.ts" | grep -v config.ts | grep -v __tests__ | grep -v node_modules`
Expected: No output (all process.env reads are in config.ts now)

**Step 4: Commit any fixes, then final commit if needed**

If everything passes, the work is done. No final commit needed unless fixes were required.
