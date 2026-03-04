import { getPool } from "../db.js";

export interface DailyPrice {
  date: string;
  price: number;
}

export interface DailyPriceInput {
  assetId: string;
  category: string;
  date: string;
  priceUsd: number | null;
  priceEur: number | null;
}

/**
 * Batch insert daily prices. Uses ON CONFLICT DO UPDATE so newer fetches
 * overwrite stale prices for the same (asset_id, category, date).
 */
export async function insertDailyPrices(
  prices: DailyPriceInput[]
): Promise<void> {
  if (prices.length === 0) return;

  const pool = getPool();

  // Build parameterized VALUES: ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10), ...
  const values: string[] = [];
  const params: (string | number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    const offset = i * 5;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
    );
    params.push(
      prices[i].assetId,
      prices[i].category,
      prices[i].date,
      prices[i].priceUsd,
      prices[i].priceEur
    );
  }

  await pool.query(
    `INSERT INTO daily_prices (asset_id, category, date, price_usd, price_eur)
     VALUES ${values.join(", ")}
     ON CONFLICT (asset_id, category, date)
     DO UPDATE SET price_usd = EXCLUDED.price_usd, price_eur = EXCLUDED.price_eur`,
    params
  );
}

/**
 * Get daily prices for a single asset within a date range.
 * Currency selects which price column to return.
 */
export async function getDailyPrices(
  assetId: string,
  category: string,
  from: string,
  to: string,
  currency: "usd" | "eur"
): Promise<DailyPrice[]> {
  const pool = getPool();
  const PRICE_COLUMNS: Record<string, string> = { usd: "price_usd", eur: "price_eur" };
  const priceColumn = PRICE_COLUMNS[currency];
  if (!priceColumn) throw new Error(`Invalid currency: ${currency}`);

  const result = await pool.query(
    `SELECT date, ${priceColumn} AS price
     FROM daily_prices
     WHERE asset_id = $1 AND category = $2 AND date >= $3 AND date <= $4
     ORDER BY date`,
    [assetId, category, from, to]
  );

  return result.rows.map((row: { date: Date | string; price: string }) => ({
    date: typeof row.date === "string" ? row.date : row.date.toISOString().split("T")[0],
    price: Number(row.price),
  }));
}

/**
 * Get daily prices for multiple assets at once, grouped by asset ID.
 */
export async function getMultiAssetPrices(
  assets: Array<{ assetId: string; category: string }>,
  from: string,
  to: string,
  currency: "usd" | "eur"
): Promise<Record<string, DailyPrice[]>> {
  if (assets.length === 0) return {};

  const pool = getPool();
  const PRICE_COLUMNS: Record<string, string> = { usd: "price_usd", eur: "price_eur" };
  const priceColumn = PRICE_COLUMNS[currency];
  if (!priceColumn) throw new Error(`Invalid currency: ${currency}`);

  // Build WHERE clause: (asset_id = $1 AND category = $2) OR (asset_id = $3 AND category = $4) ...
  const conditions: string[] = [];
  const params: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const offset = i * 2;
    conditions.push(
      `(asset_id = $${offset + 1} AND category = $${offset + 2})`
    );
    params.push(assets[i].assetId, assets[i].category);
  }

  const dateFromIdx = params.length + 1;
  const dateToIdx = params.length + 2;
  params.push(from, to);

  const result = await pool.query(
    `SELECT asset_id, date, ${priceColumn} AS price
     FROM daily_prices
     WHERE (${conditions.join(" OR ")}) AND date >= $${dateFromIdx} AND date <= $${dateToIdx}
     ORDER BY asset_id, date`,
    params
  );

  // Initialize result with empty arrays for all requested assets
  const grouped: Record<string, DailyPrice[]> = {};
  for (const asset of assets) {
    grouped[asset.assetId] = [];
  }

  for (const row of result.rows) {
    const assetId = row.asset_id;
    grouped[assetId]?.push({
      date: typeof row.date === "string" ? row.date : row.date.toISOString().split("T")[0],
      price: Number(row.price),
    });
  }

  return grouped;
}
