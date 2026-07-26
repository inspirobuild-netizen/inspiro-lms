import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { redis } from './redis.js';
import { rolePermissions, permissions as permissionsTable, users } from '../../drizzle/schema.js';

export { PERMISSION_CATALOG, PERMISSION_CODES, type PermissionDef } from './permission-catalog.js';

// ── Cached permission resolution ──────────────────────────────────────────────
const CACHE_TTL = 300; // 5 minutes
const cacheKey = (staffRoleId: string) => `staffperms:${staffRoleId}`;

// Permission codes granted to a staff role (Redis-cached).
export async function getRolePermissions(staffRoleId: string): Promise<string[]> {
  const key = cacheKey(staffRoleId);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as string[];

  const rows = await db
    .select({ code: permissionsTable.code })
    .from(rolePermissions)
    .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id))
    .where(eq(rolePermissions.staffRoleId, staffRoleId));

  const codes = rows.map((r) => r.code);
  await redis.set(key, JSON.stringify(codes), 'EX', CACHE_TTL);
  return codes;
}

// Call after editing a role's permissions so the change takes effect immediately.
export async function bustRolePermissions(staffRoleId: string): Promise<void> {
  await redis.del(cacheKey(staffRoleId));
}

// Resolve a user's effective permissions + staff role slug (for login response
// and requirePermission). Admins implicitly have every permission.
export async function resolveUserPermissions(
  userId: string,
): Promise<{ role: string; staffRoleId: string | null; permissions: string[] }> {
  const [u] = await db
    .select({ role: users.role, staffRoleId: users.staffRoleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!u) return { role: 'student', staffRoleId: null, permissions: [] };
  if (u.role === 'admin') return { role: 'admin', staffRoleId: null, permissions: ['*'] };
  if (u.role === 'staff' && u.staffRoleId) {
    return { role: 'staff', staffRoleId: u.staffRoleId, permissions: await getRolePermissions(u.staffRoleId) };
  }
  return { role: u.role, staffRoleId: null, permissions: [] };
}
