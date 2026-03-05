import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";

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

export async function initDb(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id VARCHAR(100) NOT NULL,
      category VARCHAR(20) NOT NULL,
      name VARCHAR(200) NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      PRIMARY KEY (id, category)
    )
  `);

  // Drop legacy table (data now lives in seed file)
  await db.query(`DROP TABLE IF EXISTS tracked_assets`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_prices (
      id SERIAL PRIMARY KEY,
      asset_id VARCHAR(100) NOT NULL,
      category VARCHAR(20) NOT NULL,
      date DATE NOT NULL,
      price_usd DECIMAL(20, 8),
      price_eur DECIMAL(20, 8),
      UNIQUE(asset_id, category, date)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS backfill_status (
      asset_id VARCHAR(100) NOT NULL,
      category VARCHAR(20) NOT NULL,
      oldest_date DATE,
      last_updated TIMESTAMP,
      PRIMARY KEY(asset_id, category)
    )
  `);

  logger.info("database tables initialized");
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function resetPool(): void {
  if (pool) {
    try {
      const result = pool.end();
      if (result && typeof result.catch === "function") {
        result.catch(() => {}); // best-effort cleanup
      }
    } catch {
      // ignore cleanup errors
    }
  }
  pool = null;
}
