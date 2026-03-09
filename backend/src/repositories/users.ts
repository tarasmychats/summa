import { getPool } from "../db.js";

export async function createAnonymousUser(): Promise<string> {
  const result = await getPool().query(
    `INSERT INTO users (auth_type) VALUES ('anonymous') RETURNING id`,
    []
  );
  return result.rows[0].id;
}

export async function findOrCreateAppleUser(
  appleUserId: string
): Promise<{ userId: string; created: boolean }> {
  const pool = getPool();

  const existing = await pool.query(
    `SELECT id, auth_type FROM users WHERE apple_user_id = $1`,
    [appleUserId]
  );

  if (existing.rows.length > 0) {
    return { userId: existing.rows[0].id, created: false };
  }

  const result = await pool.query(
    `INSERT INTO users (apple_user_id, auth_type) VALUES ($1, 'apple') RETURNING id`,
    [appleUserId]
  );
  return { userId: result.rows[0].id, created: true };
}

export async function mergeAnonymousIntoApple(
  anonymousUserId: string,
  appleUserId: string
): Promise<void> {
  const pool = getPool();

  await pool.query(
    `UPDATE user_transactions SET user_id = $1 WHERE user_id = $2`,
    [appleUserId, anonymousUserId]
  );
  await pool.query(
    `UPDATE user_assets SET user_id = $1 WHERE user_id = $2`,
    [appleUserId, anonymousUserId]
  );
  await pool.query(
    `DELETE FROM user_settings WHERE user_id = $1`,
    [anonymousUserId]
  );
  await pool.query(
    `DELETE FROM users WHERE id = $1`,
    [anonymousUserId]
  );
}

export async function deleteUser(userId: string): Promise<void> {
  await getPool().query(`DELETE FROM users WHERE id = $1`, [userId]);
}
