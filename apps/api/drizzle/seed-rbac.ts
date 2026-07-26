import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { PERMISSION_CATALOG, DEFAULT_STAFF_ROLES } from '../src/lib/permission-catalog.js';

// Seeds the permission catalog + default staff roles and their permission sets
// over Neon HTTP (443). Idempotent — safe to re-run after catalog changes.
async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = neon(url);

  // 1. Permissions
  for (const p of PERMISSION_CATALOG) {
    await sql.query(
      `INSERT INTO permissions (code, label, category) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, category = EXCLUDED.category`,
      [p.code, p.label, p.category],
    );
  }
  console.log(`permissions upserted: ${PERMISSION_CATALOG.length}`);

  // 2. Default staff roles + their permission grants
  for (const role of DEFAULT_STAFF_ROLES) {
    const rows = (await sql.query(
      `INSERT INTO staff_roles (name, slug, description, is_system) VALUES ($1,$2,$3,true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
       RETURNING id`,
      [role.name, role.slug, role.description],
    )) as { id: string }[];
    const roleId = rows[0]!.id;

    for (const code of role.permissions) {
      await sql.query(
        `INSERT INTO role_permissions (staff_role_id, permission_id)
         SELECT $1, id FROM permissions WHERE code = $2
         ON CONFLICT (staff_role_id, permission_id) DO NOTHING`,
        [roleId, code],
      );
    }
    console.log(`role "${role.name}" → ${role.permissions.length} permissions`);
  }

  // 3. Ensure employee-ID sequence starts clean
  await sql.query(`ALTER SEQUENCE staff_emp_seq RESTART WITH 1`);

  console.log('RBAC seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
