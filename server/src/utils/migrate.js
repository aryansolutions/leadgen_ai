import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/database.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(currentDirectory, '../../../database/migrations');

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await fs.readdir(migrationDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const alreadyApplied = await client.query(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [file],
      );

      if (alreadyApplied.rowCount) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationDirectory, file), 'utf8');

      console.log(`Applying ${file}...`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    }

    console.log('Database migrations are up to date.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
