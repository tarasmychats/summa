import { getPool } from "../db.js";
import type { SearchResult } from "../types.js";

export interface AssetSeed {
  id: string;
  category: string;
  name: string;
  symbol: string;
}

/**
 * Batch insert assets from seed data. ON CONFLICT DO NOTHING makes this idempotent.
 */
export async function seedAssets(assets: AssetSeed[]): Promise<void> {
  if (assets.length === 0) return;

  const pool = getPool();

  const values: string[] = [];
  const params: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const offset = i * 4;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
    );
    params.push(assets[i].id, assets[i].category, assets[i].name, assets[i].symbol);
  }

  await pool.query(
    `INSERT INTO assets (id, category, name, symbol)
     VALUES ${values.join(", ")}
     ON CONFLICT (id, category) DO NOTHING`,
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
    `SELECT id, category FROM assets ORDER BY category, id`
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
    WHERE (name ILIKE $1 OR symbol ILIKE $1 OR id ILIKE $1)
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
