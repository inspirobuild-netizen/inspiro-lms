import { and, asc, count, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../lib/db.js';
import {
  admissionInstallments,
  admissions,
  branches,
  courses,
  feePlans,
  payments,
  users,
} from '../../../drizzle/schema.js';
import type { CreateFeePlanInput, FeesOverviewQuery, RecordPaymentInput, UpdateFeePlanInput } from './fees.schema.js';

const counsellorAlias = alias(users, 'counsellor');

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Fee plans ─────────────────────────────────────────────────────────────────

export async function listFeePlans(courseId: string, activeOnly = false) {
  const conds = [eq(feePlans.courseId, courseId)];
  if (activeOnly) conds.push(eq(feePlans.isActive, true));
  return db
    .select()
    .from(feePlans)
    .where(and(...conds))
    .orderBy(asc(feePlans.sortOrder), asc(feePlans.createdAt));
}

export async function createFeePlan(courseId: string, input: CreateFeePlanInput) {
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw err('Course not found', 404, 'COURSE_NOT_FOUND');

  const [plan] = await db.insert(feePlans).values({ courseId, ...input }).returning();
  return plan!;
}

export async function updateFeePlan(planId: string, input: UpdateFeePlanInput) {
  // When only one of totalAmount/installments changes, re-validate against the
  // stored counterpart — the schema can only cross-check what was supplied.
  const [existing] = await db.select().from(feePlans).where(eq(feePlans.id, planId)).limit(1);
  if (!existing) throw err('Fee plan not found', 404, 'FEE_PLAN_NOT_FOUND');

  const nextTotal = input.totalAmount ?? existing.totalAmount;
  const nextInstallments = input.installments ?? existing.installments;
  const sum = nextInstallments.reduce((s, i) => s + i.amount, 0);
  if (Math.abs(sum - nextTotal) >= 0.01) {
    throw err('Installment amounts must sum to the plan total', 400, 'FEE_PLAN_UNBALANCED');
  }

  const [plan] = await db
    .update(feePlans)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(feePlans.id, planId))
    .returning();
  return plan!;
}

export async function deleteFeePlan(planId: string) {
  const result = await db.delete(feePlans).where(eq(feePlans.id, planId)).returning();
  if (result.length === 0) throw err('Fee plan not found', 404, 'FEE_PLAN_NOT_FOUND');
  return { deleted: true };
}

export async function setCourseFee(courseId: string, feeAmount: number) {
  const [course] = await db
    .update(courses)
    .set({ feeAmount, updatedAt: new Date() })
    .where(eq(courses.id, courseId))
    .returning({ id: courses.id, title: courses.title, feeAmount: courses.feeAmount });
  if (!course) throw err('Course not found', 404, 'COURSE_NOT_FOUND');
  return course;
}

// ── Installments ──────────────────────────────────────────────────────────────

/**
 * Materialise a fee plan into real installment rows for an admission.
 * Exported so convertLead can call it inside its own transaction.
 */
export async function materialiseInstallments(
  tx: Pick<typeof db, 'insert'>,
  admissionId: string,
  plan: { installments: { label: string; amount: number; dueAfterDays: number }[] },
  admissionDate: Date,
) {
  const rows = plan.installments.map((inst, i) => {
    const due = new Date(admissionDate);
    due.setDate(due.getDate() + inst.dueAfterDays);
    return {
      admissionId,
      seq: i + 1,
      label: inst.label,
      amount: inst.amount,
      dueDate: due.toISOString().slice(0, 10),
    };
  });
  return tx.insert(admissionInstallments).values(rows).returning();
}

export async function listInstallments(admissionId: string) {
  return db
    .select()
    .from(admissionInstallments)
    .where(eq(admissionInstallments.admissionId, admissionId))
    .orderBy(asc(admissionInstallments.seq));
}

// ── Payments ──────────────────────────────────────────────────────────────────

/**
 * Record a payment against an admission (optionally targeting a specific
 * installment), then recompute the admission's amountPaid/paymentStatus
 * rollup from the ledger. All in one transaction so the rollup can never
 * drift from the underlying payment rows.
 */
export async function recordPayment(admissionId: string, input: RecordPaymentInput, collectedBy: string) {
  return db.transaction(async (tx) => {
    const [adm] = await tx.select().from(admissions).where(eq(admissions.id, admissionId)).limit(1);
    if (!adm) throw err('Admission not found', 404, 'ADMISSION_NOT_FOUND');

    const [{ paidSoFar }] = await tx
      .select({ paidSoFar: sql<number>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.admissionId, admissionId));

    if (round2(Number(paidSoFar) + input.amount) > round2(adm.feeAmount) + 0.01) {
      throw err(
        `Payment exceeds the outstanding balance (₹${round2(adm.feeAmount - Number(paidSoFar))} remaining)`,
        400,
        'PAYMENT_EXCEEDS_BALANCE',
      );
    }

    if (input.installmentId) {
      const [inst] = await tx
        .select()
        .from(admissionInstallments)
        .where(and(eq(admissionInstallments.id, input.installmentId), eq(admissionInstallments.admissionId, admissionId)))
        .limit(1);
      if (!inst) throw err('Installment not found for this admission', 404, 'INSTALLMENT_NOT_FOUND');
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        admissionId,
        installmentId: input.installmentId ?? null,
        amount: input.amount,
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
        collectedBy,
      })
      .returning();

    // Apply to the targeted installment, else oldest-unpaid first.
    let remaining = input.amount;
    const targets = input.installmentId
      ? await tx.select().from(admissionInstallments).where(eq(admissionInstallments.id, input.installmentId))
      : await tx
          .select()
          .from(admissionInstallments)
          .where(and(eq(admissionInstallments.admissionId, admissionId), eq(admissionInstallments.status, 'pending')))
          .orderBy(asc(admissionInstallments.seq));

    for (const inst of targets) {
      if (remaining <= 0) break;
      const owed = round2(inst.amount - inst.paidAmount);
      if (owed <= 0) continue;
      const applied = Math.min(owed, remaining);
      const newPaid = round2(inst.paidAmount + applied);
      await tx
        .update(admissionInstallments)
        .set({
          paidAmount: newPaid,
          status: newPaid + 0.01 >= inst.amount ? 'paid' : 'pending',
          updatedAt: new Date(),
        })
        .where(eq(admissionInstallments.id, inst.id));
      remaining = round2(remaining - applied);
    }

    // Recompute the rollup from the ledger — never incremented blindly.
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.admissionId, admissionId));
    const amountPaid = round2(Number(total));
    const paymentStatus = amountPaid <= 0 ? 'pending' : amountPaid + 0.01 >= adm.feeAmount ? 'paid' : 'partial';

    const [updated] = await tx
      .update(admissions)
      .set({ amountPaid, paymentStatus, updatedAt: new Date() })
      .where(eq(admissions.id, admissionId))
      .returning();

    return { payment: payment!, admission: updated! };
  });
}

export async function listPayments(admissionId: string) {
  return db
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      reference: payments.reference,
      note: payments.note,
      createdAt: payments.createdAt,
      installmentId: payments.installmentId,
      collectedByName: users.name,
    })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.collectedBy))
    .where(eq(payments.admissionId, admissionId))
    .orderBy(desc(payments.createdAt));
}

// ── Overview / outstanding ──────────────────────────────────────────────────────

function overviewFilters(q: FeesOverviewQuery) {
  const conds = [];
  if (q.branchId) conds.push(eq(admissions.branchId, q.branchId));
  if (q.counsellorId) conds.push(eq(admissions.counsellorId, q.counsellorId));
  if (q.courseId) conds.push(eq(admissions.courseId, q.courseId));
  if (q.from) conds.push(gte(admissions.admissionDate, q.from));
  if (q.to) conds.push(lte(admissions.admissionDate, q.to));
  return conds.length ? and(...conds) : undefined;
}

export async function getFeesOverview(q: FeesOverviewQuery) {
  const where = overviewFilters(q);
  const billedExpr = sql<number>`coalesce(sum(${admissions.feeAmount}), 0)`;
  const collectedExpr = sql<number>`coalesce(sum(${admissions.amountPaid}), 0)`;

  const [totalsRow] = await db
    .select({ admissions: count(), billed: billedExpr, collected: collectedExpr })
    .from(admissions).where(where);

  const [{ value: overdueAmount }] = await db
    .select({ value: sql<number>`coalesce(sum(${admissionInstallments.amount} - ${admissionInstallments.paidAmount}), 0)` })
    .from(admissionInstallments)
    .innerJoin(admissions, eq(admissions.id, admissionInstallments.admissionId))
    .where(and(where, eq(admissionInstallments.status, 'pending'), lt(admissionInstallments.dueDate, new Date().toISOString().slice(0, 10))));

  const [byBranch, byCounsellor, byCourse] = await Promise.all([
    db.select({ id: branches.id, name: branches.name, admissions: count(), billed: billedExpr, collected: collectedExpr })
      .from(admissions).innerJoin(branches, eq(branches.id, admissions.branchId)).where(where)
      .groupBy(branches.id, branches.name).orderBy(desc(count())),
    db.select({ id: users.id, name: users.name, admissions: count(), billed: billedExpr, collected: collectedExpr })
      .from(admissions).innerJoin(users, eq(users.id, admissions.counsellorId)).where(where)
      .groupBy(users.id, users.name).orderBy(desc(count())),
    db.select({ id: courses.id, name: courses.title, admissions: count(), billed: billedExpr, collected: collectedExpr })
      .from(admissions).innerJoin(courses, eq(courses.id, admissions.courseId)).where(where)
      .groupBy(courses.id, courses.title).orderBy(desc(count())),
  ]);

  const billed = Number(totalsRow?.billed ?? 0);
  const collected = Number(totalsRow?.collected ?? 0);
  const withOutstanding = (rows: { billed: number; collected: number }[]) =>
    rows.map((r) => ({ ...r, outstanding: round2(Number(r.billed) - Number(r.collected)) }));

  return {
    totals: { admissions: totalsRow?.admissions ?? 0, billed, collected, outstanding: round2(billed - collected), overdue: round2(Number(overdueAmount)) },
    byBranch: withOutstanding(byBranch),
    byCounsellor: withOutstanding(byCounsellor),
    byCourse: withOutstanding(byCourse),
  };
}

export async function getOutstandingInstallments(q: FeesOverviewQuery & { page: number; limit: number }) {
  const admissionWhere = overviewFilters(q);
  const conds = [eq(admissionInstallments.status, 'pending')];
  if (admissionWhere) conds.push(admissionWhere);
  const where = and(...conds);

  const [{ total }] = await db
    .select({ total: count() })
    .from(admissionInstallments)
    .innerJoin(admissions, eq(admissions.id, admissionInstallments.admissionId))
    .where(where);

  const items = await db
    .select({
      installmentId: admissionInstallments.id,
      label: admissionInstallments.label,
      amount: admissionInstallments.amount,
      paidAmount: admissionInstallments.paidAmount,
      dueDate: admissionInstallments.dueDate,
      admissionId: admissions.id,
      admissionNo: admissions.admissionNo,
      studentName: users.name,
      studentPhone: users.phone,
      counsellorName: counsellorAlias.name,
      branchName: branches.name,
    })
    .from(admissionInstallments)
    .innerJoin(admissions, eq(admissions.id, admissionInstallments.admissionId))
    .leftJoin(users, eq(users.id, admissions.studentId))
    .leftJoin(counsellorAlias, eq(counsellorAlias.id, admissions.counsellorId))
    .leftJoin(branches, eq(branches.id, admissions.branchId))
    .where(where)
    .orderBy(asc(admissionInstallments.dueDate))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  return { items, total };
}

// ── UPI ───────────────────────────────────────────────────────────────────────

/**
 * Build a UPI deep link for a given admission + amount. Note this is a plain
 * collect-request QR: the payment lands directly in the payee account and the
 * system gets NO callback — receipt must be confirmed by a human via
 * recordPayment. Kept server-side so amount/reference are authoritative.
 */
export async function buildUpiRequest(admissionId: string, amount: number) {
  const [row] = await db
    .select({
      admissionNo: admissions.admissionNo,
      studentName: users.name,
      branchVpa: branches.upiVpa,
      branchPayee: branches.upiPayeeName,
    })
    .from(admissions)
    .leftJoin(users, eq(users.id, admissions.studentId))
    .leftJoin(branches, eq(branches.id, admissions.branchId))
    .where(eq(admissions.id, admissionId))
    .limit(1);
  if (!row) throw err('Admission not found', 404, 'ADMISSION_NOT_FOUND');

  const vpa = row.branchVpa ?? process.env['UPI_VPA'];
  const payeeName = row.branchPayee ?? process.env['UPI_PAYEE_NAME'] ?? 'Inspiro IAS Academy';
  if (!vpa) {
    throw err(
      'No UPI ID configured. Set one on the branch, or the UPI_VPA environment variable.',
      400,
      'UPI_NOT_CONFIGURED',
    );
  }

  const reference = `${row.admissionNo}-${Date.now().toString(36).toUpperCase()}`;
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: `Fee ${row.admissionNo}`,
    tr: reference,
  });

  return {
    upiUri: `upi://pay?${params.toString()}`,
    amount: round2(amount),
    reference,
    payeeName,
    vpa,
    studentName: row.studentName,
    admissionNo: row.admissionNo,
  };
}
