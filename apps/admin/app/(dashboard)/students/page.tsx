'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatPhone } from '@/lib/utils';

type User = {
  id: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export default function StudentsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 20;

  // Debounce search input
  function handleSearchChange(val: string) {
    setSearch(val);
    clearTimeout((handleSearchChange as { timer?: ReturnType<typeof setTimeout> }).timer);
    (handleSearchChange as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', page, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        role: 'student',
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      return api.get<User[]>(`/api/v1/admin/users?${params.toString()}`);
    },
    enabled: !!accessToken,
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/api/v1/admin/users/${id}/status`, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (u) => (
        <div>
          <p className="font-medium text-slate-200">{u.name || '—'}</p>
          <p className="text-xs text-slate-500 mt-0.5">{formatPhone(u.phone)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      render: (u) => (
        <Badge variant={u.isActive ? 'success' : 'slate'}>
          {u.isActive ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      width: 'w-32',
      render: (u) => <span className="text-slate-400">{formatDate(u.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-28',
      render: (u) => (
        <Button
          variant="outline"
          size="sm"
          loading={toggleStatus.isPending && (toggleStatus.variables as { id: string })?.id === u.id}
          onClick={() => toggleStatus.mutate({ id: u.id, isActive: !u.isActive })}
        >
          {u.isActive ? 'Disable' : 'Enable'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Students</h2>
          <p className="text-slate-400 text-sm mt-1">
            {data?.meta?.total ?? 0} registered students
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        getKey={(u) => u.id}
        emptyMessage="No students found"
      />

      <Pagination
        page={page}
        limit={limit}
        total={data?.meta?.total ?? 0}
        onPage={setPage}
      />
    </div>
  );
}
