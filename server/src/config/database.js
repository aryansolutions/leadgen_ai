import pg from 'pg';
import fs from 'node:fs';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === 'production' ? 10 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: env.DATABASE_SSL
    ? {
        rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
        ...(env.DATABASE_SSL_CA_PATH
          ? { ca: fs.readFileSync(env.DATABASE_SSL_CA_PATH, 'utf8') }
          : {}),
      }
    : false,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export async function query(text, values = []) {
  return pool.query(text, values);
}

/**
 * Run tenant-scoped SQL inside a transaction.
 * RLS context is transaction-local, so it cannot leak between pooled requests.
 */
export async function tenantQuery(organizationId, userId, callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT
        set_config('app.current_organization_id', $1, true),
        set_config('app.current_user_id', $2, true)`,
      [organizationId, userId],
    );

    const result = await callback(client);
    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
