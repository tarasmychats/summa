import { getPool } from "../db.js";
import type { SearchResult } from "../types.js";

export interface AssetSeed {
  id: string;
  category: string;
  name: string;
  symbol: string;
  enabled?: boolean;
}

/**
 * Batch insert assets from seed data. Updates name, symbol, and enabled on conflict.
 */
export async function seedAssets(assets: AssetSeed[]): Promise<void> {
  if (assets.length === 0) return;

  const pool = getPool();

  const values: string[] = [];
  const params: (string | boolean)[] = [];
  for (let i = 0; i < assets.length; i++) {
    const offset = i * 5;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
    );
    params.push(assets[i].id, assets[i].category, assets[i].name, assets[i].symbol, assets[i].enabled ?? false);
  }

  await pool.query(
    `INSERT INTO assets (id, category, name, symbol, enabled)
     VALUES ${values.join(", ")}
     ON CONFLICT (id, category) DO UPDATE SET
       name = EXCLUDED.name,
       symbol = EXCLUDED.symbol,
       enabled = EXCLUDED.enabled`,
    params
  );
}

/**
 * Returns all assets grouped by category (used by cron job).
 */
export async function getAllAssets(): Promise<
  Record<string, Array<{ assetId: string; category: string }>>
> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, category FROM assets WHERE enabled = true ORDER BY category, id`
  );

  const grouped: Record<string, Array<{ assetId: string; category: string }>> = {};
  for (const row of result.rows) {
    if (!grouped[row.category]) {
      grouped[row.category] = [];
    }
    grouped[row.category].push({ assetId: row.id, category: row.category });
  }
  return grouped;
}

/**
 * Search assets by name, symbol, or id. Returns results ordered by relevance.
 */
export async function searchAssets(
  query: string,
  category?: string
): Promise<SearchResult[]> {
  const pool = getPool();
  const pattern = `%${query}%`;
  const prefixPattern = `${query}%`;

  let sql = `
    SELECT id, category, name, symbol FROM assets
    WHERE enabled = true AND (name ILIKE $1 OR symbol ILIKE $1 OR id ILIKE $1)
  `;
  const params: string[] = [pattern, prefixPattern];

  if (category) {
    sql += ` AND category = $3`;
    params.push(category);
  }

  sql += `
    ORDER BY
      CASE WHEN symbol ILIKE $2 THEN 0 ELSE 1 END,
      CASE category WHEN 'fiat' THEN 0 WHEN 'stock' THEN 1 WHEN 'etf' THEN 2 WHEN 'crypto' THEN 3 END,
      name
    LIMIT 50
  `;

  const result = await pool.query(sql, params);
  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    category: row.category,
  }));
}

/**
 * Looks up the symbol for an asset by its ID and category.
 * Returns null if the asset is not found or disabled.
 */
export async function getAssetSymbol(
  assetId: string,
  category: string
): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT symbol FROM assets WHERE id = $1 AND category = $2 AND enabled = true`,
    [assetId, category]
  );
  return result.rows.length > 0 ? result.rows[0].symbol : null;
}

/**
 * Check if an asset is enabled. Used to block adding disabled assets.
 */
export async function isAssetEnabled(
  assetId: string,
  category: string
): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT 1 FROM assets WHERE id = $1 AND category = $2 AND enabled = true`,
    [assetId, category]
  );
  return result.rows.length > 0;
}
