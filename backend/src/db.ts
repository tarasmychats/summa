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

export function query(text: string, params?: any[]): Promise<pg.QueryResult> {
  return getPool().query(text, params);
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
      enabled BOOLEAN NOT NULL DEFAULT true,
      PRIMARY KEY (id, category)
    )
  `);

  // Migration: add enabled column to assets table
  await db.query(`
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true
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

  if (config.resetUserData) {
    logger.warn("RESET_USER_DATA is set — dropping user tables");
    await db.query(`DROP TABLE IF EXISTS user_transactions`);
    await db.query(`DROP TABLE IF EXISTS user_assets`);
    await db.query(`DROP TABLE IF EXISTS user_settings`);
    await db.query(`DROP TABLE IF EXISTS users`);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      apple_user_id VARCHAR UNIQUE,
      auth_type VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      display_currency VARCHAR DEFAULT 'USD',
      is_premium BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR NOT NULL,
      symbol VARCHAR NOT NULL,
      ticker VARCHAR NOT NULL,
      category VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Migration: drop legacy amount column (initial amount now stored as a transaction)
  await db.query(`
    ALTER TABLE user_assets DROP COLUMN IF EXISTS amount
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      asset_id UUID REFERENCES user_assets(id) ON DELETE CASCADE,
      type VARCHAR NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      note TEXT,
      date TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
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
