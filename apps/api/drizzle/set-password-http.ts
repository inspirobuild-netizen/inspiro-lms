import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../src/lib/password.js';

// Sets (or resets) an admin/instructor password over Neon HTTP (port 443).
// Usage: pnpm tsx drizzle/set-password-http.ts <email> <password> [phone-to-match]
// If the user with <email> doesn't exist but [phone-to-match] does, the email
// is attached to that user first (handles the seeded admin with no email set).
async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL not set');
  const [email, password, phone] = process.argv.slice(2);
  if (!email || !password) throw new Error('Usage: set-password-http.ts <email> <password> [phone]');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  const sql = neon(url);
  const hash = await hashPassword(password);

  // Attach email to the phone-matched user if needed
  if (phone) {
    await sql.query(
      `UPDATE users SET email = $1 WHERE phone = $2 AND (email IS NULL OR email <> $1)`,
      [email, phone],
    );
  }

  const rows = (await sql.query(
    `UPDATE users SET password_hash = $1, updated_at = now()
     WHERE email = $2
     RETURNING id, name, role, email`,
    [hash, email],
  )) as { id: string; name: string; role: string; email: string }[];

  if (rows.length === 0) throw new Error(`No user found with email ${email}`);
  console.log(`Password set for ${rows[0]!.role} "${rows[0]!.name}" <${rows[0]!.email}>`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
