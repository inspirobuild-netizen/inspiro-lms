import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { db } from './db.js';
import { redis } from './redis.js';
import { rolePermissions, permissions as permissionsTable, staffMemberRoles, staffRoles, users } from '../../drizzle/schema.js';

export { PERMISSION_CATALOG, PERMISSION_CODES, type PermissionDef } from './permission-catalog.js';

// ── Cached permission resolution ──────────────────────────────────────────────
const CACHE_TTL = 300; // 5 minutes
const cacheKey = (staffRoleId: string) => `staffperms:${staffRoleId}`;
const userRolesKey = (userId: string) => `user:staffroles:${userId}`;

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

/**
 * The staff roles a user holds (Redis-cached): their linked roles, or just the
 * main role for someone with no links yet (a member created by an older build).
 */
export async function getStaffRoleIds(userId: string): Promise<string[]> {
  const key = userRolesKey(userId);
  const cached = await redis.get(key);
  if (cached !== null) return cached ? cached.split(',') : [];

  const links = await db
    .select({ id: staffMemberRoles.staffRoleId })
    .from(staffMemberRoles)
    .where(eq(staffMemberRoles.userId, userId));
  let ids = links.map((l) => l.id);
  if (ids.length === 0) {
    const [u] = await db.select({ id: users.staffRoleId }).from(users).where(eq(users.id, userId)).limit(1);
    if (u?.id) ids = [u.id];
  }
  await redis.set(key, ids.join(','), 'EX', CACHE_TTL);
  return ids;
}

// Call after changing which roles someone holds.
export async function bustUserStaffRoles(userId: string): Promise<void> {
  await redis.del(userRolesKey(userId), `user:staffrole:${userId}`);
}

/** Holding several roles grants everything any of them grants. */
export function mergePermissions(sets: string[][]): string[] {
  return [...new Set(sets.flat())].sort();
}

/** A staff member's effective permissions: the union over all their roles. */
export async function getStaffPermissions(userId: string): Promise<string[]> {
  const ids = await getStaffRoleIds(userId);
  return mergePermissions(await Promise.all(ids.map(getRolePermissions)));
}

// Resolve a user's effective permissions and roles. Admins implicitly have
// every permission.
export async function resolveUserPermissions(
  userId: string,
): Promise<{ role: string; staffRoleId: string | null; staffRoleIds: string[]; permissions: string[] }> {
  const [u] = await db
    .select({ role: users.role, staffRoleId: users.staffRoleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!u) return { role: 'student', staffRoleId: null, staffRoleIds: [], permissions: [] };
  if (u.role === 'admin') return { role: 'admin', staffRoleId: null, staffRoleIds: [], permissions: ['*'] };
  if (u.role === 'staff') {
    const staffRoleIds = await getStaffRoleIds(userId);
    if (staffRoleIds.length) {
      return { role: 'staff', staffRoleId: u.staffRoleId ?? staffRoleIds[0]!, staffRoleIds, permissions: await getStaffPermissions(userId) };
    }
  }
  return { role: u.role, staffRoleId: null, staffRoleIds: [], permissions: [] };
}

/** Whether the user holds the staff role with this slug, alone or among several. */
export async function holdsStaffRole(userId: string, slug: string): Promise<boolean> {
  const ids = await getStaffRoleIds(userId);
  if (ids.length === 0) return false;
  const [hit] = await db
    .select({ id: staffRoles.id })
    .from(staffRoles)
    .where(and(inArray(staffRoles.id, ids), eq(staffRoles.slug, slug)))
    .limit(1);
  return !!hit;
}

/** Active staff who hold the role with this slug, by name: the people a picker offers. */
export async function activeStaffWithRole(slug: string) {
  const holders = db
    .select({ id: staffMemberRoles.userId })
    .from(staffMemberRoles)
    .innerJoin(staffRoles, eq(staffRoles.id, staffMemberRoles.staffRoleId))
    .where(eq(staffRoles.slug, slug));
  const main = db.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.slug, slug));
  return db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(and(
      eq(users.role, 'staff'),
      eq(users.isActive, true),
      or(inArray(users.id, holders), inArray(users.staffRoleId, main)),
    ))
    .orderBy(asc(users.name));
}
