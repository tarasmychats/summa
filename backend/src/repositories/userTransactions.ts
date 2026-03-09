import { query } from "../db.js";

export interface UserTransactionRow {
  id: string;
  userId: string;
  assetId: string;
  type: string;
  amount: number;
  note: string | null;
  date: Date;
  createdAt: Date;
}

export interface CreateTransactionInput {
  type: string;
  amount: number;
  date: string;
  note?: string;
}

export async function getTransactions(userId: string, assetId: string): Promise<UserTransactionRow[]> {
  const result = await query(
    `SELECT id, user_id, asset_id, type, amount, note, date, created_at
     FROM user_transactions
     WHERE user_id = $1 AND asset_id = $2
     ORDER BY date ASC`,
    [userId, assetId]
  );
  return result.rows.map(mapRow);
}

export async function createTransaction(
  userId: string,
  assetId: string,
  input: CreateTransactionInput
): Promise<UserTransactionRow> {
  const result = await query(
    `INSERT INTO user_transactions (user_id, asset_id, type, amount, note, date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, asset_id, type, amount, note, date, created_at`,
    [userId, assetId, input.type, input.amount, input.note || null, input.date]
  );
  return mapRow(result.rows[0]);
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM user_transactions WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, transactionId]
  );
  return result.rows.length > 0;
}

function mapRow(row: any): UserTransactionRow {
  return {
    id: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    type: row.type,
    amount: parseFloat(row.amount),
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
  };
}
