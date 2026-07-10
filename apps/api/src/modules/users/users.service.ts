import { eq, ilike, and, count, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { users, batchEnrollments, batches, streaks } from '../../../drizzle/schema.js';
import type { UpdateProfileInput, CreateUserInput, ListUsersInput } from './users.schema.js';

// Public user shape — never expose internal fields
function sanitizeUser(user: typeof users.$inferSelect) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

// ── My profile ────────────────────────────────────────────────────────────────
export async function getMyProfile(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound('User');

  const [streak] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);

  const enrollments = await db
    .select({ batch: batches })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batchEnrollments.batchId, batches.id))
    .where(and(eq(batchEnrollments.userId, userId), eq(batchEnrollments.status, 'active')));

  return {
    ...sanitizeUser(user),
    streak: streak ?? null,
    batches: enrollments.map((e) => e.batch),
  };
}

// ── Update profile ────────────────────────────────────────────────────────────
export async function updateMyProfile(userId: string, data: UpdateProfileInput) {
  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw notFound('User');
  return sanitizeUser(updated);
}

// ── Admin: create user ────────────────────────────────────────────────────────
export async function createUser(data: CreateUserInput) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, data.phone)).limit(1);
  if (existing) {
    throw Object.assign(new Error('A user with this phone number already exists'), {
      statusCode: 409,
      code: 'PHONE_EXISTS',
    });
  }
  if (data.email) {
    const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
    if (byEmail) {
      throw Object.assign(new Error('A user with this email already exists'), {
        statusCode: 409,
        code: 'EMAIL_EXISTS',
      });
    }
  }

  const [created] = await db.insert(users).values(data).returning();
  return sanitizeUser(created!);
}

// ── Admin: list users ─────────────────────────────────────────────────────────
export async function listUsers(input: ListUsersInput) {
  const { page, limit, role, isActive, search, batchId } = input;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (role) conditions.push(eq(users.role, role));
  if (isActive !== undefined) conditions.push(eq(users.isActive, isActive));
  if (search) {
    conditions.push(
      sql`(${ilike(users.name, `%${search}%`)} OR ${ilike(users.phone, `%${search}%`)})`
    );
  }

  // If filtering by batch, join enrollments
  if (batchId) {
    const enrolled = await db
      .select({ userId: batchEnrollments.userId })
      .from(batchEnrollments)
      .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));
    const ids = enrolled.map((e) => e.userId);
    if (ids.length === 0) return { items: [], total: 0 };
    conditions.push(sql`${users.id} = ANY(${sql`ARRAY[${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)}]`})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const items = await db.select().from(users).where(where).limit(limit).offset(offset);

  return { items: items.map(sanitizeUser), total };
}

// ── Admin: get single user ────────────────────────────────────────────────────
export async function getUserById(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound('User');

  const enrollments = await db
    .select({ batch: batches, enrollment: batchEnrollments })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batchEnrollments.batchId, batches.id))
    .where(eq(batchEnrollments.userId, userId));

  return { ...sanitizeUser(user), enrollments };
}

// ── Admin: update role ────────────────────────────────────────────────────────
export async function updateUserRole(userId: string, role: 'student' | 'instructor' | 'admin') {
  const [updated] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw notFound('User');
  return sanitizeUser(updated);
}

// ── Admin: suspend / reactivate ───────────────────────────────────────────────
export async function setUserStatus(userId: string, isActive: boolean) {
  const [updated] = await db
    .update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw notFound('User');
  return sanitizeUser(updated);
}

function notFound(entity: string) {
  return Object.assign(new Error(`${entity} not found`), { statusCode: 404, code: `${entity.toUpperCase()}_NOT_FOUND` });
}
