import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { users, staffProfiles, staffRoles, staffMemberRoles, branches } from '../../../drizzle/schema.js';
import { hashPassword } from '../../lib/password.js';
import { redis } from '../../lib/redis.js';
import { bustStaffRoleCache } from '../../middleware/require-permission.js';
import type { CreateStaffInput, UpdateStaffInput } from './staff.schema.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

// Columns that live on `users` vs `staff_profiles`. Roles are handled apart:
// they live in staff_member_roles, with the main one mirrored on users.
const USER_FIELDS = ['name', 'branchId'] as const;
const ROLE_FIELDS = ['staffRoleId', 'staffRoleIds'];

type RoleRef = { id: string; name: string; slug: string };

/** The roles asked for: the list from current screens, or the one older screens send. */
function requestedRoles(input: { staffRoleIds?: string[]; staffRoleId?: string }): string[] {
  return [...new Set(input.staffRoleIds ?? (input.staffRoleId ? [input.staffRoleId] : []))];
}

async function assertRolesExist(ids: string[]) {
  const found = await db.select({ id: staffRoles.id }).from(staffRoles).where(inArray(staffRoles.id, ids));
  if (found.length !== ids.length) throw err('Selected role does not exist', 400, 'ROLE_NOT_FOUND');
}

// Replaces the roles someone holds. The first is the main one, mirrored on
// users.staff_role_id for screens that show a single role.
async function setStaffRoles(userId: string, ids: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(staffMemberRoles).where(eq(staffMemberRoles.userId, userId));
    await tx.insert(staffMemberRoles).values(ids.map((staffRoleId) => ({ userId, staffRoleId })));
    await tx.update(users).set({ staffRoleId: ids[0], updatedAt: new Date() }).where(eq(users.id, userId));
  });
  await bustStaffRoleCache(userId); // their permission set changes with their roles
}

/**
 * Adds every role each member holds. roleName becomes all of them, main first,
 * so a screen that shows one role name shows them all.
 */
async function withRoles<T extends { id: string; staffRoleId: string | null; roleName: string | null; roleSlug: string | null }>(
  rows: T[],
): Promise<(T & { staffRoles: RoleRef[] })[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select({ userId: staffMemberRoles.userId, id: staffRoles.id, name: staffRoles.name, slug: staffRoles.slug })
    .from(staffMemberRoles)
    .innerJoin(staffRoles, eq(staffRoles.id, staffMemberRoles.staffRoleId))
    .where(inArray(staffMemberRoles.userId, rows.map((r) => r.id)));
  return rows.map((r) => {
    let roles: RoleRef[] = links.filter((l) => l.userId === r.id).map(({ id, name, slug }) => ({ id, name, slug }));
    if (roles.length === 0 && r.staffRoleId && r.roleName) roles = [{ id: r.staffRoleId, name: r.roleName, slug: r.roleSlug ?? '' }];
    roles.sort((a, b) => (a.id === r.staffRoleId ? -1 : b.id === r.staffRoleId ? 1 : a.name.localeCompare(b.name)));
    return { ...r, staffRoles: roles, roleName: roles.map((x) => x.name).join(', ') || r.roleName };
  });
}

async function nextEmployeeId(): Promise<string> {
  const res = (await db.execute(sql`SELECT nextval('staff_emp_seq')::int AS v`)) as unknown as { rows: { v: number }[] };
  const seq = res.rows[0]!.v;
  return `INS-EMP-${String(seq).padStart(5, '0')}`;
}

const staffSelect = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  isActive: users.isActive,
  avatarUrl: users.avatarUrl,
  staffRoleId: users.staffRoleId,
  branchId: users.branchId,
  createdAt: users.createdAt,
  employeeId: staffProfiles.employeeId,
  photoUrl: staffProfiles.photoUrl,
  gender: staffProfiles.gender,
  dob: staffProfiles.dob,
  whatsapp: staffProfiles.whatsapp,
  address: staffProfiles.address,
  joiningDate: staffProfiles.joiningDate,
  department: staffProfiles.department,
  designation: staffProfiles.designation,
  notes: staffProfiles.notes,
  roleName: staffRoles.name,
  roleSlug: staffRoles.slug,
  branchName: branches.name,
};

export async function listStaff(opts: {
  page: number;
  limit: number;
  staffRoleId?: string;
  branchId?: string;
  isActive?: boolean;
  search?: string;
}) {
  const conds = [eq(users.role, 'staff')];
  if (opts.staffRoleId) {
    // Anyone who holds the role, as their main role or one of several.
    conds.push(or(
      eq(users.staffRoleId, opts.staffRoleId),
      inArray(users.id, db.select({ id: staffMemberRoles.userId }).from(staffMemberRoles).where(eq(staffMemberRoles.staffRoleId, opts.staffRoleId))),
    )!);
  }
  if (opts.branchId) conds.push(eq(users.branchId, opts.branchId));
  if (opts.isActive !== undefined) conds.push(eq(users.isActive, opts.isActive));
  if (opts.search) {
    const s = `%${opts.search}%`;
    conds.push(or(ilike(users.name, s), ilike(users.email, s), ilike(users.phone, s), ilike(staffProfiles.employeeId, s))!);
  }
  const where = and(...conds);

  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(where);

  const items = await db
    .select(staffSelect)
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .leftJoin(staffRoles, eq(staffRoles.id, users.staffRoleId))
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);

  return { items: await withRoles(items), total };
}

export async function getStaffById(id: string) {
  const [staff] = await db
    .select(staffSelect)
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .leftJoin(staffRoles, eq(staffRoles.id, users.staffRoleId))
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(and(eq(users.id, id), eq(users.role, 'staff')))
    .limit(1);
  if (!staff) throw err('Staff member not found', 404, 'STAFF_NOT_FOUND');
  return (await withRoles([staff]))[0]!;
}

export async function createStaff(input: CreateStaffInput) {
  const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (byEmail) throw err('A user with this email already exists', 409, 'EMAIL_EXISTS');
  const [byPhone] = await db.select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1);
  if (byPhone) throw err('A user with this phone already exists', 409, 'PHONE_EXISTS');

  const roleIds = requestedRoles(input);
  if (roleIds.length === 0) throw err('Choose at least one role', 400, 'ROLE_REQUIRED');
  await assertRolesExist(roleIds);

  const passwordHash = await hashPassword(input.password);
  const employeeId = await nextEmployeeId();

  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: 'staff',
      passwordHash,
      staffRoleId: roleIds[0],
      branchId: input.branchId ?? null,
      isActive: true,
    })
    .returning();

  await db.insert(staffProfiles).values({
    userId: user!.id,
    employeeId,
    photoUrl: input.photoUrl,
    gender: input.gender,
    dob: input.dob,
    whatsapp: input.whatsapp,
    address: input.address,
    joiningDate: input.joiningDate,
    department: input.department,
    designation: input.designation,
    notes: input.notes,
  });
  await db.insert(staffMemberRoles).values(roleIds.map((staffRoleId) => ({ userId: user!.id, staffRoleId })));

  return getStaffById(user!.id);
}

export async function updateStaff(id: string, input: UpdateStaffInput) {
  const current = await getStaffById(id); // 404 if not a staff member

  const userPatch: Record<string, unknown> = {};
  const profilePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (ROLE_FIELDS.includes(k)) continue;
    if ((USER_FIELDS as readonly string[]).includes(k)) userPatch[k] = v;
    else profilePatch[k] = v;
  }

  let roleIds = requestedRoles(input);
  // Screens from before roles could be combined send the one role they know
  // on every save. When that is simply the main role coming back, it is not a
  // change, and must not strip the person's other roles.
  if (!input.staffRoleIds && input.staffRoleId === current.staffRoleId) roleIds = [];
  if (roleIds.length) {
    await assertRolesExist(roleIds);
    await setStaffRoles(id, roleIds);
  }

  if (Object.keys(userPatch).length) {
    await db.update(users).set({ ...userPatch, updatedAt: new Date() }).where(eq(users.id, id));
  }
  if (Object.keys(profilePatch).length) {
    await db.update(staffProfiles).set({ ...profilePatch, updatedAt: new Date() }).where(eq(staffProfiles.userId, id));
  }

  return getStaffById(id);
}

export async function setStaffStatus(id: string, isActive: boolean) {
  await getStaffById(id);
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id));
  return getStaffById(id);
}

// Sets a new password and returns login details so the caller can email them.
export async function resetStaffPassword(id: string, newPassword: string) {
  const staff = await getStaffById(id);
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
  await redis.del(`forcereset:${id}`);
  return staff;
}

// Flags the account so the next login is prompted to change the password.
export async function forceStaffReset(id: string) {
  await getStaffById(id);
  await redis.set(`forcereset:${id}`, '1'); // no expiry — cleared on next password change
}
