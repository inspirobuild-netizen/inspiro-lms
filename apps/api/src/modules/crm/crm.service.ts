import { and, count, desc, eq, gte, lte, isNotNull, notInArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../lib/db.js';
import { leads, admissions, users, courses, batches, branches, counsellorTargets, studentVerification } from '../../../drizzle/schema.js';

const TERMINAL = ['converted', 'lost', 'not_interested'];

// ═════════════════════════════════════════════════════════════════════════════
// CSV REPORTS
// ═════════════════════════════════════════════════════════════════════════════

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

export async function exportAdmissionsCsv(): Promise<string> {
  const counsellor = alias(users, 'counsellor');
  const rows = await db
    .select({
      admissionNo: admissions.admissionNo, studentName: users.name, studentPhone: users.phone,
      counsellorName: counsellor.name, branchName: branches.name, courseTitle: courses.title, batchName: batches.name,
      admissionDate: admissions.admissionDate, feeAmount: admissions.feeAmount, amountPaid: admissions.amountPaid, paymentStatus: admissions.paymentStatus,
    })
    .from(admissions)
    .leftJoin(users, eq(users.id, admissions.studentId))
    .leftJoin(counsellor, eq(counsellor.id, admissions.counsellorId))
    .leftJoin(branches, eq(branches.id, admissions.branchId))
    .leftJoin(courses, eq(courses.id, admissions.courseId))
    .leftJoin(batches, eq(batches.id, admissions.batchId))
    .orderBy(desc(admissions.createdAt));
  return toCsv(
    ['Admission No', 'Student', 'Phone', 'Counsellor', 'Branch', 'Course', 'Batch', 'Admission Date', 'Fee Amount', 'Amount Paid', 'Payment Status'],
    rows.map((r) => [r.admissionNo, r.studentName, r.studentPhone, r.counsellorName, r.branchName, r.courseTitle, r.batchName, r.admissionDate, r.feeAmount, r.amountPaid, r.paymentStatus]),
  );
}

export async function exportLeadSourceCsv(): Promise<string> {
  const rows = await db.select({ source: leads.source, n: count() }).from(leads).groupBy(leads.source).orderBy(desc(count()));
  return toCsv(['Source', 'Leads'], rows.map((r) => [r.source, Number(r.n)]));
}

export async function exportRevenueCsv(period: 'daily' | 'monthly' | 'yearly'): Promise<string> {
  const trunc = period === 'daily' ? 'day' : period === 'monthly' ? 'month' : 'year';
  const fmt = period === 'daily' ? 'YYYY-MM-DD' : period === 'monthly' ? 'YYYY-MM' : 'YYYY';
  const rows = (await db.execute(sql`
    SELECT to_char(date_trunc(${trunc}, admission_date), ${fmt}) AS period,
           count(*)::int AS admissions, coalesce(sum(fee_amount),0)::float AS revenue, coalesce(sum(amount_paid),0)::float AS collected
    FROM admissions GROUP BY 1 ORDER BY 1
  `)) as unknown as { rows: { period: string; admissions: number; revenue: number; collected: number }[] };
  return toCsv(['Period', 'Admissions', 'Revenue', 'Collected'], rows.rows.map((r) => [r.period, r.admissions, r.revenue, r.collected]));
}

export async function exportPendingLeadsCsv(): Promise<string> {
  const rows = await db
    .select({ leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone, status: leads.status, ownerName: users.name, nextFollowupAt: leads.nextFollowupAt, createdAt: leads.createdAt })
    .from(leads).leftJoin(users, eq(users.id, leads.ownerId))
    .where(notInArray(leads.status, TERMINAL as never[]))
    .orderBy(desc(leads.createdAt));
  return toCsv(['Lead Code', 'Student', 'Phone', 'Status', 'Owner', 'Next Follow-up', 'Created'], rows.map((r) => [r.leadCode, r.studentName, r.phone, r.status, r.ownerName, r.nextFollowupAt?.toISOString() ?? '', r.createdAt.toISOString()]));
}

export async function exportFollowupReportCsv(): Promise<string> {
  const rows = await db
    .select({ leadCode: leads.leadCode, studentName: leads.studentName, status: leads.status, ownerName: users.name, nextFollowupAt: leads.nextFollowupAt })
    .from(leads).leftJoin(users, eq(users.id, leads.ownerId))
    .where(and(isNotNull(leads.nextFollowupAt), notInArray(leads.status, TERMINAL as never[])))
    .orderBy(leads.nextFollowupAt);
  return toCsv(['Lead Code', 'Student', 'Status', 'Owner', 'Next Follow-up'], rows.map((r) => [r.leadCode, r.studentName, r.status, r.ownerName, r.nextFollowupAt?.toISOString() ?? '']));
}

export async function exportInactiveLeadsCsv(days: number): Promise<string> {
  const cutoff = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({ leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone, status: leads.status, ownerName: users.name, updatedAt: leads.updatedAt })
    .from(leads).leftJoin(users, eq(users.id, leads.ownerId))
    .where(and(notInArray(leads.status, TERMINAL as never[]), lte(leads.updatedAt, cutoff)))
    .orderBy(leads.updatedAt);
  return toCsv(['Lead Code', 'Student', 'Phone', 'Status', 'Owner', 'Last Updated'], rows.map((r) => [r.leadCode, r.studentName, r.phone, r.status, r.ownerName, r.updatedAt.toISOString()]));
}

export async function exportVerificationReportCsv(): Promise<string> {
  const reviewer = alias(users, 'reviewer');
  const student = alias(users, 'student');
  const rows = await db
    .select({ studentName: student.name, phone: student.phone, status: studentVerification.status, submittedAt: studentVerification.submittedAt, reviewedAt: studentVerification.reviewedAt, reviewerName: reviewer.name, rejectionReason: studentVerification.rejectionReason })
    .from(studentVerification)
    .leftJoin(student, eq(student.id, studentVerification.studentId))
    .leftJoin(reviewer, eq(reviewer.id, studentVerification.reviewedBy))
    .orderBy(desc(studentVerification.submittedAt));
  return toCsv(['Student', 'Phone', 'Status', 'Submitted', 'Reviewed', 'Reviewer', 'Note'], rows.map((r) => [r.studentName, r.phone, r.status, r.submittedAt.toISOString(), r.reviewedAt?.toISOString() ?? '', r.reviewerName, r.rejectionReason]));
}

// ── Counsellor (or scoped) dashboard KPIs ─────────────────────────────────────
export async function getCounsellorDashboard(counsellorId: string, viewAll: boolean) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const period = now.toISOString().slice(0, 7);

  const leadOwn: SQL | undefined = viewAll ? undefined : eq(leads.ownerId, counsellorId);
  const admOwn: SQL | undefined = viewAll ? undefined : eq(admissions.counsellorId, counsellorId);

  const num = (v: unknown) => Number((v as { count?: number }).count ?? v ?? 0);

  const [todayLeads] = await db.select({ count: count() }).from(leads).where(and(leadOwn, gte(leads.createdAt, startToday)));
  const [pending] = await db.select({ count: count() }).from(leads).where(and(leadOwn, isNotNull(leads.nextFollowupAt), lte(leads.nextFollowupAt, now), notInArray(leads.status, TERMINAL as never[])));
  const [totalLeads] = await db.select({ count: count() }).from(leads).where(leadOwn);
  const [convertedLeads] = await db.select({ count: count() }).from(leads).where(and(leadOwn, eq(leads.status, 'converted')));
  const [admToday] = await db.select({ count: count() }).from(admissions).where(and(admOwn, gte(admissions.createdAt, startToday)));
  const [admMonth] = await db.select({ count: count() }).from(admissions).where(and(admOwn, gte(admissions.createdAt, startMonth)));
  const [revMonth] = await db.select({ v: sql<number>`coalesce(sum(${admissions.feeAmount}),0)` }).from(admissions).where(and(admOwn, gte(admissions.createdAt, startMonth)));

  const [target] = await db
    .select()
    .from(counsellorTargets)
    .where(and(eq(counsellorTargets.counsellorId, counsellorId), eq(counsellorTargets.period, period)))
    .limit(1);

  const total = num(totalLeads);
  const converted = num(convertedLeads);

  const upcoming = await db
    .select({ id: leads.id, leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone, status: leads.status, nextFollowupAt: leads.nextFollowupAt })
    .from(leads)
    .where(and(leadOwn, isNotNull(leads.nextFollowupAt), gte(leads.nextFollowupAt, now), notInArray(leads.status, TERMINAL as never[])))
    .orderBy(leads.nextFollowupAt)
    .limit(10);

  const missed = await db
    .select({ id: leads.id, leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone, status: leads.status, nextFollowupAt: leads.nextFollowupAt })
    .from(leads)
    .where(and(leadOwn, isNotNull(leads.nextFollowupAt), lte(leads.nextFollowupAt, now), notInArray(leads.status, TERMINAL as never[])))
    .orderBy(leads.nextFollowupAt)
    .limit(10);

  return {
    todayLeads: num(todayLeads),
    pendingFollowups: num(pending),
    admissionsToday: num(admToday),
    admissionsThisMonth: num(admMonth),
    revenueThisMonth: Number(revMonth?.v ?? 0),
    totalLeads: total,
    conversionRate: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
    target: target ? { targetAdmissions: target.targetAdmissions, targetRevenue: target.targetRevenue } : null,
    upcomingFollowups: upcoming,
    missedFollowups: missed,
  };
}

// ── Admin CRM analytics (global) ──────────────────────────────────────────────
export async function getCrmOverview() {
  const [totalLeads] = await db.select({ count: count() }).from(leads);
  const [totalAdm] = await db.select({ count: count() }).from(admissions);
  const [rev] = await db.select({ v: sql<number>`coalesce(sum(${admissions.feeAmount}),0)`, paid: sql<number>`coalesce(sum(${admissions.amountPaid}),0)` }).from(admissions);
  const [converted] = await db.select({ count: count() }).from(leads).where(eq(leads.status, 'converted'));

  const funnelRows = await db.select({ status: leads.status, n: count() }).from(leads).groupBy(leads.status);
  const funnel = Object.fromEntries(funnelRows.map((r) => [r.status, Number(r.n)]));

  const sourceRows = await db.select({ source: leads.source, n: count() }).from(leads).groupBy(leads.source);
  const sources = sourceRows.map((r) => ({ source: r.source, count: Number(r.n) }));

  // Admissions by month (last 6 months)
  const trendRows = (await db.execute(sql`
    SELECT to_char(date_trunc('month', admission_date), 'YYYY-MM') AS month,
           count(*)::int AS admissions,
           coalesce(sum(fee_amount),0)::float AS revenue
    FROM admissions
    WHERE admission_date >= (current_date - interval '6 months')
    GROUP BY 1 ORDER BY 1
  `)) as unknown as { rows: { month: string; admissions: number; revenue: number }[] };

  // Counsellor performance
  const counsellor = alias(users, 'c');
  const perfRows = await db
    .select({
      counsellorId: counsellor.id,
      counsellorName: counsellor.name,
      admissions: count(admissions.id),
      revenue: sql<number>`coalesce(sum(${admissions.feeAmount}),0)`,
    })
    .from(admissions)
    .innerJoin(counsellor, eq(counsellor.id, admissions.counsellorId))
    .groupBy(counsellor.id, counsellor.name)
    .orderBy(desc(sql`count(${admissions.id})`))
    .limit(20);

  // Leads owned per counsellor (for conversion %)
  const leadCountRows = await db.select({ ownerId: leads.ownerId, n: count() }).from(leads).groupBy(leads.ownerId);
  const leadMap = new Map(leadCountRows.map((r) => [r.ownerId, Number(r.n)]));
  const counsellorPerformance = perfRows.map((p) => {
    const leadTotal = leadMap.get(p.counsellorId) ?? 0;
    return {
      counsellorId: p.counsellorId,
      counsellorName: p.counsellorName,
      admissions: Number(p.admissions),
      revenue: Number(p.revenue),
      leads: leadTotal,
      conversionRate: leadTotal > 0 ? Math.round((Number(p.admissions) / leadTotal) * 1000) / 10 : 0,
    };
  });

  // Course-wise & branch-wise admissions
  const courseRows = await db
    .select({ name: courses.title, n: count() })
    .from(admissions).innerJoin(courses, eq(courses.id, admissions.courseId))
    .groupBy(courses.title).orderBy(desc(count()));
  const branchRows = await db
    .select({ name: branches.name, n: count() })
    .from(admissions).innerJoin(branches, eq(branches.id, admissions.branchId))
    .groupBy(branches.name).orderBy(desc(count()));

  const totalL = Number(totalLeads.count);
  return {
    totals: {
      leads: totalL,
      admissions: Number(totalAdm.count),
      revenue: Number(rev?.v ?? 0),
      collected: Number(rev?.paid ?? 0),
      conversionRate: totalL > 0 ? Math.round((Number(converted.count) / totalL) * 1000) / 10 : 0,
    },
    funnel,
    sources,
    trend: trendRows.rows,
    counsellorPerformance,
    courseWise: courseRows.map((r) => ({ name: r.name, count: Number(r.n) })),
    branchWise: branchRows.map((r) => ({ name: r.name, count: Number(r.n) })),
  };
}
