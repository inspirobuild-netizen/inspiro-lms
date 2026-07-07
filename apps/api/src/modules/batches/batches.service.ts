import { eq, and, count, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  batches,
  batchEnrollments,
  batchInstructors,
  batchCourses,
  users,
  courses,
} from '../../../drizzle/schema.js';
import type { CreateBatchInput, UpdateBatchInput, ListBatchesInput } from './batches.schema.js';

function notFound(entity = 'Batch') {
  return Object.assign(new Error(`${entity} not found`), {
    statusCode: 404,
    code: `${entity.toUpperCase().replace(' ', '_')}_NOT_FOUND`,
  });
}

function conflict(msg: string, code: string) {
  return Object.assign(new Error(msg), { statusCode: 409, code });
}

// ── List batches ──────────────────────────────────────────────────────────────
export async function listBatches(input: ListBatchesInput) {
  const { page, limit, status, type, targetExam } = input;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(batches.status, status));
  if (type) conditions.push(eq(batches.type, type));
  if (targetExam) conditions.push(eq(batches.targetExam, targetExam));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(batches).where(where);
  const items = await db.select().from(batches).where(where).limit(limit).offset(offset);

  return { items, total };
}

// ── Get single batch with stats ───────────────────────────────────────────────
export async function getBatchById(batchId: string) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw notFound();

  const [{ enrolled }] = await db
    .select({ enrolled: count() })
    .from(batchEnrollments)
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));

  const instructorList = await db
    .select({ instructor: users })
    .from(batchInstructors)
    .innerJoin(users, eq(batchInstructors.instructorId, users.id))
    .where(eq(batchInstructors.batchId, batchId));

  const courseList = await db
    .select({ course: courses })
    .from(batchCourses)
    .innerJoin(courses, eq(batchCourses.courseId, courses.id))
    .where(eq(batchCourses.batchId, batchId));

  return {
    ...batch,
    enrolledCount: enrolled,
    instructors: instructorList.map((r) => ({
      id: r.instructor.id,
      name: r.instructor.name,
      avatarUrl: r.instructor.avatarUrl,
    })),
    courses: courseList.map((r) => ({
      id: r.course.id,
      title: r.course.title,
      subject: r.course.subject,
    })),
  };
}

// ── Create batch ──────────────────────────────────────────────────────────────
export async function createBatch(data: CreateBatchInput) {
  const [batch] = await db.insert(batches).values(data).returning();
  return batch!;
}

// ── Update batch ──────────────────────────────────────────────────────────────
export async function updateBatch(batchId: string, data: UpdateBatchInput) {
  const [updated] = await db
    .update(batches)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(batches.id, batchId))
    .returning();
  if (!updated) throw notFound();
  return updated;
}

// ── Archive batch ─────────────────────────────────────────────────────────────
export async function archiveBatch(batchId: string) {
  const [updated] = await db
    .update(batches)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(batches.id, batchId))
    .returning();
  if (!updated) throw notFound();
  return updated;
}

// ── Enroll a student ──────────────────────────────────────────────────────────
export async function enrollStudent(
  batchId: string,
  userId: string,
  expiresAt?: string,
) {
  // Confirm batch exists
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw notFound();

  // Capacity check
  const [{ enrolled }] = await db
    .select({ enrolled: count() })
    .from(batchEnrollments)
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));
  if (enrolled >= batch.capacity) {
    throw conflict('Batch is at full capacity', 'BATCH_FULL');
  }

  const [enrollment] = await db
    .insert(batchEnrollments)
    .values({
      userId,
      batchId,
      status: 'active',
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    })
    .onConflictDoUpdate({
      target: [batchEnrollments.userId, batchEnrollments.batchId],
      set: { status: 'active', expiresAt: expiresAt ? new Date(expiresAt) : null },
    })
    .returning();

  return enrollment!;
}

// ── Bulk enroll ───────────────────────────────────────────────────────────────
export async function bulkEnrollStudents(
  batchId: string,
  userIds: string[],
  expiresAt?: string,
) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw notFound();

  const [{ enrolled }] = await db
    .select({ enrolled: count() })
    .from(batchEnrollments)
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));

  if (enrolled + userIds.length > batch.capacity) {
    throw conflict(
      `Enrolling ${userIds.length} students would exceed batch capacity of ${batch.capacity}`,
      'BATCH_CAPACITY_EXCEEDED',
    );
  }

  const rows = userIds.map((userId) => ({
    userId,
    batchId,
    status: 'active' as const,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  }));

  await db
    .insert(batchEnrollments)
    .values(rows)
    .onConflictDoUpdate({
      target: [batchEnrollments.userId, batchEnrollments.batchId],
      set: { status: 'active' },
    });

  return { enrolled: userIds.length };
}

// ── Unenroll a student ────────────────────────────────────────────────────────
export async function unenrollStudent(batchId: string, userId: string) {
  const [updated] = await db
    .update(batchEnrollments)
    .set({ status: 'suspended' })
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.userId, userId)))
    .returning();
  if (!updated) throw notFound('Enrollment');
  return updated;
}

// ── List enrolled students ────────────────────────────────────────────────────
export async function getBatchStudents(
  batchId: string,
  page: number,
  limit: number,
) {
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: count() })
    .from(batchEnrollments)
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));

  const items = await db
    .select({
      enrollment: batchEnrollments,
      user: {
        id: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        avatarUrl: users.avatarUrl,
        targetExam: users.targetExam,
      },
    })
    .from(batchEnrollments)
    .innerJoin(users, eq(batchEnrollments.userId, users.id))
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')))
    .limit(limit)
    .offset(offset);

  return { items, total };
}

// ── Assign instructor ─────────────────────────────────────────────────────────
export async function assignInstructor(batchId: string, instructorId: string) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw notFound();

  const [instructor] = await db.select().from(users).where(eq(users.id, instructorId)).limit(1);
  if (!instructor || instructor.role === 'student') {
    throw Object.assign(new Error('User is not an instructor'), { statusCode: 400, code: 'NOT_INSTRUCTOR' });
  }

  await db
    .insert(batchInstructors)
    .values({ batchId, instructorId })
    .onConflictDoNothing();

  return { batchId, instructorId };
}

// ── Remove instructor ─────────────────────────────────────────────────────────
export async function removeInstructor(batchId: string, instructorId: string) {
  const result = await db
    .delete(batchInstructors)
    .where(and(eq(batchInstructors.batchId, batchId), eq(batchInstructors.instructorId, instructorId)))
    .returning();
  if (result.length === 0) throw notFound('Instructor assignment');
  return { removed: true };
}

// ── Assign course to batch ────────────────────────────────────────────────────
export async function assignCourse(batchId: string, courseId: string) {
  await db
    .insert(batchCourses)
    .values({ batchId, courseId })
    .onConflictDoNothing();
  return { batchId, courseId };
}

// ── Remove course from batch ──────────────────────────────────────────────────
export async function removeCourse(batchId: string, courseId: string) {
  const result = await db
    .delete(batchCourses)
    .where(and(eq(batchCourses.batchId, batchId), eq(batchCourses.courseId, courseId)))
    .returning();
  if (result.length === 0) throw notFound('Course assignment');
  return { removed: true };
}

// ── Student: my enrolled batches ──────────────────────────────────────────────
export async function getMyBatches(userId: string) {
  return db
    .select({ batch: batches, enrollment: batchEnrollments })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batchEnrollments.batchId, batches.id))
    .where(and(eq(batchEnrollments.userId, userId), eq(batchEnrollments.status, 'active')));
}
