'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field, Textarea } from '@/components/ui/modal';
import { formatDate } from '@/lib/utils';

type Batch = {
  id: string;
  name: string;
  type: 'online' | 'offline' | 'hybrid';
  targetExam: 'upsc' | 'kerala_psc' | 'other_psc';
  status: 'upcoming' | 'active' | 'completed' | 'archived';
  capacity: number;
  startDate: string;
  endDate: string;
  description: string | null;
  createdAt: string;
};

const statusBadge: Record<Batch['status'], 'teal' | 'success' | 'slate' | 'amber'> = {
  upcoming: 'amber',
  active: 'success',
  completed: 'teal',
  archived: 'slate',
};

export default function BatchesPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'batches', page],
    queryFn: () => api.get<Batch[]>(`/api/v1/batches?page=${page}&limit=${limit}`),
    enabled: !!accessToken,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/admin/batches/${id}`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'batches'] }),
  });

  const columns: Column<Batch>[] = [
    {
      key: 'name',
      header: 'Batch',
      render: (b) => (
        <div>
          <p className="font-medium text-slate-200">{b.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 uppercase">{b.targetExam.replace('_', ' ')} · {b.type}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      render: (b) => <Badge variant={statusBadge[b.status]} className="capitalize">{b.status}</Badge>,
    },
    {
      key: 'window',
      header: 'Duration',
      width: 'w-44',
      render: (b) => (
        <span className="text-slate-400 text-xs">{formatDate(b.startDate)} – {formatDate(b.endDate)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-64',
      render: (b) => (
        <div className="flex gap-2 justify-end">
          <Link href={`/batches/${b.id}`}>
            <Button variant="outline" size="sm">Manage</Button>
          </Link>
          {b.status === 'upcoming' && (
            <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: b.id, status: 'active' })}>
              Activate
            </Button>
          )}
          {b.status === 'active' && (
            <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: b.id, status: 'archived' })}>
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Batches</h2>
          <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} batches</p>
        </div>
        <NewBatchButton onCreated={() => void qc.invalidateQueries({ queryKey: ['admin', 'batches'] })} />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        getKey={(b) => b.id}
        emptyMessage="No batches yet — create your first one"
      />

      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function NewBatchButton({ onCreated }: { onCreated: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const currentYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('hybrid');
  const [targetExam, setTargetExam] = useState('kerala_psc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [capacity, setCapacity] = useState('100');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/admin/batches', {
        name: name.trim(),
        type,
        targetExam,
        startDate,
        endDate,
        capacity: Number(capacity) || 100,
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      setOpen(false);
      setName(''); setDescription(''); setError(null);
      onCreated();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create batch'),
  });

  const valid = name.trim().length >= 2 && !!startDate && !!endDate;

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New batch</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create batch" description="A batch groups students, courses, exams and live classes">
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Kerala PSC ${currentYear + 1} — Batch A`} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mode">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="hybrid">Hybrid</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </Select>
            </Field>
            <Field label="Target exam">
              <Select value={targetExam} onChange={(e) => setTargetExam(e.target.value)}>
                <option value="kerala_psc">Kerala PSC</option>
                <option value="upsc">UPSC</option>
                <option value="other_psc">Other PSC</option>
              </Select>
            </Field>
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Capacity">
            <Input value={capacity} inputMode="numeric" onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Description (optional)">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
