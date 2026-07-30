'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { StatCard } from '@/components/shared/stat-card';

type CoordinatorDashboard = {
  openDoubts: number;
  unassignedDoubts: number;
  avgResolutionMins: number;
  activeBatches: number;
  examsPendingPublish: number;
  topicQuizCount: number;
};

function formatMins(mins: number): string {
  if (mins === 0) return '—';
  if (mins < 60) return `${mins}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export default function AcademicsDashboardPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const { data, isLoading } = useQuery({
    queryKey: ['academics', 'dashboard'],
    queryFn: () => api.get<CoordinatorDashboard>('/api/v1/academics/dashboard'),
    enabled: !!accessToken,
  });
  const d = data?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Academic Dashboard</h2>
          <p className="text-slate-400 text-sm mt-1">Doubts, mentors, batches and exams at a glance</p>
        </div>
        <div className="flex gap-2">
          <Link href="/doubts" className="px-4 py-2 rounded-xl border border-white/10 bg-surface-2 hover:bg-surface-high text-sm font-medium text-slate-200 transition-colors">Doubts</Link>
          <Link href="/mentors" className="px-4 py-2 rounded-xl bg-brand-violet hover:bg-brand-violet/90 text-sm font-medium text-white transition-colors">Mentors</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Open doubts" value={isLoading ? '…' : d?.openDoubts ?? 0} accent="amber" />
        <StatCard label="Unassigned doubts" value={isLoading ? '…' : d?.unassignedDoubts ?? 0} accent="rose" />
        <StatCard label="Avg resolution time" value={isLoading ? '…' : formatMins(d?.avgResolutionMins ?? 0)} accent="teal" />
        <StatCard label="Active batches" value={isLoading ? '…' : d?.activeBatches ?? 0} accent="violet" />
        <StatCard label="Exams pending publish" value={isLoading ? '…' : d?.examsPendingPublish ?? 0} accent="amber" />
        <StatCard label="Topic quizzes" value={isLoading ? '…' : d?.topicQuizCount ?? 0} accent="teal" />
      </div>
    </div>
  );
}
