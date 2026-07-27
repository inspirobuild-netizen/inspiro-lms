import { and, count, desc, eq, gte, lte, isNotNull, notInArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../lib/db.js';
import { leads, admissions, users, courses, branches, counsellorTargets } from '../../../drizzle/schema.js';

const TERMINAL = ['converted', 'lost', 'not_interested'];

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
