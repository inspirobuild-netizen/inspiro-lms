'use client';

import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { StatCard } from '@/components/shared/stat-card';

type DashboardStats = {
  totalStudents: number;
  activeStudents: number;
  totalBatches: number;
  activeBatches: number;
  totalCourses: number;
  publishedExams: number;
};

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

export default function DashboardPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users', 'count'],
    queryFn: () => api.get<{ items: unknown[]; total: number }>('/api/v1/admin/users?limit=1'),
    enabled: !!accessToken,
  });

  const { data: batchesData } = useQuery({
    queryKey: ['admin', 'batches', 'count'],
    queryFn: () => api.get<{ items: unknown[]; total: number }>('/api/v1/batches?limit=1'),
    enabled: !!accessToken,
  });

  const { data: examsData } = useQuery({
    queryKey: ['admin', 'exams', 'count'],
    queryFn: () => api.get<{ items: unknown[]; total: number }>('/api/v1/admin/exams?limit=1'),
    enabled: !!accessToken,
  });

  const totalStudents = usersData?.meta?.total ?? 0;
  const totalBatches = batchesData?.meta?.total ?? 0;
  const totalExams = examsData?.meta?.total ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Overview</h2>
        <p className="text-slate-400 text-sm mt-1">Civil Connect LMS — admin summary</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Students" value={totalStudents} accent="violet" icon={<UsersIcon />} />
        <StatCard label="Total Batches" value={totalBatches} accent="teal" icon={<BatchIcon />} />
        <StatCard label="Total Exams" value={totalExams} accent="amber" icon={<ExamIcon />} />
        <StatCard label="Courses" value="—" sub="coming soon" accent="rose" icon={<CourseIcon />} />
      </div>

      <div className="rounded-2xl border border-white/8 bg-surface-1 p-6">
        <h3 className="font-display font-semibold text-slate-200 mb-4">Quick actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Add student', href: '/students' },
            { label: 'Create batch', href: '/batches' },
            { label: 'New exam', href: '/exams' },
            { label: 'Upload course', href: '/courses' },
          ].map((action) => (
            <a
              key={action.href}
              href={action.href}
              className="flex items-center justify-center rounded-xl bg-surface-2 border border-white/8 hover:bg-surface-high transition-colors px-4 py-3 text-sm font-medium text-slate-300"
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
