'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Textarea, Field } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { formatDate, formatPhone } from '@/lib/utils';

type StudentRow = { id: string; name: string; phone: string; email: string | null; createdAt: string };
type Counts = { pending: number; verified: number; rejected: number };

const tabs = [
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
] as const;

export default function VerificationPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [status, setStatus] = useState<'pending' | 'verified' | 'rejected'>('pending');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rejectTarget, setRejectTarget] = useState<StudentRow | null>(null);
  const [changesTarget, setChangesTarget] = useState<StudentRow | null>(null);
  const limit = 20;

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout((onSearch as { t?: ReturnType<typeof setTimeout> }).t);
    (onSearch as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => { setDebounced(v); setPage(1); }, 400);
  }

  const countsQ = useQuery({ queryKey: ['verification', 'counts'], queryFn: () => api.get<Counts>('/api/v1/admin/students/verification/counts'), enabled: !!accessToken });

  const { data, isLoading } = useQuery({
    queryKey: ['verification', 'list', status, page, debounced],
    queryFn: () => {
      const p = new URLSearchParams({ status, page: String(page), limit: String(limit) });
      if (debounced) p.set('search', debounced);
      return api.get<StudentRow[]>(`/api/v1/admin/students/verification?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['verification'] }); };

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/admin/students/${id}/approve`),
    onSuccess: () => { toast('Student approved', 'success'); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const columns: Column<StudentRow>[] = [
    { key: 'name', header: 'Student', render: (s) => (
      <div>
        <p className="font-medium text-slate-200">{s.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{formatPhone(s.phone)}{s.email ? ` · ${s.email}` : ''}</p>
      </div>
    ) },
    { key: 'requested', header: 'Requested', width: 'w-32', render: (s) => <span className="text-slate-400">{formatDate(s.createdAt)}</span> },
    { key: 'actions', header: '', width: 'w-72', render: (s) => (
      <div className="flex gap-2 justify-end">
        {status === 'pending' && (
          <>
            <Button size="sm" variant="outline" onClick={() => setChangesTarget(s)}>Request changes</Button>
            <Button size="sm" variant="destructive" onClick={() => setRejectTarget(s)}>Reject</Button>
            <Button size="sm" loading={approve.isPending} onClick={async () => {
              if (await confirm({ title: `Approve ${s.name}?`, message: 'They will get full course access immediately.', confirmLabel: 'Approve' })) approve.mutate(s.id);
            }}>Approve</Button>
          </>
        )}
        {status === 'rejected' && (
          <Button size="sm" onClick={async () => {
            if (await confirm({ title: `Approve ${s.name}?`, confirmLabel: 'Approve' })) approve.mutate(s.id);
          }}>Approve anyway</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Student Verification</h2>
        <p className="text-slate-400 text-sm mt-1">Review and approve student accounts before they get course access</p>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              status === t.key ? 'bg-brand-violet text-white' : 'bg-surface-2 text-slate-400 hover:bg-surface-high'
            }`}
          >
            {t.label} <span className="opacity-70">({countsQ.data?.data[t.key] ?? 0})</span>
          </button>
        ))}
      </div>

      <Input placeholder="Search name, phone, email…" value={search} onChange={(e) => onSearch(e.target.value)} className="max-w-xs" />

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(s) => s.id} emptyMessage={`No ${status} students`} />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />

      <RejectModal student={rejectTarget} onClose={() => setRejectTarget(null)} onDone={() => { setRejectTarget(null); toast('Student rejected', 'success'); invalidate(); }} />
      <RequestChangesModal student={changesTarget} onClose={() => setChangesTarget(null)} onDone={() => { setChangesTarget(null); toast('Requested changes — student notified', 'success'); invalidate(); }} />
    </div>
  );
}

function RejectModal({ student, onClose, onDone }: { student: StudentRow | null; onClose: () => void; onDone: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reject = useMutation({
    mutationFn: () => api.post(`/api/v1/admin/students/${student!.id}/reject`, { reason: reason.trim() }),
    onSuccess: () => { setReason(''); setError(null); onDone(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to reject'),
  });

  return (
    <Modal open={!!student} onClose={onClose} title={`Reject ${student?.name ?? ''}`} description="They will be notified with this reason.">
      <div className="space-y-4">
        <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ID proof unclear" autoFocus /></Field>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate()}>Reject</Button>
        </div>
      </div>
    </Modal>
  );
}

function RequestChangesModal({ student, onClose, onDone }: { student: StudentRow | null; onClose: () => void; onDone: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => api.post(`/api/v1/admin/students/${student!.id}/request-changes`, { note: note.trim() }),
    onSuccess: () => { setNote(''); setError(null); onDone(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to send'),
  });

  return (
    <Modal open={!!student} onClose={onClose} title={`Request changes from ${student?.name ?? ''}`} description="They stay pending, but get notified with this note.">
      <div className="space-y-4">
        <Field label="Note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please upload a clearer photo ID" autoFocus /></Field>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={send.isPending} disabled={note.trim().length < 3} onClick={() => send.mutate()}>Send</Button>
        </div>
      </div>
    </Modal>
  );
}
