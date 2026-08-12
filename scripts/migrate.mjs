#!/usr/bin/env node
/**
 * ONLY HORSES · migration runner
 *
 * Applies db/migrations/*.sql in filename order inside a transaction each,
 * recording every applied file in `schema_migrations` with its checksum. A
 * file that changes after being applied is a hard error — migrations are
 * append-only (§24: "migrations reproducible from scratch").
 *
 *   node scripts/migrate.mjs           apply pending migrations
 *   node scripts/migrate.mjs --seed    apply, then load db/seed.sql
 *   node scripts/migrate.mjs --reset   drop and recreate the schema first
 *   node scripts/migrate.mjs --status  list applied / pending, apply nothing
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'db', 'migrations');
const SEED_FILE = join(ROOT, 'db', 'seed.sql');

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const SEED = args.has('--seed') || RESET;
const STATUS_ONLY = args.has('--status');

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/only_horses';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
      return { name, sql, checksum: sha256(sql) };
    });
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    if (RESET) {
      console.log('· resetting schemas public + auth');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
      await client.query('CREATE SCHEMA public');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        duration_ms INTEGER
      )
    `);

    const { rows } = await client.query('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));
    const files = migrationFiles();

    if (STATUS_ONLY) {
      for (const f of files) {
        const state = !applied.has(f.name)
          ? 'pending'
          : applied.get(f.name) === f.checksum
            ? 'applied'
            : 'CHANGED';
        console.log(`${state.padEnd(8)} ${f.name}`);
      }
      return;
    }

    let count = 0;
    for (const file of files) {
      const previous = applied.get(file.name);

      if (previous === file.checksum) continue;

      if (previous && previous !== file.checksum) {
        throw new Error(
          `${file.name} changed after it was applied. Migrations are append-only — ` +
            `add a new file instead of editing this one.`,
        );
      }

      const startedAt = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum, duration_ms) VALUES ($1, $2, $3)',
          [file.name, file.checksum, Date.now() - startedAt],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${file.name} failed: ${error.message}`);
      }
      console.log(`✓ ${file.name} (${Date.now() - startedAt} ms)`);
      count += 1;
    }

    console.log(count === 0 ? '· schema already up to date' : `· applied ${count} migration(s)`);

    if (SEED) {
      const startedAt = Date.now();
      await client.query(readFileSync(SEED_FILE, 'utf8'));
      console.log(`✓ seed.sql (${Date.now() - startedAt} ms)`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
