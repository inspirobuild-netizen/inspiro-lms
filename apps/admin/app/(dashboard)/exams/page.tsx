'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

type Exam = {
  id: string;
  title: string;
  subject: string;
  type: string;
  durationMins: number;
  isPublished: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  createdAt: string;
};

const typeColor: Record<string, 'default' | 'teal' | 'amber' | 'rose'> = {
  practice: 'teal',
  mock: 'amber',
  sectional: 'default',
  live: 'rose',
};

export default function ExamsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'exams', page],
    queryFn: () => api.get<Exam[]>(`/api/v1/admin/exams?page=${page}&limit=${limit}`),
    enabled: !!accessToken,
  });

  const publish = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/admin/exams/${id}/publish`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'exams'] }),
  });

  const columns: Column<Exam>[] = [
    {
      key: 'title',
      header: 'Exam',
      render: (e) => (
        <div>
          <p className="font-medium text-slate-200">{e.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{e.subject}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: 'w-24',
      render: (e) => (
        <Badge variant={typeColor[e.type] ?? 'default'} className="capitalize">
          {e.type}
        </Badge>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: 'w-24',
      render: (e) => <span className="text-slate-400">{e.durationMins} min</span>,
    },
    {
      key: 'schedule',
      header: 'Window',
      width: 'w-48',
      render: (e) => (
        <span className="text-slate-400 text-xs">
          {e.scheduleStart ? formatDate(e.scheduleStart) : 'Open'} – {e.scheduleEnd ? formatDate(e.scheduleEnd) : '∞'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      render: (e) => (
        <Badge variant={e.isPublished ? 'success' : 'slate'}>
          {e.isPublished ? 'Live' : 'Draft'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-24',
      render: (e) =>
        !e.isPublished ? (
          <Button
            variant="outline"
            size="sm"
            loading={publish.isPending && publish.variables === e.id}
            onClick={() => publish.mutate(e.id)}
          >
            Publish
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Exams</h2>
          <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} exams</p>
        </div>
        <Link href="/exams/generate">
          <Button size="sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" />
            </svg>
            Generate with AI
          </Button>
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        getKey={(e) => e.id}
        emptyMessage="No exams yet"
      />

      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}
