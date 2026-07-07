'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';

type Batch = {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  maxCapacity: number | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
};

type CreateBatchForm = {
  name: string;
  description: string;
  maxCapacity: string;
  startDate: string;
  endDate: string;
};

export default function BatchesPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'batches', page],
    queryFn: () => api.get<Batch[]>(`/api/v1/batches?page=${page}&limit=${limit}`),
    enabled: !!accessToken,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateBatchForm>();

  const createBatch = useMutation({
    mutationFn: (values: CreateBatchForm) =>
      api.post('/api/v1/admin/batches', {
        name: values.name,
        description: values.description || undefined,
        maxCapacity: values.maxCapacity ? Number(values.maxCapacity) : undefined,
        startDate: values.startDate || undefined,
        endDate: values.endDate || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'batches'] });
      reset();
      setShowCreate(false);
    },
  });

  const archiveBatch = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/admin/batches/${id}`, { status: 'archived' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'batches'] }),
  });

  const columns: Column<Batch>[] = [
    {
      key: 'name',
      header: 'Batch',
      render: (b) => (
        <div>
          <p className="font-medium text-slate-200">{b.name}</p>
          {b.description && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{b.description}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      render: (b) => (
        <Badge variant={b.status === 'active' ? 'teal' : 'slate'} className="capitalize">
          {b.status}
        </Badge>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      width: 'w-24',
      render: (b) => <span className="text-slate-400">{b.maxCapacity ?? '∞'}</span>,
    },
    {
      key: 'dates',
      header: 'Duration',
      width: 'w-48',
      render: (b) => (
        <span className="text-slate-400 text-xs">
          {b.startDate ? formatDate(b.startDate) : '—'} → {b.endDate ? formatDate(b.endDate) : 'ongoing'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-24',
      render: (b) =>
        b.status === 'active' ? (
          <Button
            variant="outline"
            size="sm"
            loading={archiveBatch.isPending && archiveBatch.variables === b.id}
            onClick={() => archiveBatch.mutate(b.id)}
          >
            Archive
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Batches</h2>
          <p className="text-slate-400 text-sm mt-1">
            {data?.meta?.total ?? 0} batches
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New batch'}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={(e) => { void handleSubmit((v) => createBatch.mutate(v))(e); }}
          className="rounded-2xl border border-white/8 bg-surface-1 p-6 space-y-4"
        >
          <h3 className="font-display font-semibold text-slate-200">Create batch</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name *</label>
              <Input {...register('name', { required: true })} placeholder="e.g. UPSC 2025 Batch A" />
              {errors.name && <p className="text-xs text-rose-400 mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max capacity</label>
              <Input type="number" {...register('maxCapacity')} placeholder="Leave blank for unlimited" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <Input {...register('description')} placeholder="Optional description" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Start date</label>
              <Input type="date" {...register('startDate')} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">End date</label>
              <Input type="date" {...register('endDate')} />
            </div>
          </div>
          {createBatch.error && (
            <p className="text-sm text-rose-400">{(createBatch.error as Error).message}</p>
          )}
          <div className="flex gap-3">
            <Button type="submit" loading={createBatch.isPending}>Create</Button>
            <Button type="button" variant="outline" onClick={() => { setShowCreate(false); reset(); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        getKey={(b) => b.id}
        emptyMessage="No batches found"
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
