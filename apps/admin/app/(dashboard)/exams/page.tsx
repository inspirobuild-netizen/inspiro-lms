'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field } from '@/components/ui/modal';
import { ApiError } from '@/lib/api';
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
      width: 'w-56',
      render: (e) => (
        <div className="flex gap-2 justify-end">
          <Link href={`/exams/${e.id}`}>
            <Button variant="outline" size="sm">Questions</Button>
          </Link>
          {!e.isPublished && (
            <Button
              variant="ghost"
              size="sm"
              loading={publish.isPending && publish.variables === e.id}
              onClick={() => publish.mutate(e.id)}
            >
              Publish
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
          <h2 className="font-display font-bold text-2xl text-slate-100">Exams</h2>
          <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} exams</p>
        </div>
        <div className="flex gap-2">
          <NewExamButton onCreated={() => void qc.invalidateQueries({ queryKey: ['admin', 'exams'] })} />
          <Link href="/exams/generate">
            <Button size="sm" variant="outline">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" />
              </svg>
              Generate with AI
            </Button>
          </Link>
        </div>
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

function NewExamButton({ onCreated }: { onCreated: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('General Studies');
  const [type, setType] = useState('practice');
  const [durationMins, setDurationMins] = useState('60');
  const [negMarks, setNegMarks] = useState('0.25');
  const [passPercent, setPassPercent] = useState('40');
  const [maxAttempts, setMaxAttempts] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/admin/exams', {
        title: title.trim(),
        subject,
        type,
        durationMins: Number(durationMins) || 60,
        negMarks: Number(negMarks) || 0,
        passPercent: Number(passPercent) || 40,
        maxAttempts: Number(maxAttempts) || 1,
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle(''); setError(null);
      onCreated();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create exam'),
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New exam</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create exam" description="Created as a draft — add questions, then publish">
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kerala PSC Mock Test #1" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="General Studies" />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="practice">Practice</option>
                <option value="chapter">Chapter test</option>
                <option value="mock">Mock exam</option>
                <option value="previous_year">Previous year</option>
              </Select>
            </Field>
            <Field label="Duration (mins)">
              <Input value={durationMins} inputMode="numeric" onChange={(e) => setDurationMins(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Negative marks / wrong">
              <Input value={negMarks} inputMode="decimal" onChange={(e) => setNegMarks(e.target.value.replace(/[^0-9.]/g, ''))} />
            </Field>
            <Field label="Pass %">
              <Input value={passPercent} inputMode="numeric" onChange={(e) => setPassPercent(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Max attempts">
              <Input value={maxAttempts} inputMode="numeric" onChange={(e) => setMaxAttempts(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={title.trim().length < 2} onClick={() => create.mutate()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
