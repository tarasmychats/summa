import { query } from "../db.js";

export interface UserSettingsRow {
  id: string;
  userId: string;
  displayCurrency: string;
  isPremium: boolean;
}

export async function getOrCreateSettings(userId: string): Promise<UserSettingsRow> {
  const existing = await query(
    `SELECT id, user_id, display_currency, is_premium FROM user_settings WHERE user_id = $1`,
    [userId]
  );

  if (existing.rows.length > 0) {
    return mapRow(existing.rows[0]);
  }

  const created = await query(
    `INSERT INTO user_settings (user_id) VALUES ($1) RETURNING id, user_id, display_currency, is_premium`,
    [userId]
  );
  return mapRow(created.rows[0]);
}

export async function updateSettings(
  userId: string,
  updates: { displayCurrency?: string; isPremium?: boolean }
): Promise<UserSettingsRow> {
  const sets: string[] = [];
  const params: (string | boolean)[] = [];
  let paramIndex = 1;

  if (updates.displayCurrency !== undefined) {
    sets.push(`display_currency = $${paramIndex++}`);
    params.push(updates.displayCurrency);
  }
  if (updates.isPremium !== undefined) {
    sets.push(`is_premium = $${paramIndex++}`);
    params.push(updates.isPremium);
  }
  sets.push(`updated_at = NOW()`);
  params.push(userId);

  const result = await query(
    `UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = $${paramIndex} RETURNING id, user_id, display_currency, is_premium`,
    params
  );
  return mapRow(result.rows[0]);
}

function mapRow(row: any): UserSettingsRow {
  return {
    id: row.id,
    userId: row.user_id,
    displayCurrency: row.display_currency,
    isPremium: row.is_premium,
  };
}
