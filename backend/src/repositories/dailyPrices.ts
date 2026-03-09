import { getPool } from "../db.js";
import type { Resolution } from "../config/historyResolution.js";

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

const PRICE_COLUMNS: Record<string, string> = { usd: "price_usd", eur: "price_eur" };

/**
 * Batch insert daily prices. Uses ON CONFLICT DO UPDATE so newer fetches
 * overwrite stale prices for the same (asset_id, category, date).
 */
export async function insertDailyPrices(
  prices: DailyPriceInput[]
): Promise<void> {
  if (prices.length === 0) return;

  // Deduplicate by (assetId, category, date) — keep the last entry for each key.
  // PostgreSQL rejects INSERT...ON CONFLICT when the same key appears twice in one batch.
  const seen = new Map<string, DailyPriceInput>();
  for (const p of prices) {
    seen.set(`${p.assetId}|${p.category}|${p.date}`, p);
  }
  const dedupedPrices = Array.from(seen.values());

  const pool = getPool();

  // Build parameterized VALUES: ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10), ...
  const values: string[] = [];
  const params: (string | number | null)[] = [];
  for (let i = 0; i < dedupedPrices.length; i++) {
    const offset = i * 5;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
    );
    params.push(
      dedupedPrices[i].assetId,
      dedupedPrices[i].category,
      dedupedPrices[i].date,
      dedupedPrices[i].priceUsd,
      dedupedPrices[i].priceEur
    );
  }

  await pool.query(
    `INSERT INTO daily_prices (asset_id, category, date, price_usd, price_eur)
     VALUES ${values.join(", ")}
     ON CONFLICT (asset_id, category, date)
     DO UPDATE SET price_usd = COALESCE(EXCLUDED.price_usd, daily_prices.price_usd),
                   price_eur = COALESCE(EXCLUDED.price_eur, daily_prices.price_eur)`,
    params
  );
}

/**
 * Builds a composite key for uniquely identifying an asset across categories.
 * Prevents data merging when the same ID exists in different categories.
 */
export function assetKey(assetId: string, category: string): string {
  return `${assetId}:${category}`;
}

/**
 * Get daily prices for multiple assets at once, grouped by composite key (assetId:category).
 * Uses composite keys to prevent data merging when the same ID exists across categories.
 */
export async function getMultiAssetPrices(
  assets: Array<{ assetId: string; category: string }>,
  from: string,
  to: string,
  currency: "usd" | "eur"
): Promise<Record<string, DailyPrice[]>> {
  if (assets.length === 0) return {};

  const pool = getPool();
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
    `SELECT asset_id, category, date, ${priceColumn} AS price
     FROM daily_prices
     WHERE (${conditions.join(" OR ")}) AND date >= $${dateFromIdx} AND date <= $${dateToIdx}
       AND ${priceColumn} IS NOT NULL
     ORDER BY asset_id, category, date`,
    params
  );

  // Initialize result with empty arrays for all requested assets, keyed by assetId:category
  const grouped: Record<string, DailyPrice[]> = {};
  for (const asset of assets) {
    grouped[assetKey(asset.assetId, asset.category)] = [];
  }

  for (const row of result.rows) {
    const key = assetKey(row.asset_id, row.category);
    grouped[key]?.push({
      date: typeof row.date === "string" ? row.date : row.date.toISOString().split("T")[0],
      price: Number(row.price),
    });
  }

  return grouped;
}

const TRUNC_EXPR: Record<Exclude<Resolution, "daily">, string> = {
  "3day": "floor((extract(epoch from date) - extract(epoch from date_trunc('year', date))) / (3 * 86400))",
  weekly: "date_trunc('week', date)",
  monthly: "date_trunc('month', date)",
};

/**
 * Get daily prices with optional aggregation.
 * For 'daily' resolution, behaves identically to getMultiAssetPrices.
 * For other resolutions, returns the last price per interval bucket
 * using DISTINCT ON.
 */
export async function getMultiAssetPricesAggregated(
  assets: Array<{ assetId: string; category: string }>,
  from: string,
  to: string,
  currency: "usd" | "eur",
  resolution: Resolution
): Promise<Record<string, DailyPrice[]>> {
  if (resolution === "daily") {
    return getMultiAssetPrices(assets, from, to, currency);
  }

  if (assets.length === 0) return {};

  const pool = getPool();
  const priceColumn = PRICE_COLUMNS[currency];
  if (!priceColumn) throw new Error(`Invalid currency: ${currency}`);

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

  const bucket = TRUNC_EXPR[resolution];

  const result = await pool.query(
    `SELECT DISTINCT ON (asset_id, category, ${bucket})
       asset_id, category, date, ${priceColumn} AS price
     FROM daily_prices
     WHERE (${conditions.join(" OR ")}) AND date >= $${dateFromIdx} AND date <= $${dateToIdx}
       AND ${priceColumn} IS NOT NULL
     ORDER BY asset_id, category, ${bucket}, date DESC`,
    params
  );

  const grouped: Record<string, DailyPrice[]> = {};
  for (const asset of assets) {
    grouped[assetKey(asset.assetId, asset.category)] = [];
  }

  for (const row of result.rows) {
    const key = assetKey(row.asset_id, row.category);
    grouped[key]?.push({
      date: typeof row.date === "string" ? row.date : row.date.toISOString().split("T")[0],
      price: Number(row.price),
    });
  }

  return grouped;
}
