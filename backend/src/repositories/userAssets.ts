import { query } from "../db.js";

export interface UserAssetRow {
  id: string;
  userId: string;
  name: string;
  symbol: string;
  ticker: string;
  category: string;
  amount: number;
  currentAmount: number;
  createdAt: Date;
}

export interface CreateAssetInput {
  name: string;
  symbol: string;
  ticker: string;
  category: string;
  amount: number;
}

export async function getUserAssets(userId: string): Promise<UserAssetRow[]> {
  const result = await query(
    `SELECT
      a.id, a.user_id, a.name, a.symbol, a.ticker, a.category, a.amount, a.created_at,
      a.amount + COALESCE(
        (SELECT SUM(t.amount) FROM user_transactions t WHERE t.asset_id = a.id),
        0
      ) AS current_amount
    FROM user_assets a
    WHERE a.user_id = $1
    ORDER BY a.created_at ASC`,
    [userId]
  );
  return result.rows.map(mapRow);
}

export async function createAsset(userId: string, input: CreateAssetInput): Promise<UserAssetRow> {
  const result = await query(
    `INSERT INTO user_assets (user_id, name, symbol, ticker, category, amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, name, symbol, ticker, category, amount, amount AS current_amount, created_at`,
    [userId, input.name, input.symbol, input.ticker, input.category, input.amount]
  );
  return mapRow(result.rows[0]);
}

export async function updateAsset(
  userId: string,
  assetId: string,
  updates: { name?: string; amount?: number }
): Promise<UserAssetRow | null> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }
  if (updates.amount !== undefined) {
    sets.push(`amount = $${paramIndex++}`);
    params.push(updates.amount);
  }
  if (sets.length === 0) return null;

  sets.push(`updated_at = NOW()`);
  params.push(userId, assetId);

  const result = await query(
    `UPDATE user_assets SET ${sets.join(", ")}
     WHERE user_id = $${paramIndex} AND id = $${paramIndex + 1}
     RETURNING id, user_id, name, symbol, ticker, category, amount, amount AS current_amount, created_at`,
    params
  );
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

export async function deleteAsset(userId: string, assetId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM user_assets WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, assetId]
  );
  return result.rows.length > 0;
}

function mapRow(row: any): UserAssetRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    symbol: row.symbol,
    ticker: row.ticker,
    category: row.category,
    amount: parseFloat(row.amount),
    currentAmount: parseFloat(row.current_amount),
    createdAt: row.created_at,
  };
}
