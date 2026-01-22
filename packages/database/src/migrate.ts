import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  database: process.env.DATABASE_NAME || 'democracy_os',
  user: process.env.DATABASE_USER || 'democracy',
  password: process.env.DATABASE_PASSWORD || 'democracy',
});

interface Migration {
  filename: string;
  sql: string;
}

async function createMigrationsTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Migrations table ready');
  } finally {
    client.release();
  }
}

async function getAppliedMigrations(): Promise<string[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ filename: string }>(
      'SELECT filename FROM migrations ORDER BY id'
    );
    return result.rows.map((row) => row.filename);
  } finally {
    client.release();
  }
}

async function getMigrationFiles(): Promise<Migration[]> {
  // When running from dist/, look in src/migrations for SQL files
  const migrationsDir = path.join(__dirname, '../src/migrations');

  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return files.map((filename) => ({
    filename,
    sql: fs.readFileSync(path.join(migrationsDir, filename), 'utf-8'),
  }));
}

async function applyMigration(migration: Migration) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Execute migration SQL
    await client.query(migration.sql);

    // Record migration
    await client.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      [migration.filename]
    );

    await client.query('COMMIT');
    console.log(`✓ Applied migration: ${migration.filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Failed to apply migration: ${migration.filename}`);
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  console.log('Starting database migrations...\n');

  try {
    await createMigrationsTable();

    const appliedMigrations = await getAppliedMigrations();
    const allMigrations = await getMigrationFiles();

    const pendingMigrations = allMigrations.filter(
      (migration) => !appliedMigrations.includes(migration.filename)
    );

    if (pendingMigrations.length === 0) {
      console.log('\n✓ Database is up to date. No migrations to apply.');
      return;
    }

    console.log(`\nFound ${pendingMigrations.length} pending migration(s):\n`);

    for (const migration of pendingMigrations) {
      await applyMigration(migration);
    }

    console.log('\n✓ All migrations completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
