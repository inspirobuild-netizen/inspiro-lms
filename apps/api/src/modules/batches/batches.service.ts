import { eq, and, count, sql, or, gt, ne, exists, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { planMediaCleanup, purgeMedia, lessonIdsForScope } from '../courses/media-cleanup.service.js';
import {
  admissions,
  batches,
  batchEnrollments,
  batchInstructors,
  feePlans,
  liveClasses,
  payments,
  users,
  courses,
  enrollmentRequests,
} from '../../../drizzle/schema.js';
import { nextCode } from '../leads/leads.service.js';
import { materialiseInstallments } from '../fees/fees.service.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import { logger } from '../../lib/logger.js';
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
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
    if (!current) throw notFound();
    // Switching a batch on as the online-enrolment target switches its
    // siblings off: a payment can only land in one place.
    if (data.enrolling === true) {
      await tx
        .update(batches)
        .set({ enrolling: false, updatedAt: new Date() })
        .where(and(eq(batches.courseId, current.courseId), sql`${batches.id} <> ${batchId}`));
    }
    const [updated] = await tx
      .update(batches)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(batches.id, batchId))
      .returning();
    return updated!;
  });
}

// ── Delete batch ──────────────────────────────────────────────────────────────
/**
 * What deleting a batch takes with it, and what stops it.
 *
 * Shared by the delete itself and the admin's confirmation dialog so the two
 * cannot disagree. They used to: the Students tab counted only `active`
 * enrolments while the delete guard counted every row, so a batch whose
 * students had all been removed showed "no students enrolled" and then refused
 * to delete for having students — and would have refused again for the unpaid
 * admissions those same enrolments had created.
 *
 * The rule is money and presence. A student still in the batch, an admission
 * awaiting approval, and any admission with a payment against it block the
 * delete (archive instead). The rows "Remove student" leaves behind
 * (`suspended`), lapsed seats (`expired`) and the fee obligations of students
 * who are no longer here carry neither, and go with the batch.
 */
export interface BatchDeletionImpact {
  /** Students in the Students tab — blocks. */
  activeStudents: number;
  /** Counsellor admissions not yet approved — blocks. */
  pendingApprovals: number;
  /** Suspended or expired rows nobody can see — deleted with the batch. */
  removedStudents: number;
  /** Admissions with a payment recorded or awaiting verification — blocks. */
  paidAdmissions: number;
  /** Fee obligations with nothing paid — deleted with the batch. */
  unpaidAdmissions: number;
  /** Scheduled or recorded live classes — blocks. */
  liveClasses: number;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, 'select'>;

/** An admission that has money against it, verified or still awaiting it. */
function moneyRecorded(reader: Reader) {
  // amountPaid is the verified rollup; the EXISTS catches a payment that is
  // still awaiting verification, which must count as money too.
  return or(
    gt(admissions.amountPaid, 0),
    exists(
      reader
        .select({ one: sql`1` })
        .from(payments)
        .where(and(eq(payments.admissionId, admissions.id), ne(payments.status, 'rejected'))),
    ),
  );
}

export async function batchDeletionImpact(batchId: string, reader: Reader = db): Promise<BatchDeletionImpact> {
  const byStatus = await reader
    .select({ status: batchEnrollments.status, n: count() })
    .from(batchEnrollments)
    .where(eq(batchEnrollments.batchId, batchId))
    .groupBy(batchEnrollments.status);
  const enrolled = (s: (typeof byStatus)[number]['status']) => byStatus.find((r) => r.status === s)?.n ?? 0;

  const [{ paid }] = await reader
    .select({ paid: count() })
    .from(admissions)
    .where(and(eq(admissions.batchId, batchId), moneyRecorded(reader)));
  const [{ total }] = await reader
    .select({ total: count() })
    .from(admissions)
    .where(eq(admissions.batchId, batchId));
  const [{ classes }] = await reader
    .select({ classes: count() })
    .from(liveClasses)
    .where(eq(liveClasses.batchId, batchId));

  return {
    activeStudents: enrolled('active'),
    pendingApprovals: enrolled('pending_approval'),
    removedStudents: enrolled('suspended') + enrolled('expired'),
    paidAdmissions: paid,
    unpaidAdmissions: total - paid,
    liveClasses: classes,
  };
}

/**
 * An admission is one per student and course, and it keeps pointing at the
 * batch the student first joined even after staff move them to a sibling
 * batch. Before judging a batch by its admissions, point those at the batch
 * the student is in now, so deleting the old one neither deletes nor orphans
 * a live student's fee record.
 */
async function repointMovedAdmissions(tx: Tx, batch: { id: string; courseId: string }) {
  const moved = await tx
    .select({ admissionId: admissions.id, batchId: batchEnrollments.batchId })
    .from(admissions)
    .innerJoin(
      batchEnrollments,
      and(
        eq(batchEnrollments.userId, admissions.studentId),
        inArray(batchEnrollments.status, ['active', 'pending_approval']),
        ne(batchEnrollments.batchId, batch.id),
      ),
    )
    .innerJoin(batches, and(eq(batches.id, batchEnrollments.batchId), eq(batches.courseId, batch.courseId)))
    .where(eq(admissions.batchId, batch.id));
  for (const m of moved) {
    await tx
      .update(admissions)
      .set({ batchId: m.batchId, updatedAt: new Date() })
      .where(eq(admissions.id, m.admissionId));
  }
  return moved.length;
}

export async function deleteBatch(batchId: string) {
  // Read what would be orphaned before the cascade takes the lessons with it.
  // Anything another batch still uses is excluded by the reference count, so
  // a batch copied from this one keeps working.
  const lessonIds = await lessonIdsForScope({ kind: 'batch', id: batchId });
  const plan = await planMediaCleanup(lessonIds);

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
    if (!batch) throw notFound();

    await repointMovedAdmissions(tx, batch);
    const impact = await batchDeletionImpact(batchId, tx);
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

    if (impact.activeStudents > 0) {
      throw conflict(
        `This batch has ${impact.activeStudents} enrolled ${plural(impact.activeStudents, 'student', 'students')}. Remove them from the Students tab, or archive the batch instead.`,
        'BATCH_HAS_ENROLLMENTS',
      );
    }
    if (impact.pendingApprovals > 0) {
      throw conflict(
        `${impact.pendingApprovals} ${plural(impact.pendingApprovals, 'admission into this batch is', 'admissions into this batch are')} still awaiting approval. Approve or reject ${plural(impact.pendingApprovals, 'it', 'them')} first.`,
        'BATCH_HAS_PENDING_ADMISSIONS',
      );
    }
    if (impact.paidAdmissions > 0) {
      throw conflict(
        `${impact.paidAdmissions} ${plural(impact.paidAdmissions, 'student has', 'students have')} fee payments recorded against this batch. Payment history is never deleted — archive the batch instead.`,
        'BATCH_HAS_PAID_ADMISSIONS',
      );
    }
    if (impact.liveClasses > 0) {
      throw conflict(
        `This batch has ${impact.liveClasses} live ${plural(impact.liveClasses, 'class', 'classes')} scheduled or recorded. Delete those first, or archive the batch.`,
        'BATCH_HAS_LIVE_CLASSES',
      );
    }

    // Nothing left here carries money or a current student. The admissions
    // were raised by manual enrolments that staff have since reversed; taking
    // them too keeps removed students from sitting in Fees as owing for a
    // batch that no longer exists. Their installments cascade.
    const goneAdmissions = await tx
      .delete(admissions)
      .where(eq(admissions.batchId, batchId))
      .returning({ id: admissions.id });
    const goneEnrolments = await tx
      .delete(batchEnrollments)
      .where(eq(batchEnrollments.batchId, batchId))
      .returning({ id: batchEnrollments.id });
    await tx.delete(batchInstructors).where(eq(batchInstructors.batchId, batchId));
    await tx.delete(batches).where(eq(batches.id, batchId));
    return {
      deleted: true,
      id: batchId,
      name: batch.name,
      removed: { removedStudents: goneEnrolments.length, unpaidAdmissions: goneAdmissions.length },
    };
  });

  // Storage last: an orphaned file costs money, whereas a lesson pointing at a
  // deleted video is a dead class. Only one of those is recoverable.
  const media = await purgeMedia(plan);
  return { ...result, media };
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

/**
 * Closes off any app enrolment request this manual enrolment has just granted.
 *
 * A student can ask for a course from the app (creating a pending
 * enrollment_request) and then be enrolled by staff from the Batches page,
 * which is a completely separate code path. Without this, the request sits
 * pending for ever and the app keeps telling a student who already has full
 * access that they are "awaiting verification".
 *
 * Returns the student ids that had a request resolved, so the caller can tell
 * them the good news.
 */
async function resolvePendingEnrolRequests(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: { userId: string; courseId: string; admissionId?: string | null; staffId?: string },
): Promise<boolean> {
  const resolved = await tx
    .update(enrollmentRequests)
    .set({
      status: 'verified',
      verifiedBy: opts.staffId ?? null,
      verifiedAt: new Date(),
      // May be null when the student already had an admission for this
      // course — the request is still resolved either way.
      resultingAdmissionId: opts.admissionId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(enrollmentRequests.studentId, opts.userId),
        eq(enrollmentRequests.courseId, opts.courseId),
        eq(enrollmentRequests.status, 'pending'),
      ),
    )
    .returning({ id: enrollmentRequests.id });

  return resolved.length > 0;
}

export async function enrollStudent(
  batchId: string,
  userId: string,
  expiresAt?: string,
  opts?: { feePlanId?: string; staffId?: string; staffRole?: string },
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
        status: opts?.staffRole === 'admin' || !opts?.staffRole ? 'active' : 'pending_approval',
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      })
      .onConflictDoUpdate({
        target: [batchEnrollments.userId, batchEnrollments.batchId],
        set: {
          status: opts?.staffRole === 'admin' || !opts?.staffRole ? 'active' : 'pending_approval',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      })
      .returning();

    const admission = await createAdmissionForEnrolment(tx, {
      userId,
      batchId,
      courseId: batch.courseId,
      feePlanId: opts?.feePlanId,
      staffId: opts?.staffId,
    });

    const hadRequest = await resolvePendingEnrolRequests(tx, {
      userId,
      courseId: batch.courseId,
      admissionId: admission?.id ?? null,
      staffId: opts?.staffId,
    });

    return { ...enrollment!, admission, resolvedRequest: hadRequest, batchName: batch.name };
  });
}

// ── Bulk enroll ───────────────────────────────────────────────────────────────
export async function bulkEnrollStudents(
  batchId: string,
  userIds: string[],
  expiresAt?: string,
  opts?: { feePlanId?: string; staffId?: string; staffRole?: string },
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

    const enrolStatus =
      opts?.staffRole === 'admin' || !opts?.staffRole ? ('active' as const) : ('pending_approval' as const);
    const rows = userIds.map((userId) => ({
      userId,
      batchId,
      status: enrolStatus,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    }));

    await tx
      .insert(batchEnrollments)
      .values(rows)
      .onConflictDoUpdate({
        target: [batchEnrollments.userId, batchEnrollments.batchId],
        set: { status: enrolStatus },
      });

    // Sequential rather than parallel: admission numbers come from a shared
    // sequence, and each student needs their own duplicate check.
    let admissionsCreated = 0;
    const notify: string[] = [];
    for (const userId of userIds) {
      const created = await createAdmissionForEnrolment(tx, {
        userId,
        batchId,
        courseId: batch.courseId,
        feePlanId: opts?.feePlanId,
        staffId: opts?.staffId,
      });
      if (created) admissionsCreated++;

      const hadRequest = await resolvePendingEnrolRequests(tx, {
        userId,
        courseId: batch.courseId,
        admissionId: created?.id ?? null,
        staffId: opts?.staffId,
      });
      if (hadRequest) notify.push(userId);
    }

    return { enrolled: userIds.length, admissionsCreated, notifyStudents: notify, batchName: batch.name };
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

// Course ids where the student has an enrolment awaiting the admin's payment
// check. The app uses this to show "Awaiting confirmation" instead of an
// Enrol button — without it, a counsellor-admitted student is invited to pay
// a second time through the app.
export async function getMyPendingCourseIds(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ courseId: batches.courseId })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batchEnrollments.batchId, batches.id))
    .where(and(eq(batchEnrollments.userId, userId), eq(batchEnrollments.status, 'pending_approval')));
  return rows.map((r) => r.courseId);
}
