import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../lib/db.js';
import { admissions, users, batches, courses, counsellorTargets } from '../../../drizzle/schema.js';
import type { UpdatePaymentInput, SetTargetInput } from './admissions.schema.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

const counsellor = alias(users, 'counsellor');

export async function listAdmissions(opts: {
  page: number; limit: number; counsellorId: string; viewAll: boolean;
  batchId?: string; branchId?: string; paymentStatus?: string; search?: string;
}) {
  const conds = [];
  if (!opts.viewAll) conds.push(eq(admissions.counsellorId, opts.counsellorId));
  if (opts.batchId) conds.push(eq(admissions.batchId, opts.batchId));
  if (opts.branchId) conds.push(eq(admissions.branchId, opts.branchId));
  if (opts.paymentStatus) conds.push(eq(admissions.paymentStatus, opts.paymentStatus as never));
  if (opts.search) conds.push(or(ilike(admissions.admissionNo, `%${opts.search}%`), ilike(users.name, `%${opts.search}%`))!);
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(admissions).leftJoin(users, eq(users.id, admissions.studentId)).where(where);
  const items = await db
    .select({
      id: admissions.id, admissionNo: admissions.admissionNo, admissionDate: admissions.admissionDate,
      feeAmount: admissions.feeAmount, amountPaid: admissions.amountPaid, paymentStatus: admissions.paymentStatus,
      feePlan: admissions.feePlan, studentName: users.name, studentPhone: users.phone,
      batchName: batches.name, courseTitle: courses.title,
      counsellorName: counsellor.name,
    })
    .from(admissions)
    .leftJoin(users, eq(users.id, admissions.studentId))
    .leftJoin(batches, eq(batches.id, admissions.batchId))
    .leftJoin(courses, eq(courses.id, admissions.courseId))
    .leftJoin(counsellor, eq(counsellor.id, admissions.counsellorId))
    .where(where)
    .orderBy(desc(admissions.createdAt))
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);
  return { items, total };
}

export async function updatePayment(id: string, input: UpdatePaymentInput) {
  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
  const [adm] = await db.update(admissions).set(patch).where(eq(admissions.id, id)).returning();
  if (!adm) throw err('Admission not found', 404, 'ADMISSION_NOT_FOUND');
  return adm;
}

export async function setTarget(input: SetTargetInput) {
  const [row] = await db
    .insert(counsellorTargets)
    .values({ counsellorId: input.counsellorId, period: input.period, targetAdmissions: input.targetAdmissions, targetRevenue: input.targetRevenue })
    .onConflictDoUpdate({
      target: [counsellorTargets.counsellorId, counsellorTargets.period],
      set: { targetAdmissions: input.targetAdmissions, targetRevenue: input.targetRevenue, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function getTarget(counsellorId: string, period: string) {
  const [row] = await db
    .select()
    .from(counsellorTargets)
    .where(and(eq(counsellorTargets.counsellorId, counsellorId), eq(counsellorTargets.period, period)))
    .limit(1);
  return row ?? null;
}
