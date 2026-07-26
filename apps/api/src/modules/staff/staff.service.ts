import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { users, staffProfiles, staffRoles, branches } from '../../../drizzle/schema.js';
import { hashPassword } from '../../lib/password.js';
import { redis } from '../../lib/redis.js';
import { bustStaffRoleCache } from '../../middleware/require-permission.js';
import type { CreateStaffInput, UpdateStaffInput } from './staff.schema.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

// Columns that live on `users` vs `staff_profiles`.
const USER_FIELDS = ['name', 'staffRoleId', 'branchId'] as const;

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
  if (opts.staffRoleId) conds.push(eq(users.staffRoleId, opts.staffRoleId));
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

  return { items, total };
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
  return staff;
}

export async function createStaff(input: CreateStaffInput) {
  const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (byEmail) throw err('A user with this email already exists', 409, 'EMAIL_EXISTS');
  const [byPhone] = await db.select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1);
  if (byPhone) throw err('A user with this phone already exists', 409, 'PHONE_EXISTS');

  const [role] = await db.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.id, input.staffRoleId)).limit(1);
  if (!role) throw err('Selected role does not exist', 400, 'ROLE_NOT_FOUND');

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
      staffRoleId: input.staffRoleId,
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

  return getStaffById(user!.id);
}

export async function updateStaff(id: string, input: UpdateStaffInput) {
  await getStaffById(id); // 404 if not a staff member

  const userPatch: Record<string, unknown> = {};
  const profilePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if ((USER_FIELDS as readonly string[]).includes(k)) userPatch[k] = v;
    else profilePatch[k] = v;
  }

  if (input.staffRoleId) {
    const [role] = await db.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.id, input.staffRoleId)).limit(1);
    if (!role) throw err('Selected role does not exist', 400, 'ROLE_NOT_FOUND');
  }

  if (Object.keys(userPatch).length) {
    await db.update(users).set({ ...userPatch, updatedAt: new Date() }).where(eq(users.id, id));
    if ('staffRoleId' in userPatch) await bustStaffRoleCache(id); // permission set may change
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
