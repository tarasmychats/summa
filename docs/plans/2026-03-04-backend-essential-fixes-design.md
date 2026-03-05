# Backend Essential Fixes — Design

**Date:** 2026-03-04
**Scope:** Centralized config, global error handler, graceful shutdown

## Context

Code audit revealed three structural improvements needed in the backend. The codebase is high quality (9/10) — these fixes address the remaining gaps without changing any behavior.

## Fix 1: Centralized Environment Config

**Problem:** 10 env vars read via `process.env` across 6 files. No single place to see what the app needs. No startup validation.

**Solution:** New `backend/src/config.ts` that reads all env vars once and exports a typed config object.

```typescript
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

- `parseLogLevel()` validates against allowed values (replaces unsafe `as LogLevel` cast)
- All other files import from `config` instead of reading `process.env` directly
- No new dependencies

**Files changed:** `config.ts` (new), `db.ts`, `logger.ts`, `crypto.ts`, `cryptoSearch.ts`, `cryptoHistory.ts`, `fiat.ts`, `fiatSearch.ts`

## Fix 2: Global Express Error Handler

**Problem:** No safety net for unhandled errors. Each route has its own try-catch, but middleware errors or future routes without try-catch would crash.

**Solution:** Add standard Express error middleware as last middleware in `index.ts`:

```typescript
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("unhandled route error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});
```

Existing per-route error handling stays in place. This is a safety net.

**Files changed:** `index.ts`

## Fix 3: Graceful Shutdown

**Problem:** No SIGTERM/SIGINT handlers. Container restarts or Ctrl+C can leak DB connections.

**Solution:** Signal handlers in `index.ts`:

```typescript
const server = app.listen(PORT, () => { ... });

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
```

**Files changed:** `index.ts`

## Files Changed Summary

| File | Change |
|------|--------|
| `config.ts` | **NEW** — centralized env config |
| `index.ts` | Import config, add error handler, add shutdown handlers |
| `db.ts` | Use `config.db.*` instead of `process.env.*` |
| `logger.ts` | Use `config.logLevel` instead of `process.env.LOG_LEVEL` |
| `crypto.ts` | Use `config.coingeckoApiKey` |
| `cryptoSearch.ts` | Use `config.coingeckoApiKey` |
| `cryptoHistory.ts` | Use `config.coingeckoApiKey` |
| `fiat.ts` | Use `config.exchangerateApiKey` |
| `fiatSearch.ts` | Use `config.exchangerateApiKey` |

## Non-goals

- No new dependencies (no zod, envalid)
- No ORM migration (raw SQL is appropriate for 3 tables)
- No behavior changes — all existing functionality preserved
- No `.env.example` updates (could be done separately)
