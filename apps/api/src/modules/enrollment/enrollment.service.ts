import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  enrollmentRequests,
  leads,
  leadStatusHistory,
  admissions,
  batches,
  batchEnrollments,
  courses,
  feePlans,
  users,
} from '../../../drizzle/schema.js';
import { buildUpiRequestForLead, materialiseInstallments, recordPayment } from '../fees/fees.service.js';
import { nextCode } from '../leads/leads.service.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import type { ConfirmEnrollRequestInput, CreateEnrollRequestInput, VerifyEnrollRequestInput } from './enrollment.schema.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// A student's app-originated interest is tracked as a lead exactly like a
// counsellor-sourced one, just unowned until staff assigns it. Reused across
// repeated enroll attempts (e.g. switching plans) rather than duplicating.
async function ensureLead(studentId: string) {
  const [student] = await db.select().from(users).where(eq(users.id, studentId)).limit(1);
  if (!student) throw err('Student not found', 404, 'STUDENT_NOT_FOUND');

  const [existing] = await db.select().from(leads).where(eq(leads.phone, student.phone)).limit(1);
  if (existing) return existing;

  const leadCode = await nextCode(db, 'lead_seq', 'LEAD');
  const [lead] = await db
    .insert(leads)
    .values({
      leadCode,
      studentName: student.name,
      phone: student.phone,
      email: student.email,
      source: 'mobile_app',
      priority: 'warm',
      ownerId: null,
      createdBy: studentId,
    })
    .returning();
  await db.insert(leadStatusHistory).values({ leadId: lead!.id, toStatus: 'new', changedBy: studentId });
  return lead!;
}

// Resolve the amount to collect right now — a plan's chosen installment, or
// the course's full preset fee. Never a number the student's client sends.
async function resolveAmount(courseId: string, feePlanId: string | undefined, installmentIndex: number) {
  if (feePlanId) {
    const [plan] = await db.select().from(feePlans).where(eq(feePlans.id, feePlanId)).limit(1);
    if (!plan) throw err('Fee plan not found', 404, 'FEE_PLAN_NOT_FOUND');
    if (plan.courseId !== courseId) throw err('Fee plan does not belong to this course', 400, 'FEE_PLAN_COURSE_MISMATCH');
    const inst = plan.installments[installmentIndex];
    if (!inst) throw err('Invalid installment selection', 400, 'INVALID_INSTALLMENT');
    return { amount: round2(inst.amount), feePlanId: plan.id as string | undefined };
  }
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw err('Course not found', 404, 'COURSE_NOT_FOUND');
  if (course.feeAmount <= 0) throw err('This course has no fee configured', 400, 'NO_FEE_CONFIGURED');
  return { amount: round2(course.feeAmount), feePlanId: undefined as string | undefined };
}

// ── Student: create/refresh a pending enroll request + its QR ──────────────
export async function createEnrollRequest(studentId: string, input: CreateEnrollRequestInput) {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, input.courseId), eq(courses.isPublished, true)))
    .limit(1);
  if (!course) throw err('Course not found', 404, 'COURSE_NOT_FOUND');

  const { amount, feePlanId } = await resolveAmount(input.courseId, input.feePlanId, input.installmentIndex);
  const lead = await ensureLead(studentId);

  // Reuse an existing pending request for the same course rather than piling
  // up duplicates if the student re-opens the enroll flow.
  const [existing] = await db
    .select()
    .from(enrollmentRequests)
    .where(and(eq(enrollmentRequests.studentId, studentId), eq(enrollmentRequests.courseId, input.courseId), eq(enrollmentRequests.status, 'pending')))
    .limit(1);

  const [row] = existing
    ? await db
        .update(enrollmentRequests)
        .set({ feePlanId, amount, reference: null, updatedAt: new Date() })
        .where(eq(enrollmentRequests.id, existing.id))
        .returning()
    : await db
        .insert(enrollmentRequests)
        .values({ studentId, leadId: lead.id, courseId: input.courseId, feePlanId, amount, method: 'upi' })
        .returning();

  const qr = await buildUpiRequestForLead(lead.id, amount, input.accountId);
  return { request: row!, qr };
}

// ── Student: submit "I've paid" reference (does not auto-confirm) ──────────
export async function confirmEnrollRequest(studentId: string, requestId: string, input: ConfirmEnrollRequestInput) {
  const [reqRow] = await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.id, requestId)).limit(1);
  if (!reqRow) throw err('Enrollment request not found', 404, 'NOT_FOUND');
  if (reqRow.studentId !== studentId) throw err('Not your enrollment request', 403, 'FORBIDDEN');
  if (reqRow.status !== 'pending') throw err('This request has already been processed', 400, 'ALREADY_PROCESSED');

  const [updated] = await db
    .update(enrollmentRequests)
    .set({ reference: input.reference.trim(), updatedAt: new Date() })
    .where(eq(enrollmentRequests.id, requestId))
    .returning();
  return updated!;
}

// ── Student: my requests ────────────────────────────────────────────────────
export async function listMyEnrollRequests(studentId: string) {
  return db
    .select()
    .from(enrollmentRequests)
    .where(eq(enrollmentRequests.studentId, studentId))
    .orderBy(desc(enrollmentRequests.createdAt));
}

// ── Admin: verification queue ───────────────────────────────────────────────
export async function listEnrollRequests(status?: string) {
  const conds = [];
  if (status) conds.push(eq(enrollmentRequests.status, status as never));
  const where = conds.length ? and(...conds) : undefined;
  return db
    .select({
      id: enrollmentRequests.id,
      studentId: enrollmentRequests.studentId,
      studentName: users.name,
      studentPhone: users.phone,
      courseId: enrollmentRequests.courseId,
      courseTitle: courses.title,
      amount: enrollmentRequests.amount,
      method: enrollmentRequests.method,
      reference: enrollmentRequests.reference,
      status: enrollmentRequests.status,
      createdAt: enrollmentRequests.createdAt,
    })
    .from(enrollmentRequests)
    .innerJoin(users, eq(users.id, enrollmentRequests.studentId))
    .innerJoin(courses, eq(courses.id, enrollmentRequests.courseId))
    .where(where)
    .orderBy(desc(enrollmentRequests.createdAt));
}

// ── Admin: verify — materialise a real admission + record the payment ──────
// Mirrors convertLead exactly: resolve everything server-side inside one
// transaction, then record the payment (its own transaction) only after
// that one commits — a payment ledger write must never roll back alongside
// an already-successful admission.
export async function verifyEnrollRequest(requestId: string, input: VerifyEnrollRequestInput, staffId: string) {
  const result = db.transaction(async (tx) => {
    const [reqRow] = await tx.select().from(enrollmentRequests).where(eq(enrollmentRequests.id, requestId)).limit(1);
    if (!reqRow) throw err('Enrollment request not found', 404, 'NOT_FOUND');
    if (reqRow.status !== 'pending') throw err('This request has already been processed', 400, 'ALREADY_PROCESSED');
    if (!reqRow.reference) throw err('Student has not submitted a payment reference yet', 400, 'NO_REFERENCE');

    const [batch] = await tx.select().from(batches).where(eq(batches.id, input.batchId)).limit(1);
    if (!batch) throw err('Batch not found', 400, 'BATCH_NOT_FOUND');
    if (batch.courseId !== reqRow.courseId) throw err("Batch does not belong to this request's course", 400, 'BATCH_COURSE_MISMATCH');

    let plan: { id: string; name: string; totalAmount: number; installments: { label: string; amount: number; dueAfterDays: number }[] } | null = null;
    let feeAmount = reqRow.amount;
    if (reqRow.feePlanId) {
      const [p] = await tx.select().from(feePlans).where(eq(feePlans.id, reqRow.feePlanId)).limit(1);
      if (p) { plan = p; feeAmount = p.totalAmount; }
    } else {
      const [c] = await tx.select({ feeAmount: courses.feeAmount }).from(courses).where(eq(courses.id, reqRow.courseId)).limit(1);
      feeAmount = c?.feeAmount ?? reqRow.amount;
    }

    const [{ enrolled }] = await tx
      .select({ enrolled: count() })
      .from(batchEnrollments)
      .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, 'active')));
    if (Number(enrolled) >= batch.capacity) throw err('Batch is at full capacity', 409, 'BATCH_FULL');
    await tx.insert(batchEnrollments).values({ userId: reqRow.studentId, batchId: input.batchId, status: 'active' });

    const admissionNo = await nextCode(tx, 'adm_seq', 'ADM');
    const [admission] = await tx
      .insert(admissions)
      .values({
        admissionNo,
        studentId: reqRow.studentId,
        leadId: reqRow.leadId,
        counsellorId: staffId,
        courseId: reqRow.courseId,
        batchId: input.batchId,
        admissionDate: new Date().toISOString().slice(0, 10),
        feePlanId: plan?.id,
        feePlan: plan?.name,
        feeAmount,
        amountPaid: 0,
        paymentStatus: 'pending',
      })
      .returning();

    if (plan) await materialiseInstallments(tx, admission!.id, plan, new Date());

    await tx
      .update(enrollmentRequests)
      .set({ status: 'verified', verifiedBy: staffId, verifiedAt: new Date(), resultingAdmissionId: admission!.id, updatedAt: new Date() })
      .where(eq(enrollmentRequests.id, requestId));

    if (reqRow.leadId) {
      await tx
        .update(leads)
        .set({ status: 'converted', convertedStudentId: reqRow.studentId, convertedAt: new Date(), updatedAt: new Date() })
        .where(eq(leads.id, reqRow.leadId));
      await tx.insert(leadStatusHistory).values({ leadId: reqRow.leadId, toStatus: 'converted', changedBy: staffId });
    }

    return { admissionId: admission!.id, admissionNo, studentId: reqRow.studentId, amount: reqRow.amount, method: reqRow.method, reference: reqRow.reference! };
  });

  const finish = async () => {
    const r = await result;
    await recordPayment(r.admissionId, { amount: r.amount, method: r.method, reference: r.reference }, staffId);
    await sendNotificationToUser(r.studentId, 'Admission confirmed', 'Your payment has been verified and course access is now active.', 'admission_update');
    return r;
  };
  return finish();
}

// ── Admin: reject ────────────────────────────────────────────────────────────
export async function rejectEnrollRequest(requestId: string, reason: string | undefined, staffId: string) {
  const [reqRow] = await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.id, requestId)).limit(1);
  if (!reqRow) throw err('Enrollment request not found', 404, 'NOT_FOUND');
  if (reqRow.status !== 'pending') throw err('This request has already been processed', 400, 'ALREADY_PROCESSED');

  const [updated] = await db
    .update(enrollmentRequests)
    .set({ status: 'rejected', rejectionReason: reason ?? null, verifiedBy: staffId, verifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(enrollmentRequests.id, requestId))
    .returning();

  await sendNotificationToUser(
    reqRow.studentId,
    'Payment could not be verified',
    reason ?? 'Please contact admissions for help with your enrollment.',
    'admission_update',
  );
  return updated!;
}
