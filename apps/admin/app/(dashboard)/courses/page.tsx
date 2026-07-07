'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

type Course = {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  thumbnailUrl: string | null;
  isPublished: boolean;
  createdAt: string;
};

export default function CoursesPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'courses', page],
    queryFn: () => api.get<Course[]>(`/api/v1/admin/courses?page=${page}&limit=${limit}`),
    enabled: !!accessToken,
  });

  const columns: Column<Course>[] = [
    {
      key: 'title',
      header: 'Course',
      render: (c) => (
        <div>
          <p className="font-medium text-slate-200">{c.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{c.subject}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      render: (c) => (
        <Badge variant={c.isPublished ? 'teal' : 'slate'}>
          {c.isPublished ? 'Published' : 'Draft'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      width: 'w-32',
      render: (c) => <span className="text-slate-400">{formatDate(c.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Courses</h2>
        <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} courses</p>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        getKey={(c) => c.id}
        emptyMessage="No courses yet"
      />

      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}
