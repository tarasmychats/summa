import { getPool } from "../db.js";

export interface TrackedAsset {
  assetId: string;
  category: string;
  firstSeen?: Date;
}

/**
 * Batch upsert tracked assets. Uses ON CONFLICT DO NOTHING so duplicates are silently ignored.
 */
export async function upsertTrackedAssets(
  assets: Array<{ assetId: string; category: string }>
): Promise<void> {
  if (assets.length === 0) return;

  const pool = getPool();

  // Build a parameterized VALUES list: ($1, $2), ($3, $4), ...
  const values: string[] = [];
  const params: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const offset = i * 2;
    values.push(`($${offset + 1}, $${offset + 2})`);
    params.push(assets[i].assetId, assets[i].category);
  }

  await pool.query(
    `INSERT INTO tracked_assets (asset_id, category)
     VALUES ${values.join(", ")}
     ON CONFLICT (asset_id, category) DO NOTHING`,
    params
  );
}

/**
 * Returns all tracked assets grouped by category.
 */
export async function getAllTrackedAssets(): Promise<
  Record<string, TrackedAsset[]>
> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT asset_id, category, first_seen FROM tracked_assets ORDER BY category, asset_id`
  );

  const grouped: Record<string, TrackedAsset[]> = {};
  for (const row of result.rows) {
    const category = row.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push({
      assetId: row.asset_id,
      category: row.category,
      firstSeen: row.first_seen,
    });
  }

  return grouped;
}
