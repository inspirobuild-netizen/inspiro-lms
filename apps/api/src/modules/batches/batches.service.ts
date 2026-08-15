import { eq, and, count, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  admissions,
  batches,
  batchEnrollments,
  batchInstructors,
  feePlans,
  liveClasses,
  users,
  courses,
} from '../../../drizzle/schema.js';
import { nextCode } from '../leads/leads.service.js';
import { materialiseInstallments } from '../fees/fees.service.js';
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
  const { page, limit, status, type, targetExam, courseId } = input;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(batches.status, status));
  if (type) conditions.push(eq(batches.type, type));
  if (targetExam) conditions.push(eq(batches.targetExam, targetExam));
  if (courseId) conditions.push(eq(batches.courseId, courseId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(batches).where(where);
  const items = await db
    .select({
      batch: batches,
      course: { id: courses.id, title: courses.title },
      // Correlated count so a batch list can show "N/capacity" without an
      // extra request per row. Only `active` enrollments occupy a seat, which
      // matches what the capacity guard in enrollStudent counts.
      enrolledCount: sql<number>`(
        select count(*)::int from ${batchEnrollments}
        where ${batchEnrollments.batchId} = ${batches.id}
          and ${batchEnrollments.status} = 'active'
      )`,
    })
    .from(batches)
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(where)
    .limit(limit)
    .offset(offset);

  return {
    items: items.map((r) => ({ ...r.batch, course: r.course, enrolledCount: r.enrolledCount })),
    total,
  };
}

// ── Get single batch with stats ───────────────────────────────────────────────
export async function getBatchById(batchId: string) {
  const [row] = await db
    .select({ batch: batches, course: courses })
    .from(batches)
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!row) throw notFound();

  const [{ enrolled }] = await db
    .select({ enrolled: count() })
    .from(batchEnrollments)
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));

  const instructorList = await db
    .select({ instructor: users })
    .from(batchInstructors)
    .innerJoin(users, eq(batchInstructors.instructorId, users.id))
    .where(eq(batchInstructors.batchId, batchId));

  return {
    ...row.batch,
    enrolledCount: enrolled,
    instructors: instructorList.map((r) => ({
      id: r.instructor.id,
      name: r.instructor.name,
      avatarUrl: r.instructor.avatarUrl,
    })),
    course: { id: row.course.id, title: row.course.title, subject: row.course.subject },
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
/**
 * Permanently delete a batch, but only when nothing of record hangs off it.
 *
 * The FKs make an unguarded delete quietly destructive: enrollments,
 * instructors, live classes and attendance all CASCADE, and `admissions.batchId`
 * is ON DELETE SET NULL — so deleting a batch with a paid admission would
 * detach that admission from its batch instead of failing. Each blocker gets
 * its own code so the UI can say what is in the way rather than "cannot delete".
 *
 * Use archiveBatch (or PATCH status) to retire a batch that has history.
 */
export async function deleteBatch(batchId: string) {
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
    if (!batch) throw notFound();

    // Every enrollment counts, not just active ones: a suspended row is still a
    // record that a student sat in this batch.
    const [{ enrolled }] = await tx
      .select({ enrolled: count() })
      .from(batchEnrollments)
      .where(eq(batchEnrollments.batchId, batchId));
    if (enrolled > 0) {
      throw conflict(
        `This batch has ${enrolled} enrolled student${enrolled === 1 ? '' : 's'}. Remove them or archive the batch instead.`,
        'BATCH_HAS_ENROLLMENTS',
      );
    }

    const [{ admitted }] = await tx
      .select({ admitted: count() })
      .from(admissions)
      .where(eq(admissions.batchId, batchId));
    if (admitted > 0) {
      throw conflict(
        `This batch is referenced by ${admitted} admission record${admitted === 1 ? '' : 's'}. Archive it instead so the admission history stays intact.`,
        'BATCH_HAS_ADMISSIONS',
      );
    }

    const [{ classes }] = await tx
      .select({ classes: count() })
      .from(liveClasses)
      .where(eq(liveClasses.batchId, batchId));
    if (classes > 0) {
      throw conflict(
        `This batch has ${classes} live class${classes === 1 ? '' : 'es'} scheduled or recorded. Delete those first, or archive the batch.`,
        'BATCH_HAS_LIVE_CLASSES',
      );
    }

    await tx.delete(batchInstructors).where(eq(batchInstructors.batchId, batchId));
    await tx.delete(batches).where(eq(batches.id, batchId));
    return { deleted: true, id: batchId, name: batch.name };
  });
}

export async function archiveBatch(batchId: string) {
  const [updated] = await db
    .update(batches)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(batches.id, batchId))
    .returning();
  if (!updated) throw notFound();
  return updated;
}

/**
 * Create the admission + fee obligation that goes with a manual enrolment.
 *
 * Manual enrolment used to write only `batch_enrollments`, so a student added
 * from the batch page got full course access but never appeared in Admissions
 * and carried no fee due — a silent way to hand out paid access with no
 * financial record. The counsellor and app-verification paths both create an
 * admission, so this brings the third path in line.
 *
 * No payment is recorded here: the obligation is raised as `pending` with
 * amountPaid 0, so the student shows up in Fees outstanding and the money is
 * collected through the normal payments flow.
 *
 * Returns null when the student already has an admission for this course, so
 * re-enrolling (which upserts the enrollment row) cannot mint a duplicate.
 */
async function createAdmissionForEnrolment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: { userId: string; batchId: string; courseId: string; feePlanId?: string; staffId?: string },
) {
  const [existing] = await tx
    .select({ id: admissions.id })
    .from(admissions)
    .where(and(eq(admissions.studentId, opts.userId), eq(admissions.courseId, opts.courseId)))
    .limit(1);
  if (existing) return null;

  // Amount is always resolved server-side from the plan or the course fee —
  // never taken from the caller.
  let plan: { id: string; name: string; totalAmount: number; installments: { label: string; amount: number; dueAfterDays: number }[] } | null = null;
  if (opts.feePlanId) {
    const [p] = await tx.select().from(feePlans).where(eq(feePlans.id, opts.feePlanId)).limit(1);
    if (!p) throw conflict('Fee plan not found', 'FEE_PLAN_NOT_FOUND');
    if (p.courseId !== opts.courseId) {
      throw conflict("Fee plan does not belong to this batch's course", 'FEE_PLAN_COURSE_MISMATCH');
    }
    plan = p;
  }
  const [course] = await tx
    .select({ feeAmount: courses.feeAmount })
    .from(courses)
    .where(eq(courses.id, opts.courseId))
    .limit(1);
  const feeAmount = plan ? plan.totalAmount : (course?.feeAmount ?? 0);

  const admissionNo = await nextCode(tx, 'adm_seq', 'ADM');
  const admissionDate = new Date();
  const [admission] = await tx
    .insert(admissions)
    .values({
      admissionNo,
      studentId: opts.userId,
      counsellorId: opts.staffId,
      courseId: opts.courseId,
      batchId: opts.batchId,
      admissionDate: admissionDate.toISOString().slice(0, 10),
      feePlanId: plan?.id,
      feePlan: plan?.name,
      feeAmount,
      amountPaid: 0,
      paymentStatus: 'pending',
    })
    .returning();

  if (plan) await materialiseInstallments(tx, admission!.id, plan, admissionDate);
  return admission!;
}

// ── Enroll a student ──────────────────────────────────────────────────────────
export async function enrollStudent(
  batchId: string,
  userId: string,
  expiresAt?: string,
  opts?: { feePlanId?: string; staffId?: string },
) {
  return db.transaction(async (tx) => {
    // Confirm batch exists
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
    if (!batch) throw notFound();

    // Capacity check
    const [{ enrolled }] = await tx
      .select({ enrolled: count() })
      .from(batchEnrollments)
      .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));
    if (enrolled >= batch.capacity) {
      throw conflict('Batch is at full capacity', 'BATCH_FULL');
    }

    const [enrollment] = await tx
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

    const admission = await createAdmissionForEnrolment(tx, {
      userId,
      batchId,
      courseId: batch.courseId,
      feePlanId: opts?.feePlanId,
      staffId: opts?.staffId,
    });

    return { ...enrollment!, admission };
  });
}

// ── Bulk enroll ───────────────────────────────────────────────────────────────
export async function bulkEnrollStudents(
  batchId: string,
  userIds: string[],
  expiresAt?: string,
  opts?: { feePlanId?: string; staffId?: string },
) {
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
    if (!batch) throw notFound();

    const [{ enrolled }] = await tx
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

    await tx
      .insert(batchEnrollments)
      .values(rows)
      .onConflictDoUpdate({
        target: [batchEnrollments.userId, batchEnrollments.batchId],
        set: { status: 'active' },
      });

    // Sequential rather than parallel: admission numbers come from a shared
    // sequence, and each student needs their own duplicate check.
    let admissionsCreated = 0;
    for (const userId of userIds) {
      const created = await createAdmissionForEnrolment(tx, {
        userId,
        batchId,
        courseId: batch.courseId,
        feePlanId: opts?.feePlanId,
        staffId: opts?.staffId,
      });
      if (created) admissionsCreated++;
    }

    return { enrolled: userIds.length, admissionsCreated };
  });
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

// ── Student: my enrolled batches ──────────────────────────────────────────────
export async function getMyBatches(userId: string) {
  return db
    .select({ batch: batches, enrollment: batchEnrollments })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batchEnrollments.batchId, batches.id))
    .where(and(eq(batchEnrollments.userId, userId), eq(batchEnrollments.status, 'active')));
}
