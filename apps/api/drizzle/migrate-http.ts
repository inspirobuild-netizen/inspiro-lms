import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

// Runs migrations over Neon's HTTP driver (port 443) instead of the raw
// Postgres wire protocol (5432) — for networks that block 5432. Writes the
// same drizzle.__drizzle_migrations tracking rows drizzle-kit uses, so future
// `pnpm db:migrate` runs (e.g. from the VPS) pick up where this left off.
async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL not set');

  const sql = neon(url);
  const dir = join(process.cwd(), 'drizzle', 'migrations');
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number }[];
  };

  await sql.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await sql.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`,
  );

  const rows = (await sql.query(
    'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  )) as { created_at: number }[];
  const lastApplied = rows.length ? Number(rows[0]!.created_at) : 0;

  for (const entry of journal.entries) {
    if (entry.when <= lastApplied) {
      console.log(`skip  ${entry.tag} (already applied)`);
      continue;
    }
    const file = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8');
    const hash = crypto.createHash('sha256').update(file).digest('hex');
    const statements = file
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`apply ${entry.tag} (${statements.length} statements)…`);
    for (const stmt of statements) await sql.query(stmt);

    await sql.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [
      hash,
      entry.when,
    ]);
  }

  console.log('Migrations applied.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
