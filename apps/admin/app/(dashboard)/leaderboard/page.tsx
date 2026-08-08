'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

type LeaderboardRow = {
  rank: number;
  totalScore: number;
  examScore: number;
  streakScore: number;
  studyTimeScore?: number;
  student: { id: string; name: string; avatarUrl: string | null };
};
type BatchOption = { id: string; name: string };

const periods = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'all_time', label: 'All time' },
] as const;

export default function LeaderboardPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();

  const [batchId, setBatchId] = useState('');
  const [period, setPeriod] = useState<(typeof periods)[number]['key']>('weekly');
  const [page, setPage] = useState(1);
  const limit = 25;

  const batchesQ = useQuery({
    queryKey: ['admin', 'batches', 'leaderboard-picker'],
    queryFn: () => api.get<BatchOption[]>('/api/v1/batches?limit=100'),
    enabled: !!accessToken,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['leaderboard', batchId, period, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (batchId) { p.set('batchId', batchId); p.set('period', period); }
      return api.get<LeaderboardRow[]>(`/api/v1/leaderboard?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const recompute = useMutation({
    mutationFn: () => api.post('/api/v1/admin/leaderboard/recompute', { batchId, period }),
    onSuccess: () => { toast('Leaderboard recomputed', 'success'); void refetch(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed to recompute — admin role required', 'error'),
  });

  const columns: Column<LeaderboardRow>[] = [
    { key: 'rank', header: '#', width: 'w-12', render: (r) => <span className="text-slate-400 font-mono text-xs">{r.rank}</span> },
    { key: 'student', header: 'Student', render: (r) => <span className="font-medium text-slate-200">{r.student.name}</span> },
    { key: 'total', header: 'Total score', width: 'w-28', render: (r) => <span className="text-slate-100 font-semibold">{r.totalScore.toFixed(1)}</span> },
    { key: 'exam', header: 'Exam', width: 'w-24', render: (r) => <span className="text-slate-400">{r.examScore.toFixed(1)}</span> },
    { key: 'streak', header: 'Streak', width: 'w-24', render: (r) => <span className="text-slate-400">{r.streakScore.toFixed(1)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Leaderboard</h2>
          <p className="text-slate-400 text-sm mt-1">Rankings by batch or global, across weekly/monthly/all-time windows</p>
        </div>
        {batchId && (
          <Button size="sm" variant="outline" loading={recompute.isPending} onClick={() => recompute.mutate()}>
            Recompute
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={batchId} onChange={(e) => { setBatchId(e.target.value); setPage(1); }} className="max-w-[220px]">
          <option value="">Global (all-time)</option>
          {(batchesQ.data?.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        {batchId && (
          <div className="flex gap-1 rounded-full bg-surface-2 p-1">
            {periods.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPeriod(p.key); setPage(1); }}
                className={
                  period === p.key
                    ? 'px-3 py-1 rounded-full text-xs font-medium bg-brand-violet text-white'
                    : 'px-3 py-1 rounded-full text-xs font-medium text-slate-400 hover:text-slate-200'
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(r) => r.student.id} emptyMessage="No ranked students yet — try Recompute after some exam activity" />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}
