'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
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

export default function DashboardPage() {
  const { accessToken, user } = useAuthStore();
  const api = createApiClient(accessToken);
  const enabled = !!accessToken;

  const students = useCount(['admin', 'users', 'count'], '/api/v1/admin/users?role=student&limit=1', enabled, api);
  const batches = useCount(['admin', 'batches', 'count'], '/api/v1/batches?limit=1', enabled, api);
  const exams = useCount(['admin', 'exams', 'count'], '/api/v1/admin/exams?limit=1', enabled, api);
  const courses = useCount(['admin', 'courses', 'count'], '/api/v1/courses?limit=1', enabled, api);
  const doubts = useCount(['admin', 'doubts', 'escalated', 'count'], '/api/v1/admin/doubts?status=escalated&limit=1', enabled, api);

  const stat = (q: { data?: { meta?: { total: number } }; isLoading: boolean; isError: boolean }) => {
    if (q.isLoading) return '…';
    if (q.isError) return '!';
    return q.data?.meta?.total ?? 0;
  };
  const sub = (q: { isError: boolean }, ok: string) => (q.isError ? 'failed to load — retry below' : ok);

  const anyError = [students, batches, exams, courses, doubts].some((q) => q.isError);
  const refetchAll = () => [students, batches, exams, courses, doubts].forEach((q) => void q.refetch());

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
