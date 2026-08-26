import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  admissions,
  admissionInstallments,
  batchEnrollments,
  batches,
  payments,
  users,
  courses,
} from '../../../drizzle/schema.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import { logger } from '../../lib/logger.js';

/**
 * The admin maker-checker over counsellor admissions.
 *
 * With 40+ counsellors recording money, the person who RECORDS a payment can
 * never be the person who CONFIRMS it. A counsellor's payment row sits at
 * status 'pending' and grants nothing; the enrolment they created sits at
 * 'pending_approval' and grants nothing. Both flip only here, and every route
 * over this service is role-gated to admin — deliberately not a permission,
 * so no staff role that counsellors could ever hold can be granted the
 * checker side.
 */

function err(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── The approval queue ────────────────────────────────────────────────────────
// One row per admission needing admin attention: a pending payment claim, a
// pending enrolment, or both. Grouped this way because that is the decision
// the admin actually makes — "is this student's money real, and do they get
// in" — not a flat list of payment rows.
export async function listApprovals(counsellorId?: string) {
  const pendingPayments = await db
    .select({
      id: payments.id,
      admissionId: payments.admissionId,
      amount: payments.amount,
      method: payments.method,
      reference: payments.reference,
      note: payments.note,
      collectedBy: payments.collectedBy,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.status, 'pending'))
    .orderBy(asc(payments.createdAt));

  const pendingEnrols = await db
    .select({
      id: batchEnrollments.id,
      userId: batchEnrollments.userId,
      batchId: batchEnrollments.batchId,
      enrolledAt: batchEnrollments.enrolledAt,
      batchName: batches.name,
      courseId: batches.courseId,
    })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batches.id, batchEnrollments.batchId))
    .where(eq(batchEnrollments.status, 'pending_approval'))
    .orderBy(asc(batchEnrollments.enrolledAt));

  // Admissions referenced by either list.
  const admissionIds = [...new Set(pendingPayments.map((p) => p.admissionId))];
  const admissionRows = admissionIds.length
    ? await db
        .select({
          id: admissions.id,
          admissionNo: admissions.admissionNo,
          studentId: admissions.studentId,
          counsellorId: admissions.counsellorId,
          courseId: admissions.courseId,
          batchId: admissions.batchId,
          feeAmount: admissions.feeAmount,
          amountPaid: admissions.amountPaid,
          paymentStatus: admissions.paymentStatus,
        })
        .from(admissions)
        .where(inArray(admissions.id, admissionIds))
    : [];
  const admissionById = new Map(admissionRows.map((a) => [a.id, a]));

  // Students without a pending payment can still have a pending enrolment
  // (counsellor enrolled but recorded no money) — look their admission up by
  // student+course so fee context still shows.
  const enrolStudentIds = [...new Set(pendingEnrols.map((e) => e.userId))];
  const extraAdmissions = enrolStudentIds.length
    ? await db
        .select({
          id: admissions.id,
          admissionNo: admissions.admissionNo,
          studentId: admissions.studentId,
          counsellorId: admissions.counsellorId,
          courseId: admissions.courseId,
          feeAmount: admissions.feeAmount,
          amountPaid: admissions.amountPaid,
          paymentStatus: admissions.paymentStatus,
        })
        .from(admissions)
        .where(inArray(admissions.studentId, enrolStudentIds))
    : [];

  // Everyone we need names for.
  const userIds = [
    ...new Set([
      ...admissionRows.map((a) => a.studentId),
      ...admissionRows.map((a) => a.counsellorId).filter((x): x is string => !!x),
      ...pendingEnrols.map((e) => e.userId),
      ...pendingPayments.map((p) => p.collectedBy).filter((x): x is string => !!x),
      ...extraAdmissions.map((a) => a.counsellorId).filter((x): x is string => !!x),
    ]),
  ];
  const people = userIds.length
    ? await db
        .select({ id: users.id, name: users.name, phone: users.phone })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const personById = new Map(people.map((u) => [u.id, u]));

  const courseIds = [
    ...new Set([...admissionRows.map((a) => a.courseId), ...pendingEnrols.map((e) => e.courseId)]),
  ].filter((x): x is string => !!x);
  const courseRows = courseIds.length
    ? await db.select({ id: courses.id, title: courses.title }).from(courses).where(inArray(courses.id, courseIds))
    : [];
  const courseById = new Map(courseRows.map((c) => [c.id, c.title]));

  // Assemble one entry per student-with-something-pending.
  type Entry = {
    studentId: string;
    studentName: string;
    studentPhone: string;
    counsellorId: string | null;
    counsellorName: string | null;
    admissionId: string | null;
    admissionNo: string | null;
    courseTitle: string | null;
    feeAmount: number | null;
    confirmedPaid: number | null;
    paymentStatus: string | null;
    pendingPayments: {
      id: string;
      amount: number;
      method: string;
      reference: string | null;
      note: string | null;
      collectedByName: string | null;
      createdAt: Date;
    }[];
    pendingEnrollment: { id: string; batchName: string; enrolledAt: Date } | null;
  };
  const entries = new Map<string, Entry>();

  const ensure = (studentId: string): Entry => {
    let e = entries.get(studentId);
    if (!e) {
      const person = personById.get(studentId);
      e = {
        studentId,
        studentName: person?.name ?? 'Unknown',
        studentPhone: person?.phone ?? '',
        counsellorId: null,
        counsellorName: null,
        admissionId: null,
        admissionNo: null,
        courseTitle: null,
        feeAmount: null,
        confirmedPaid: null,
        paymentStatus: null,
        pendingPayments: [],
        pendingEnrollment: null,
      };
      entries.set(studentId, e);
    }
    return e;
  };

  const applyAdmission = (e: Entry, a: (typeof admissionRows)[number] | (typeof extraAdmissions)[number]) => {
    e.admissionId = a.id;
    e.admissionNo = a.admissionNo;
    e.counsellorId = a.counsellorId;
    e.counsellorName = a.counsellorId ? personById.get(a.counsellorId)?.name ?? null : null;
    e.courseTitle = a.courseId ? courseById.get(a.courseId) ?? null : null;
    e.feeAmount = a.feeAmount;
    e.confirmedPaid = a.amountPaid;
    e.paymentStatus = a.paymentStatus;
  };

  for (const p of pendingPayments) {
    const adm = admissionById.get(p.admissionId);
    if (!adm) continue;
    const e = ensure(adm.studentId);
    applyAdmission(e, adm);
    e.pendingPayments.push({
      id: p.id,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      note: p.note,
      collectedByName: p.collectedBy ? personById.get(p.collectedBy)?.name ?? null : null,
      createdAt: p.createdAt,
    });
  }

  for (const en of pendingEnrols) {
    const e = ensure(en.userId);
    if (!e.admissionId) {
      const adm = extraAdmissions.find((a) => a.studentId === en.userId && a.courseId === en.courseId)
        ?? extraAdmissions.find((a) => a.studentId === en.userId);
      if (adm) applyAdmission(e, adm);
    }
    e.pendingEnrollment = { id: en.id, batchName: en.batchName, enrolledAt: en.enrolledAt };
  }

  let list = [...entries.values()];
  if (counsellorId) list = list.filter((e) => e.counsellorId === counsellorId);

  // Oldest first: the queue is a backlog, and the student waiting longest is
  // the one whose counsellor is getting phone calls.
  list.sort((a, b) => {
    const ta = a.pendingPayments[0]?.createdAt ?? a.pendingEnrollment?.enrolledAt ?? new Date();
    const tb = b.pendingPayments[0]?.createdAt ?? b.pendingEnrollment?.enrolledAt ?? new Date();
    return ta.getTime() - tb.getTime();
  });

  return list;
}

// ── Per-counsellor summary ────────────────────────────────────────────────────
// The finance manager's view over 40+ counsellors: who has how much money
// claimed-but-unconfirmed, and how many students waiting.
export async function counsellorSummary() {
  const rows = await db
    .select({
      counsellorId: admissions.counsellorId,
      counsellorName: users.name,
      pendingAmount: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'pending'), 0)`,
      pendingCount: sql<number>`count(${payments.id}) filter (where ${payments.status} = 'pending')`,
      confirmedAmount: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'verified'), 0)`,
    })
    .from(payments)
    .innerJoin(admissions, eq(admissions.id, payments.admissionId))
    .leftJoin(users, eq(users.id, admissions.counsellorId))
    .groupBy(admissions.counsellorId, users.name)
    .orderBy(desc(sql`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'pending'), 0)`));

  return rows.map((r) => ({
    counsellorId: r.counsellorId,
    counsellorName: r.counsellorName ?? '(unassigned)',
    pendingAmount: round2(Number(r.pendingAmount)),
    pendingCount: Number(r.pendingCount),
    confirmedAmount: round2(Number(r.confirmedAmount)),
  }));
}

// ── Verify one payment ────────────────────────────────────────────────────────
export async function verifyPayment(paymentId: string, adminId: string) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) throw err('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    if (payment.status !== 'pending') throw err('This payment has already been reviewed', 400, 'ALREADY_REVIEWED');

    await tx
      .update(payments)
      .set({ status: 'verified', verifiedBy: adminId, verifiedAt: new Date() })
      .where(eq(payments.id, paymentId));

    // Money is now real: apply it to installments oldest-first, exactly as an
    // admin-recorded payment would have been at record time.
    let remaining = payment.amount;
    const instTargets = payment.installmentId
      ? await tx.select().from(admissionInstallments).where(eq(admissionInstallments.id, payment.installmentId))
      : await tx
          .select()
          .from(admissionInstallments)
          .where(and(eq(admissionInstallments.admissionId, payment.admissionId), eq(admissionInstallments.status, 'pending')))
          .orderBy(asc(admissionInstallments.seq));
    for (const inst of instTargets) {
      if (remaining <= 0) break;
      const owed = round2(inst.amount - inst.paidAmount);
      if (owed <= 0) continue;
      const applied = Math.min(owed, remaining);
      const newPaid = round2(inst.paidAmount + applied);
      await tx
        .update(admissionInstallments)
        .set({ paidAmount: newPaid, status: newPaid + 0.01 >= inst.amount ? 'paid' : 'pending', updatedAt: new Date() })
        .where(eq(admissionInstallments.id, inst.id));
      remaining = round2(remaining - applied);
    }

    // Recompute the confirmed-money rollup.
    const [adm] = await tx.select().from(admissions).where(eq(admissions.id, payment.admissionId)).limit(1);
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(eq(payments.admissionId, payment.admissionId), eq(payments.status, 'verified')));
    const amountPaid = round2(Number(total));
    const paymentStatus = amountPaid <= 0 ? 'pending' : amountPaid + 0.01 >= (adm?.feeAmount ?? 0) ? 'paid' : 'partial';
    await tx
      .update(admissions)
      .set({ amountPaid, paymentStatus, updatedAt: new Date() })
      .where(eq(admissions.id, payment.admissionId));

    return { paymentId, admissionId: payment.admissionId, amountPaid, paymentStatus };
  });
}

// ── Reject one payment ────────────────────────────────────────────────────────
export async function rejectPayment(paymentId: string, adminId: string, reason?: string) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw err('Payment not found', 404, 'PAYMENT_NOT_FOUND');
  if (payment.status !== 'pending') throw err('This payment has already been reviewed', 400, 'ALREADY_REVIEWED');

  await db
    .update(payments)
    .set({ status: 'rejected', verifiedBy: adminId, verifiedAt: new Date(), note: reason ? `${payment.note ? payment.note + ' | ' : ''}REJECTED: ${reason}` : payment.note })
    .where(eq(payments.id, paymentId));

  // The counsellor who claimed it needs to know their entry bounced — they
  // are the one who has to chase the student or fix the reference.
  if (payment.collectedBy) {
    try {
      await sendNotificationToUser(
        payment.collectedBy,
        'Payment entry rejected',
        `A payment of ₹${payment.amount} you recorded${payment.reference ? ` (ref ${payment.reference})` : ''} could not be confirmed${reason ? `: ${reason}` : '.'}`,
        'admission_update',
        { paymentId },
      );
    } catch (e) {
      logger.warn({ e, paymentId }, 'Could not notify counsellor of rejected payment');
    }
  }

  return { paymentId, status: 'rejected' as const };
}

// ── Activate a pending enrolment ─────────────────────────────────────────────
export async function activateEnrollment(enrollmentId: string) {
  const [enrol] = await db
    .select({
      id: batchEnrollments.id,
      userId: batchEnrollments.userId,
      status: batchEnrollments.status,
      batchName: batches.name,
    })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batches.id, batchEnrollments.batchId))
    .where(eq(batchEnrollments.id, enrollmentId))
    .limit(1);
  if (!enrol) throw err('Enrollment not found', 404, 'ENROLLMENT_NOT_FOUND');
  if (enrol.status !== 'pending_approval') throw err('This enrollment is not awaiting approval', 400, 'NOT_PENDING');

  await db.update(batchEnrollments).set({ status: 'active' }).where(eq(batchEnrollments.id, enrollmentId));

  try {
    await sendNotificationToUser(
      enrol.userId,
      'You are enrolled',
      `Your payment is confirmed. You now have access to ${enrol.batchName}.`,
      'admission_update',
      { batchName: enrol.batchName },
    );
  } catch (e) {
    logger.warn({ e, enrollmentId }, 'Could not notify student of activation');
  }

  return { enrollmentId, status: 'active' as const };
}
