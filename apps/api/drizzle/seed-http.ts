import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

// Seeds baseline users over Neon HTTP (443). Idempotent via ON CONFLICT.
async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = neon(url);

  const tables = (await sql.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
  )) as { n: number }[];
  console.log(`public tables present: ${tables[0]!.n}`);

  await sql.query(
    `INSERT INTO users (phone, email, name, role, target_exam)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (phone) DO NOTHING`,
    ['+919999999999', 'admin@inspiro.in', 'Inspiro Admin', 'admin', 'kerala_psc'],
  );
  await sql.query(
    `INSERT INTO users (phone, email, name, role, target_exam)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (phone) DO NOTHING`,
    ['+918888888888', 'faculty@inspiro.in', 'Dr. Rajan Kumar', 'instructor', 'upsc'],
  );

  const admins = (await sql.query(
    `SELECT phone, role FROM users WHERE role IN ('admin','instructor') ORDER BY role`,
  )) as { phone: string; role: string }[];
  console.log('Seeded users:');
  for (const a of admins) console.log(`  ${a.role.padEnd(11)} ${a.phone}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
