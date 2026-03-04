import pg from "pg";
import { logger } from "./logger.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    pool = new Pool(
      connectionString
        ? { connectionString }
        : {
            host: process.env.PGHOST || "localhost",
            port: Number(process.env.PGPORT) || 5432,
            user: process.env.PGUSER || "wealthtrack",
            password: process.env.PGPASSWORD || "wealthtrack",
            database: process.env.PGDATABASE || "wealthtrack",
          }
    );
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS tracked_assets (
      id SERIAL PRIMARY KEY,
      asset_id VARCHAR(100) NOT NULL,
      category VARCHAR(20) NOT NULL,
      first_seen TIMESTAMP DEFAULT NOW(),
      UNIQUE(asset_id, category)
    )
  `);

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
    CREATE INDEX IF NOT EXISTS idx_daily_prices_lookup
    ON daily_prices(asset_id, category, date)
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
  pool = null;
}
