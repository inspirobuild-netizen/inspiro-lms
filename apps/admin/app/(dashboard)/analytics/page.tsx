'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { StatCard } from '@/components/shared/stat-card';

// ── Types ────────────────────────────────────────────────────────────────────

type OverviewStats = {
  students: { total: number; active: number };
  batches: { total: number; active: number };
  content: { courses: number; lessons: number };
  exams: { total: number; attempts: number; avgScore: number | null };
};

type TrendPoint = { month: string; count: number };
type ExamPerf = {
  examId: string;
  examTitle: string;
  attempts: number;
  avgScore: number | null;
  maxScore: number | null;
  minScore: number | null;
};
type TopStudent = {
  studentId: string;
  name: string;
  phone: string;
  attempts: number;
  avgScore: number | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function ExportButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-surface-2 hover:bg-surface-high text-xs font-medium text-slate-300 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {label}
    </a>
  );
}

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

const CHART_COLORS = {
  violet: '#7C3AED',
  teal: '#4FDBC8',
  amber: '#F59E0B',
  rose: '#E11D48',
};

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-surface-1 px-3 py-2 text-sm shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-slate-100 font-medium">
          {p.name}: <span className="text-violet-300">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.get<OverviewStats>('/api/v1/admin/analytics/overview'),
    enabled: !!accessToken,
  });

  const { data: trendData } = useQuery({
    queryKey: ['analytics', 'trend'],
    queryFn: () => api.get<TrendPoint[]>('/api/v1/admin/analytics/enrollment-trend'),
    enabled: !!accessToken,
  });

  const { data: examPerfData } = useQuery({
    queryKey: ['analytics', 'exam-perf'],
    queryFn: () => api.get<ExamPerf[]>('/api/v1/admin/analytics/exam-performance'),
    enabled: !!accessToken,
  });

  const { data: topStudentsData } = useQuery({
    queryKey: ['analytics', 'top-students'],
    queryFn: () => api.get<TopStudent[]>('/api/v1/admin/analytics/top-students'),
    enabled: !!accessToken,
  });

  const stats = overview?.data;
  const trend = trendData?.data ?? [];
  const examPerf = (examPerfData?.data ?? []).slice(0, 8);
  const topStudents = topStudentsData?.data ?? [];

  // Format month labels: "2024-06" → "Jun"
  const trendFormatted = trend.map((t) => ({
    ...t,
    month: new Date(t.month + '-01').toLocaleString('en-IN', { month: 'short' }),
    count: Number(t.count),
  }));

  const examChartData = examPerf.map((e) => ({
    name: e.examTitle.length > 18 ? e.examTitle.slice(0, 18) + '…' : e.examTitle,
    avg: e.avgScore ?? 0,
    max: e.maxScore ?? 0,
    min: e.minScore ?? 0,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">Platform-wide metrics and exports</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportButton href={`${API_BASE}/api/v1/admin/analytics/export/students`} label="Export Students" />
          <ExportButton href={`${API_BASE}/api/v1/admin/analytics/export/exam-results`} label="Export Exam Results" />
          <ExportButton href={`${API_BASE}/api/v1/admin/analytics/export/attendance`} label="Export Attendance" />
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Students"
          value={stats?.students.total ?? '—'}
          sub={`${stats?.students.active ?? 0} active`}
          accent="violet"
          icon={<UserIcon />}
        />
        <StatCard
          label="Active Batches"
          value={stats?.batches.active ?? '—'}
          sub={`of ${stats?.batches.total ?? 0} total`}
          accent="teal"
          icon={<BatchIcon />}
        />
        <StatCard
          label="Exam Attempts"
          value={stats?.exams.attempts ?? '—'}
          sub={stats?.exams.avgScore != null ? `avg score ${stats.exams.avgScore}%` : undefined}
          accent="amber"
          icon={<ExamIcon />}
        />
        <StatCard
          label="Lessons"
          value={stats?.content.lessons ?? '—'}
          sub={`across ${stats?.content.courses ?? 0} courses`}
          accent="rose"
          icon={<CourseIcon />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment trend */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-6">
          <h3 className="font-display font-semibold text-slate-200 mb-6">Enrollment trend (12 months)</h3>
          {trendFormatted.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No enrollment data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendFormatted}>
                <defs>
                  <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.violet} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.violet} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Enrollments"
                  stroke={CHART_COLORS.violet}
                  strokeWidth={2}
                  fill="url(#enrollGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Exam performance */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-6">
          <h3 className="font-display font-semibold text-slate-200 mb-6">Exam avg scores (%)</h3>
          {examChartData.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No exam data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={examChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="avg" name="Avg %" radius={[0, 6, 6, 0]}>
                  {examChartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        _ .avg >= 70
                          ? CHART_COLORS.teal
                          : _.avg >= 50
                          ? CHART_COLORS.amber
                          : CHART_COLORS.rose
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top students table */}
      <div className="rounded-2xl border border-white/8 bg-surface-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-slate-200">Top students by exam score</h3>
          <ExportButton href={`${API_BASE}/api/v1/admin/analytics/export/students`} label="Export CSV" />
        </div>
        {topStudents.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">No exam attempts yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {['#', 'Student', 'Phone', 'Attempts', 'Avg Score'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topStudents.slice(0, 10).map((s, i) => (
                <tr key={s.studentId} className="border-b border-white/5 hover:bg-surface-2 transition-colors">
                  <td className="px-3 py-3 text-slate-500 font-mono text-xs">{i + 1}</td>
                  <td className="px-3 py-3 font-medium text-slate-200">{s.name || '—'}</td>
                  <td className="px-3 py-3 text-slate-400">{s.phone}</td>
                  <td className="px-3 py-3 text-slate-400">{s.attempts}</td>
                  <td className="px-3 py-3">
                    {s.avgScore != null ? (
                      <span
                        className={`font-semibold ${
                          s.avgScore >= 70
                            ? 'text-teal-400'
                            : s.avgScore >= 50
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {s.avgScore}%
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UserIcon() {
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

function ExamIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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
