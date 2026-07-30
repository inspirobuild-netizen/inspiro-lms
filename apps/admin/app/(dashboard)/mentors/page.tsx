'use client';

import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';

type MentorRow = {
  id: string;
  name: string;
  batchCount: number;
  batchNames: string[];
  doubtsAnswered: number;
  avgResponseMins: number | null;
};

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export default function MentorsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'mentors', 'workload'],
    queryFn: () => api.get<MentorRow[]>('/api/v1/admin/mentors/workload'),
    enabled: !!accessToken,
  });

  const rows = data?.data ?? [];

  const columns: Column<MentorRow>[] = [
    { key: 'name', header: 'Staff', render: (m) => <span className="font-medium text-slate-200">{m.name}</span> },
    { key: 'batches', header: 'Batches taught', width: 'w-64', render: (m) => (
      m.batchCount === 0 ? <span className="text-slate-500">—</span> : (
        <div>
          <p className="text-slate-300">{m.batchCount}</p>
          <p className="text-xs text-slate-500 truncate max-w-xs">{m.batchNames.join(', ')}</p>
        </div>
      )
    ) },
    { key: 'doubts', header: 'Doubts answered', width: 'w-36', render: (m) => (
      <Badge variant={m.doubtsAnswered > 0 ? 'success' : 'slate'}>{m.doubtsAnswered}</Badge>
    ) },
    { key: 'avgResponse', header: 'Avg response time', width: 'w-40', render: (m) => (
      m.avgResponseMins === null ? <span className="text-slate-500">—</span> : <span className="text-slate-300">{formatMins(m.avgResponseMins)}</span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Mentors</h2>
        <p className="text-slate-400 text-sm mt-1">Teaching load and doubt-resolution workload across staff</p>
      </div>

      <DataTable columns={columns} data={rows} loading={isLoading} getKey={(m) => m.id} emptyMessage="No staff found" />
    </div>
  );
}
