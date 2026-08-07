import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  leads,
  leadFollowups,
  leadStatusHistory,
  admissions,
  users,
  batches,
  batchEnrollments,
  feePlans,
} from '../../../drizzle/schema.js';
import { hashPassword } from '../../lib/password.js';
import { sendNotificationToUser, notifyAdmins } from '../notifications/notifications.service.js';
import { sendEmail, studentWelcomeEmail } from '../../lib/mailer.js';
import { materialiseInstallments, recordPayment } from '../fees/fees.service.js';
import type { CreateLeadInput, UpdateLeadInput, ConvertLeadInput } from './leads.schema.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

// Active pipeline stages shown on the Kanban board (excludes terminal states).
export const PIPELINE_STAGES = ['new', 'contacted', 'interested', 'demo', 'counselling', 'fee_discussion', 'admission_confirmed'] as const;

async function nextCode(exec: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, seq: 'lead_seq' | 'adm_seq', prefix: string): Promise<string> {
  const q = seq === 'lead_seq' ? sql`SELECT nextval('lead_seq')::int AS v` : sql`SELECT nextval('adm_seq')::int AS v`;
  const res = (await exec.execute(q)) as unknown as { rows: { v: number }[] };
  return `${prefix}-${String(res.rows[0]!.v).padStart(5, '0')}`;
}

const ownerName = sql<string>`${users.name}`;

export async function listLeads(opts: {
  page: number;
  limit: number;
  status?: string;
  priority?: string;
  source?: string;
  search?: string;
  ownerId: string;
  viewAll: boolean;
}) {
  const conds = [];
  if (!opts.viewAll) conds.push(eq(leads.ownerId, opts.ownerId));
  if (opts.status) conds.push(eq(leads.status, opts.status as never));
  if (opts.priority) conds.push(eq(leads.priority, opts.priority as never));
  if (opts.source) conds.push(eq(leads.source, opts.source as never));
  if (opts.search) {
    const s = `%${opts.search}%`;
    conds.push(or(ilike(leads.studentName, s), ilike(leads.phone, s), ilike(leads.leadCode, s), ilike(leads.email, s))!);
  }
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(leads).where(where);
  const items = await db
    .select({
      id: leads.id, leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone,
      email: leads.email, city: leads.city, courseInterested: leads.courseInterested,
      source: leads.source, priority: leads.priority, status: leads.status,
      ownerId: leads.ownerId, ownerName, nextFollowupAt: leads.nextFollowupAt, createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);
  return { items, total };
}

export async function getPipeline(opts: { ownerId: string; viewAll: boolean }) {
  const conds = [inArray(leads.status, PIPELINE_STAGES as unknown as string[] as never[])];
  if (!opts.viewAll) conds.push(eq(leads.ownerId, opts.ownerId));
  const rows = await db
    .select({
      id: leads.id, leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone,
      courseInterested: leads.courseInterested, priority: leads.priority, status: leads.status,
      ownerId: leads.ownerId, ownerName, nextFollowupAt: leads.nextFollowupAt,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(and(...conds))
    .orderBy(desc(leads.updatedAt));
  return rows;
}

export async function getLead(id: string, opts: { ownerId: string; viewAll: boolean }) {
  const [lead] = await db
    .select({
      lead: leads,
      ownerName,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.ownerId))
    .where(eq(leads.id, id))
    .limit(1);
  if (!lead) throw err('Lead not found', 404, 'LEAD_NOT_FOUND');
  if (!opts.viewAll && lead.lead.ownerId !== opts.ownerId) throw err('Not your lead', 403, 'FORBIDDEN');
  return { ...lead.lead, ownerName: lead.ownerName };
}

export async function getFollowups(leadId: string) {
  return db
    .select({
      id: leadFollowups.id, remarks: leadFollowups.remarks, callSummary: leadFollowups.callSummary,
      nextAction: leadFollowups.nextAction, reminderAt: leadFollowups.reminderAt,
      createdAt: leadFollowups.createdAt, staffName: users.name,
    })
    .from(leadFollowups)
    .leftJoin(users, eq(users.id, leadFollowups.staffId))
    .where(eq(leadFollowups.leadId, leadId))
    .orderBy(desc(leadFollowups.createdAt));
}

export async function createLead(input: CreateLeadInput, creatorId: string, defaultOwner: string) {
  const leadCode = await nextCode(db, 'lead_seq', 'LEAD');
  const [lead] = await db
    .insert(leads)
    .values({
      leadCode,
      studentName: input.studentName,
      parentName: input.parentName,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      city: input.city,
      state: input.state,
      courseInterested: input.courseInterested,
      source: input.source,
      priority: input.priority,
      ownerId: input.ownerId ?? defaultOwner,
      branchId: input.branchId,
      remarks: input.remarks,
      nextFollowupAt: input.nextFollowupAt ? new Date(input.nextFollowupAt) : null,
      createdBy: creatorId,
    })
    .returning();
  await db.insert(leadStatusHistory).values({ leadId: lead!.id, toStatus: 'new', changedBy: creatorId });
  return lead!;
}

export async function updateLead(id: string, input: UpdateLeadInput) {
  const [before] = await db.select({ ownerId: leads.ownerId }).from(leads).where(eq(leads.id, id)).limit(1);
  if (!before) throw err('Lead not found', 404, 'LEAD_NOT_FOUND');

  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
  if (input.nextFollowupAt !== undefined) patch.nextFollowupAt = input.nextFollowupAt ? new Date(input.nextFollowupAt) : null;
  const [lead] = await db.update(leads).set(patch).where(eq(leads.id, id)).returning();
  if (!lead) throw err('Lead not found', 404, 'LEAD_NOT_FOUND');

  if (input.ownerId && input.ownerId !== before.ownerId) {
    await sendNotificationToUser(input.ownerId, 'New lead assigned', `${lead.studentName} (${lead.leadCode}) has been assigned to you.`, 'lead_assigned', { leadId: id });
  }
  return lead;
}

export async function addFollowup(
  leadId: string,
  staffId: string,
  input: { remarks: string; callSummary?: string; nextAction?: string; reminderAt?: string; nextFollowupAt?: string },
) {
  const [fu] = await db
    .insert(leadFollowups)
    .values({
      leadId, staffId, remarks: input.remarks, callSummary: input.callSummary,
      nextAction: input.nextAction, reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
    })
    .returning();
  if (input.nextFollowupAt !== undefined) {
    await db.update(leads).set({ nextFollowupAt: new Date(input.nextFollowupAt), updatedAt: new Date() }).where(eq(leads.id, leadId));
  }
  return fu!;
}

export async function changeStatus(leadId: string, toStatus: string, changedBy: string) {
  const [lead] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw err('Lead not found', 404, 'LEAD_NOT_FOUND');
  if (lead.status === 'converted') throw err('Converted leads cannot change status', 400, 'LEAD_CONVERTED');
  if (lead.status === toStatus) return lead;
  await db.update(leads).set({ status: toStatus as never, updatedAt: new Date() }).where(eq(leads.id, leadId));
  await db.insert(leadStatusHistory).values({ leadId, fromStatus: lead.status, toStatus: toStatus as never, changedBy });
  return { status: toStatus };
}

// ── Convert a lead into a verified student + admission (atomic) ────────────────
export async function convertLead(leadId: string, input: ConvertLeadInput, counsellorId: string) {
  const result = db.transaction(async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) throw err('Lead not found', 404, 'LEAD_NOT_FOUND');
    if (lead.status === 'converted') throw err('Lead already converted', 400, 'LEAD_CONVERTED');

    const [batch] = await tx.select().from(batches).where(eq(batches.id, input.batchId)).limit(1);
    if (!batch) throw err('Batch not found', 400, 'BATCH_NOT_FOUND');

    const phone = lead.phone.trim();
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (existing) throw err('A user with this phone already exists — enrol them manually', 409, 'PHONE_EXISTS');

    const passwordHash = input.password ? await hashPassword(input.password) : null;
    const [student] = await tx
      .insert(users)
      .values({
        name: lead.studentName,
        phone,
        email: lead.email ?? null,
        role: 'student',
        targetExam: input.targetExam ?? 'kerala_psc',
        branchId: lead.branchId ?? null,
        passwordHash,
      })
      .returning();

    // Capacity check
    const [{ enrolled }] = await tx
      .select({ enrolled: count() })
      .from(batchEnrollments)
      .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, 'active')));
    if (Number(enrolled) >= batch.capacity) throw err('Batch is at full capacity', 409, 'BATCH_FULL');
    await tx.insert(batchEnrollments).values({ userId: student!.id, batchId: input.batchId, status: 'active' });

    // Resolve fee: a preset plan (preferred, materialised into real
    // installment rows) or a manual amount when no plan applies. amountPaid/
    // paymentStatus are never trusted from input — they start at zero and are
    // only ever updated by the payments ledger (see recordPayment).
    let feePlan: string | undefined = input.feePlan;
    let feeAmount = input.feeAmount;
    let plan: { id: string; installments: { label: string; amount: number; dueAfterDays: number }[] } | null = null;
    if (input.feePlanId) {
      const [p] = await tx.select().from(feePlans).where(eq(feePlans.id, input.feePlanId)).limit(1);
      if (!p) throw err('Fee plan not found', 404, 'FEE_PLAN_NOT_FOUND');
      plan = p;
      feePlan = p.name;
      feeAmount = p.totalAmount;
    }
    if (input.collectAmount !== undefined && input.collectAmount > feeAmount + 0.01) {
      throw err('Amount to collect cannot exceed the fee', 400, 'COLLECT_EXCEEDS_FEE');
    }

    const admissionNo = await nextCode(tx, 'adm_seq', 'ADM');
    const admissionDate = input.admissionDate ?? new Date().toISOString().slice(0, 10);
    const [admission] = await tx
      .insert(admissions)
      .values({
        admissionNo,
        studentId: student!.id,
        leadId,
        counsellorId,
        courseId: input.courseId ?? null,
        batchId: input.batchId,
        branchId: lead.branchId ?? null,
        admissionDate,
        feePlanId: plan?.id,
        feePlan,
        feeAmount,
        amountPaid: 0,
        paymentStatus: 'pending',
      })
      .returning();

    if (plan) {
      await materialiseInstallments(tx, admission!.id, plan, new Date(admissionDate));
    }

    await tx
      .update(leads)
      .set({ status: 'converted', convertedStudentId: student!.id, convertedAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, leadId));
    await tx.insert(leadStatusHistory).values({ leadId, fromStatus: lead.status, toStatus: 'converted', changedBy: counsellorId });

    return {
      studentId: student!.id, admissionId: admission!.id, admissionNo,
      studentName: student!.name, studentEmail: student!.email, leadCode: lead.leadCode,
      passwordSet: !!input.password,
    };
  });

  // Notifications + the first-payment record fire after the transaction
  // commits — never let a delivery/payment hiccup roll back a successful
  // admission that's already been created.
  const finish = async () => {
    const r = await result;
    if (input.collectAmount) {
      await recordPayment(
        r.admissionId,
        { amount: input.collectAmount, method: input.collectMethod, reference: input.collectReference },
        counsellorId,
      );
    }
    if (r.passwordSet && r.studentEmail) {
      const { subject, html } = studentWelcomeEmail(r.studentName, r.studentEmail, input.password!);
      void sendEmail({ to: r.studentEmail, subject, html });
    }
    if (r.passwordSet) {
      await sendNotificationToUser(r.studentId, 'Welcome to Inspiro!', 'Your admission is confirmed and course access is now active.', 'credentials_issued');
    } else {
      await sendNotificationToUser(r.studentId, 'Admission confirmed', 'Your admission is confirmed and course access is now active.', 'admission_update');
    }
    await notifyAdmins('Lead converted', `${r.studentName} (${r.leadCode}) converted to admission ${r.admissionNo}.`, 'admission_update', { admissionId: r.admissionId });
    return r;
  };
  return finish();
}
