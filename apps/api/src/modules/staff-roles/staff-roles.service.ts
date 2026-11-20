import { and, count, eq, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { staffRoles, staffMemberRoles, permissions, rolePermissions, users } from '../../../drizzle/schema.js';
import { bustRolePermissions } from '../../lib/permissions.js';
import { PERMISSION_CATALOG } from '../../lib/permission-catalog.js';
import type { CreateStaffRoleInput, UpdateStaffRoleInput } from './staff-roles.schema.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function getPermissionCatalog() {
  return PERMISSION_CATALOG;
}

export async function listStaffRoles() {
  const roles = await db.select().from(staffRoles).orderBy(staffRoles.name);
  // Members per role: everyone holding it, alone or among several roles.
  const counts = await db
    .select({ staffRoleId: staffMemberRoles.staffRoleId, n: count() })
    .from(staffMemberRoles)
    .innerJoin(users, eq(users.id, staffMemberRoles.userId))
    .where(eq(users.role, 'staff'))
    .groupBy(staffMemberRoles.staffRoleId);
  const countMap = new Map(counts.map((c) => [c.staffRoleId, Number(c.n)]));
  return roles.map((r) => ({ ...r, memberCount: countMap.get(r.id) ?? 0 }));
}

export async function getStaffRole(id: string) {
  const [role] = await db.select().from(staffRoles).where(eq(staffRoles.id, id)).limit(1);
  if (!role) throw err('Role not found', 404, 'ROLE_NOT_FOUND');
  const perms = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.staffRoleId, id));
  return { ...role, permissions: perms.map((p) => p.code) };
}

export async function createStaffRole(input: CreateStaffRoleInput) {
  const slug = slugify(input.name);
  if (!slug) throw err('Invalid role name', 400, 'INVALID_ROLE_NAME');
  const [existing] = await db.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.slug, slug)).limit(1);
  if (existing) throw err('A role with this name already exists', 409, 'ROLE_EXISTS');
  const [role] = await db.insert(staffRoles).values({ name: input.name, slug, description: input.description }).returning();
  return { ...role, permissions: [] as string[] };
}

export async function updateStaffRole(id: string, input: UpdateStaffRoleInput) {
  const [role] = await db
    .update(staffRoles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(staffRoles.id, id))
    .returning();
  if (!role) throw err('Role not found', 404, 'ROLE_NOT_FOUND');
  return role;
}

export async function deleteStaffRole(id: string) {
  const [role] = await db.select().from(staffRoles).where(eq(staffRoles.id, id)).limit(1);
  if (!role) throw err('Role not found', 404, 'ROLE_NOT_FOUND');
  if (role.isSystem) throw err('Built-in roles cannot be deleted', 400, 'ROLE_IS_SYSTEM');
  const [[{ n }], [{ m }]] = await Promise.all([
    db.select({ n: count() }).from(staffMemberRoles).where(eq(staffMemberRoles.staffRoleId, id)),
    db.select({ m: count() }).from(users).where(eq(users.staffRoleId, id)),
  ]);
  if (Number(n) + Number(m) > 0) throw err('Reassign the staff on this role before deleting it', 409, 'ROLE_IN_USE');
  await db.delete(staffRoles).where(eq(staffRoles.id, id));
  await bustRolePermissions(id);
}

// Replace a role's permission set with exactly the given codes.
export async function setRolePermissions(id: string, codes: string[]) {
  const [role] = await db.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.id, id)).limit(1);
  if (!role) throw err('Role not found', 404, 'ROLE_NOT_FOUND');

  const wanted = [...new Set(codes)];
  const permRows = wanted.length
    ? await db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, wanted))
    : [];

  await db.delete(rolePermissions).where(eq(rolePermissions.staffRoleId, id));
  if (permRows.length) {
    await db.insert(rolePermissions).values(permRows.map((p) => ({ staffRoleId: id, permissionId: p.id })));
  }
  await bustRolePermissions(id);
  return { permissions: wanted };
}
