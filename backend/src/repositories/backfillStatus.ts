import { getPool } from "../db.js";

export interface BackfillStatus {
  oldestDate: Date;
  lastUpdated: Date;
}

/**
 * Returns the backfill status for an asset, or null if it hasn't been backfilled yet.
 */
export async function getBackfillStatus(
  assetId: string,
  category: string
): Promise<BackfillStatus | null> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT oldest_date, last_updated FROM backfill_status WHERE asset_id = $1 AND category = $2`,
    [assetId, category]
  );

  if (result.rows.length === 0) return null;

  return {
    oldestDate: result.rows[0].oldest_date,
    lastUpdated: result.rows[0].last_updated,
  };
}

/**
 * Insert or update the backfill status for an asset.
 * Sets last_updated to NOW() on every call.
 */
export async function upsertBackfillStatus(
  assetId: string,
  category: string,
  oldestDate: Date
): Promise<void> {
  const pool = getPool();

  await pool.query(
    `INSERT INTO backfill_status (asset_id, category, oldest_date, last_updated)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (asset_id, category) DO UPDATE
     SET oldest_date = EXCLUDED.oldest_date, last_updated = NOW()`,
    [assetId, category, oldestDate]
  );
}
