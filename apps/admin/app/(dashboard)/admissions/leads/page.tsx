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
import { useToast } from '@/components/ui/toast';
import { formatDate, formatPhone } from '@/lib/utils';

type LeadRow = {
  id: string; leadCode: string; studentName: string; phone: string; email: string | null;
  city: string | null; courseInterested: string | null; source: string; priority: string; status: string;
  ownerName: string | null; nextFollowupAt: string | null; createdAt: string;
};

const priorityVariant: Record<string, 'rose' | 'amber' | 'slate'> = { hot: 'rose', warm: 'amber', cold: 'slate' };
const statusLabel: Record<string, string> = {
  new: 'New', contacted: 'Contacted', interested: 'Interested', demo: 'Demo', counselling: 'Counselling',
  fee_discussion: 'Fee discussion', admission_confirmed: 'Admission confirmed', converted: 'Converted',
  not_interested: 'Not interested', lost: 'Lost',
};

export default function LeadsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [open, setOpen] = useState(false);
  const limit = 20;

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout((onSearch as { t?: ReturnType<typeof setTimeout> }).t);
    (onSearch as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => { setDebounced(v); setPage(1); }, 400);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'leads', page, debounced, status, priority],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (debounced) p.set('search', debounced);
      if (status) p.set('status', status);
      if (priority) p.set('priority', priority);
      return api.get<LeadRow[]>(`/api/v1/leads?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const columns: Column<LeadRow>[] = [
    { key: 'name', header: 'Lead', render: (l) => (
      <Link href={`/admissions/leads/${l.id}`} className="block group">
        <p className="font-medium text-slate-200 group-hover:text-violet-300">{l.studentName}</p>
        <p className="text-xs text-slate-500 mt-0.5">{l.leadCode} · {formatPhone(l.phone)}</p>
      </Link>
    ) },
    { key: 'course', header: 'Course', width: 'w-48', render: (l) => <span className="text-slate-400">{l.courseInterested || '—'}</span> },
    { key: 'priority', header: 'Priority', width: 'w-24', render: (l) => <Badge variant={priorityVariant[l.priority]}>{l.priority}</Badge> },
    { key: 'status', header: 'Status', width: 'w-40', render: (l) => <Badge variant={l.status === 'converted' ? 'success' : 'default'}>{statusLabel[l.status] ?? l.status}</Badge> },
    { key: 'owner', header: 'Owner', width: 'w-36', render: (l) => <span className="text-slate-400">{l.ownerName || '—'}</span> },
    { key: 'followup', header: 'Next follow-up', width: 'w-32', render: (l) => <span className="text-slate-400">{l.nextFollowupAt ? formatDate(l.nextFollowupAt) : '—'}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Leads</h2>
          <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} leads</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add lead</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search name, phone, lead code…" value={search} onChange={(e) => onSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="max-w-[180px]">
          <option value="">All statuses</option>
          {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="max-w-[160px]">
          <option value="">All priorities</option>
          <option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(l) => l.id} emptyMessage="No leads found" />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />

      <AddLeadModal open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void qc.invalidateQueries({ queryKey: ['crm', 'leads'] }); }} />
    </div>
  );
}

function AddLeadModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();

  const [f, setF] = useState({ studentName: '', parentName: '', phone: '', email: '', city: '', courseInterested: '', source: 'website', priority: 'warm', remarks: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const create = useMutation({
    mutationFn: () => api.post('/api/v1/leads', {
      studentName: f.studentName.trim(), parentName: f.parentName.trim() || undefined, phone: f.phone.trim(),
      email: f.email.trim() || undefined, city: f.city.trim() || undefined, courseInterested: f.courseInterested.trim() || undefined,
      source: f.source, priority: f.priority, remarks: f.remarks.trim() || undefined,
    }),
    onSuccess: () => {
      toast('Lead created', 'success');
      setF({ studentName: '', parentName: '', phone: '', email: '', city: '', courseInterested: '', source: 'website', priority: 'warm', remarks: '' });
      setError(null);
      onCreated();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create lead'),
  });

  const valid = f.studentName.trim().length >= 2 && f.phone.trim().length >= 6;

  return (
    <Modal open={open} onClose={onClose} title="Add lead" wide>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Student name"><Input value={f.studentName} onChange={(e) => set('studentName')(e.target.value)} autoFocus /></Field>
        <Field label="Parent name"><Input value={f.parentName} onChange={(e) => set('parentName')(e.target.value)} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="+91…" /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set('city')(e.target.value)} /></Field>
        <Field label="Course interested"><Input value={f.courseInterested} onChange={(e) => set('courseInterested')(e.target.value)} /></Field>
        <Field label="Source">
          <Select value={f.source} onChange={(e) => set('source')(e.target.value)}>
            {['facebook', 'instagram', 'google', 'website', 'walk_in', 'referral', 'seminar', 'campaign', 'other'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={f.priority} onChange={(e) => set('priority')(e.target.value)}>
            <option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
          </Select>
        </Field>
        <div className="col-span-2"><Field label="Remarks"><Textarea rows={2} value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} /></Field></div>
      </div>
      {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>Create lead</Button>
      </div>
    </Modal>
  );
}
