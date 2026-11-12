
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
    path: path.resolve(currentDirectory, '../.env'),
});

const { Client } = pg;

const organizationA = '04b44a64-d700-4ce4-81ed-02734c02efdc';
const organizationB = 'e2b58f5f-3e89-4786-9be8-f972b67d80f6';

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});
console.log('DATABASE_URL loaded:', Boolean(process.env.DATABASE_URL));
const databaseUrl = process.env.DATABASE_URL;

let connectionInfo = {};

try {
    const parsedUrl = new URL(databaseUrl);

    connectionInfo = {
        loaded: true,
        username: parsedUrl.username,
        passwordPresent: parsedUrl.password.length > 0,
        database: parsedUrl.pathname,
    };
} catch {
    connectionInfo = {
        loaded: false,
        validUrl: false,
    };
}

console.log('Database configuration:', connectionInfo);

try {
    await client.connect();

    console.log('Connected as:', (
        await client.query('SELECT current_user')
    ).rows[0].current_user);

    await client.query('BEGIN');

    await client.query(
        `SELECT set_config('app.current_organization_id', $1, true)`,
        [organizationA],
    );

    const insert = await client.query(
        `INSERT INTO webhook_events (
       organization_id, provider, provider_event_id, event_type, payload
     )
     VALUES ($1, 'rls_test', 'leadflow-test-001', 'test', '{"test":true}')
     RETURNING id`,
        [organizationA],
    );

    console.log('Organization A insert:', insert.rowCount);

    const visibleA = await client.query(
        `SELECT COUNT(*)::int AS count
     FROM webhook_events
     WHERE provider_event_id = 'leadflow-test-001'`,
    );

    console.log('Organization A sees:', visibleA.rows[0].count);

    await client.query(
        `SELECT set_config('app.current_organization_id', $1, true)`,
        [organizationB],
    );

    const visibleB = await client.query(
        `SELECT COUNT(*)::int AS count
     FROM webhook_events
     WHERE provider_event_id = 'leadflow-test-001'`,
    );

    console.log('Organization B sees:', visibleB.rows[0].count);

    await client.query('ROLLBACK');

    console.log('Test rolled back successfully.');
} catch (error) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('RLS test failed:', error.message);
    process.exitCode = 1;
} finally {
    await client.end();
}
