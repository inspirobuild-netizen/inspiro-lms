'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createApiClient } from '@/lib/api';
import { useAuthStore, useHasPermission } from '@/lib/auth';
import { StatCard } from '@/components/shared/stat-card';

function UsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function BatchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function CourseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function ExamIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

/** Count query helper — every list endpoint returns meta.total. */
function useCount(key: string[], path: string, enabled: boolean, api: ReturnType<typeof createApiClient>) {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<unknown[]>(path),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

type VerificationCounts = { pending: number; verified: number; rejected: number };
type CrmDashboard = { admissionsThisMonth: number; revenueThisMonth: number; totalLeads: number; conversionRate: number };
type TrendPoint = { month: string; count: number };
type AdmissionsSummary = {
  total: number;
  byBatch: { batchId: string; batchName: string; count: number }[];
  byCourse: { courseId: string; courseTitle: string; count: number }[];
};

const CHART_COLORS = { violet: '#7C3AED', teal: '#4FDBC8', amber: '#F59E0B', rose: '#E11D48' };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-surface-1 px-3 py-2 text-sm shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-slate-100 font-medium">{p.name}: <span className="text-violet-300">{p.value}</span></p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { accessToken, user } = useAuthStore();
  const api = createApiClient(accessToken);
  const has = useHasPermission();
  const enabled = !!accessToken;

  const students = useCount(['admin', 'users', 'count'], '/api/v1/admin/users?role=student&limit=1', enabled, api);
  const batches = useCount(['admin', 'batches', 'count'], '/api/v1/batches?limit=1', enabled, api);
  const exams = useCount(['admin', 'exams', 'count'], '/api/v1/admin/exams?limit=1', enabled, api);
  const courses = useCount(['admin', 'courses', 'count'], '/api/v1/courses?limit=1', enabled, api);
  const doubts = useCount(['admin', 'doubts', 'escalated', 'count'], '/api/v1/admin/doubts?status=escalated&limit=1', enabled, api);

  const canVerify = has('students.verify');
  const canLeads = has('leads.view');
  const canAdmissions = has('admissions.view');
  const canAnalytics = has('analytics.view_all');

  const verification = useQuery({
    queryKey: ['verification', 'counts'],
    queryFn: () => api.get<VerificationCounts>('/api/v1/admin/students/verification/counts'),
    enabled: enabled && canVerify,
    staleTime: 30_000,
  });
  const crm = useQuery({
    queryKey: ['crm', 'dashboard'],
    queryFn: () => api.get<CrmDashboard>('/api/v1/crm/dashboard'),
    enabled: enabled && canLeads,
    staleTime: 30_000,
  });
  const trend = useQuery({
    queryKey: ['analytics', 'trend'],
    queryFn: () => api.get<TrendPoint[]>('/api/v1/admin/analytics/enrollment-trend'),
    enabled: enabled && canAnalytics,
    staleTime: 30_000,
  });
  const admissionsSummary = useQuery({
    queryKey: ['admissions', 'summary', ''],
    queryFn: () => api.get<AdmissionsSummary>('/api/v1/admissions/summary'),
    enabled: enabled && canAdmissions,
    staleTime: 30_000,
  });

  const stat = (q: { data?: { meta?: { total: number } }; isLoading: boolean; isError: boolean }) => {
    if (q.isLoading) return '…';
    if (q.isError) return '!';
    return q.data?.meta?.total ?? 0;
  };
  const sub = (q: { isError: boolean }, ok: string) => (q.isError ? 'failed to load — retry below' : ok);
  const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const anyError = [students, batches, exams, courses, doubts].some((q) => q.isError);
  const refetchAll = () => [students, batches, exams, courses, doubts].forEach((q) => void q.refetch());

  const trendFormatted = (trend.data?.data ?? []).map((t) => ({
    ...t,
    month: new Date(t.month + '-01').toLocaleString('en-IN', { month: 'short' }),
    count: Number(t.count),
  }));

  const batchChartData = (admissionsSummary.data?.data.byBatch ?? []).slice(0, 6).map((b) => ({
    name: b.batchName.length > 16 ? b.batchName.slice(0, 16) + '…' : b.batchName,
    count: b.count,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h2>
          <p className="text-slate-400 text-sm mt-1">Inspiro IAS Academy — live overview</p>
        </div>
        {anyError && (
          <button
            onClick={refetchAll}
            className="text-sm text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-2 hover:bg-rose-500/20 transition-colors"
          >
            Some stats failed — retry
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Students" value={stat(students)} sub={sub(students, 'registered')} accent="violet" icon={<UsersIcon />} />
        <StatCard label="Batches" value={stat(batches)} sub={sub(batches, 'total')} accent="teal" icon={<BatchIcon />} />
        <StatCard label="Exams" value={stat(exams)} sub={sub(exams, 'created')} accent="amber" icon={<ExamIcon />} />
        <StatCard label="Courses" value={stat(courses)} sub={sub(courses, 'total')} accent="rose" icon={<CourseIcon />} />
      </div>

      {(canLeads || canVerify) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {canLeads && (
            <>
              <StatCard label="Admissions this month" value={crm.isLoading ? '…' : crm.data?.data.admissionsThisMonth ?? 0} accent="teal" />
              <StatCard label="Revenue this month" value={crm.isLoading ? '…' : money(crm.data?.data.revenueThisMonth ?? 0)} accent="rose" />
              <StatCard label="Conversion rate" value={crm.isLoading ? '…' : `${crm.data?.data.conversionRate ?? 0}%`} accent="violet" />
            </>
          )}
          {canVerify && (
            <StatCard label="Pending verifications" value={verification.isLoading ? '…' : verification.data?.data.pending ?? 0} accent="amber" />
          )}
        </div>
      )}

      {/* Doubts needing attention */}
      <Link
        href="/doubts"
        className="block rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display font-semibold text-slate-200">Doubts waiting for a mentor</p>
            <p className="text-sm text-slate-400 mt-0.5">Escalated questions the AI couldn&apos;t answer confidently</p>
          </div>
          <span className="font-display font-bold text-3xl text-amber-300">{stat(doubts)}</span>
        </div>
      </Link>

      {(canAnalytics || canAdmissions) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {canAnalytics && (
            <div className="rounded-2xl border border-white/8 bg-surface-1 p-6">
              <h3 className="font-display font-semibold text-slate-200 mb-6">Enrollment trend (12 months)</h3>
              {trendFormatted.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No enrollment data</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendFormatted}>
                    <defs>
                      <linearGradient id="dashEnrollGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.violet} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.violet} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="count" name="Enrollments" stroke={CHART_COLORS.violet} strokeWidth={2} fill="url(#dashEnrollGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {canAdmissions && (
            <div className="rounded-2xl border border-white/8 bg-surface-1 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display font-semibold text-slate-200">Admissions by batch</h3>
                <Link href="/admissions/students" className="text-xs text-violet-300 hover:text-violet-200">View all →</Link>
              </div>
              {batchChartData.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No admissions yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={batchChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Admissions" radius={[0, 6, 6, 0]}>
                      {batchChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS.teal} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-white/8 bg-surface-1 p-6">
        <h3 className="font-display font-semibold text-slate-200 mb-4">Quick actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Add student', href: '/students' },
            { label: 'Create batch', href: '/batches' },
            { label: 'New exam', href: '/exams' },
            { label: 'Generate exam with AI', href: '/exams/generate' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center justify-center rounded-xl bg-surface-2 border border-white/8 hover:bg-surface-high transition-colors px-4 py-3 text-sm font-medium text-slate-300"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
