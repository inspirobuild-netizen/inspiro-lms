'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore, useHasPermission } from '@/lib/auth';
import { StatCard } from '@/components/shared/stat-card';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { PaymentModal } from '@/components/shared/payment-modal';
import { formatDate, formatPhone, money } from '@/lib/utils';

type BreakdownRow = { id: string; name: string; admissions: number; billed: number; collected: number; outstanding: number };
type Overview = {
  totals: { admissions: number; billed: number; collected: number; outstanding: number; overdue: number };
  byBranch: BreakdownRow[];
  byCounsellor: BreakdownRow[];
  byCourse: BreakdownRow[];
};
type OutstandingRow = {
  installmentId: string;
  label: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  admissionId: string;
  admissionNo: string;
  studentName: string | null;
  studentPhone: string | null;
  counsellorName: string | null;
  branchName: string | null;
};
type Option = { id: string; name: string };
type CourseOption = { id: string; title: string };
type PaymentAccount = {
  id: string;
  name: string;
  vpa: string;
  payeeName: string;
  branchId: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
};

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export default function FeesPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [branchId, setBranchId] = useState('');
  const [counsellorId, setCounsellorId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);
  const [payFor, setPayFor] = useState<OutstandingRow | null>(null);
  const limit = 20;

  const branchesQ = useQuery({ queryKey: ['admin', 'branches', 'all'], queryFn: () => api.get<Option[]>('/api/v1/admin/branches?limit=100'), enabled: !!accessToken });
  const staffQ = useQuery({ queryKey: ['admin', 'staff', 'all'], queryFn: () => api.get<Option[]>('/api/v1/admin/staff?limit=100'), enabled: !!accessToken });
  const coursesQ = useQuery({ queryKey: ['admin', 'courses', 'all'], queryFn: () => api.get<CourseOption[]>('/api/v1/courses?limit=100'), enabled: !!accessToken });

  const filterParams = () => {
    const p = new URLSearchParams();
    if (branchId) p.set('branchId', branchId);
    if (counsellorId) p.set('counsellorId', counsellorId);
    if (courseId) p.set('courseId', courseId);
    return p;
  };

  const overviewQ = useQuery({
    queryKey: ['admin', 'fees', 'overview', branchId, counsellorId, courseId],
    queryFn: () => api.get<Overview>(`/api/v1/admin/fees/overview?${filterParams().toString()}`),
    enabled: !!accessToken,
  });

  const outstandingQ = useQuery({
    queryKey: ['admin', 'fees', 'outstanding', branchId, counsellorId, courseId, page],
    queryFn: () => {
      const p = filterParams();
      p.set('page', String(page));
      p.set('limit', String(limit));
      return api.get<OutstandingRow[]>(`/api/v1/admin/fees/outstanding?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const o = overviewQ.data?.data;
  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date(new Date().toISOString().slice(0, 10));

  const columns: Column<OutstandingRow>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div>
        <p className="font-medium text-slate-200">{r.studentName || '—'}</p>
        <p className="text-xs text-slate-500 mt-0.5">{r.admissionNo}{r.studentPhone ? ` · ${formatPhone(r.studentPhone)}` : ''}</p>
      </div>
    ) },
    { key: 'installment', header: 'Installment', width: 'w-40', render: (r) => (
      <div>
        <p className="text-slate-300">{r.label}</p>
        <p className="text-xs text-slate-500">{money(r.amount - r.paidAmount)} due</p>
      </div>
    ) },
    { key: 'due', header: 'Due', width: 'w-32', render: (r) => (
      <Badge variant={isOverdue(r.dueDate) ? 'rose' : 'slate'}>{formatDate(r.dueDate)}</Badge>
    ) },
    { key: 'counsellor', header: 'Counsellor', width: 'w-36', render: (r) => <span className="text-slate-400">{r.counsellorName || '—'}</span> },
    { key: 'branch', header: 'Branch', width: 'w-32', render: (r) => <span className="text-slate-400">{r.branchName || '—'}</span> },
    { key: 'actions', header: '', width: 'w-32', render: (r) => (
      <Button size="sm" onClick={() => setPayFor(r)}>Record payment</Button>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Fees &amp; Revenue</h2>
          <p className="text-slate-400 text-sm mt-1">Billing, collection and outstanding balances across branches, counsellors and courses</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportLink groupBy="branch" label="By branch" />
          <ExportLink groupBy="counsellor" label="By counsellor" />
          <ExportLink groupBy="course" label="By course" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total billed" value={overviewQ.isLoading ? '…' : money(o?.totals.billed ?? 0)} sub={overviewQ.isLoading ? undefined : `${o?.totals.admissions ?? 0} admissions`} accent="violet" />
        <StatCard label="Collected" value={overviewQ.isLoading ? '…' : money(o?.totals.collected ?? 0)} accent="teal" />
        <StatCard label="Outstanding" value={overviewQ.isLoading ? '…' : money(o?.totals.outstanding ?? 0)} accent="amber" />
        <StatCard label="Overdue" value={overviewQ.isLoading ? '…' : money(o?.totals.overdue ?? 0)} accent="rose" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }} className="max-w-[200px]">
          <option value="">All branches</option>
          {(branchesQ.data?.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={counsellorId} onChange={(e) => { setCounsellorId(e.target.value); setPage(1); }} className="max-w-[200px]">
          <option value="">All counsellors</option>
          {(staffQ.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setPage(1); }} className="max-w-[200px]">
          <option value="">All courses</option>
          {(coursesQ.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <BreakdownCard title="By branch" rows={o?.byBranch ?? []} loading={overviewQ.isLoading} activeId={branchId} onSelect={setBranchId} />
        <BreakdownCard title="By counsellor" rows={o?.byCounsellor ?? []} loading={overviewQ.isLoading} activeId={counsellorId} onSelect={setCounsellorId} />
        <BreakdownCard title="By course" rows={o?.byCourse ?? []} loading={overviewQ.isLoading} activeId={courseId} onSelect={setCourseId} />
      </div>

      <PaymentAccountsSection branches={branchesQ.data?.data ?? []} />

      <div>
        <h3 className="font-display font-semibold text-lg text-slate-200 mb-3">Outstanding installments</h3>
        <DataTable columns={columns} data={outstandingQ.data?.data ?? []} loading={outstandingQ.isLoading} getKey={(r) => r.installmentId} emptyMessage="Nothing outstanding 🎉" />
        <Pagination page={page} limit={limit} total={outstandingQ.data?.meta?.total ?? 0} onPage={setPage} />
      </div>

      <PaymentModal
        open={!!payFor}
        admissionId={payFor?.admissionId ?? null}
        installmentId={payFor?.installmentId}
        defaultAmount={payFor ? payFor.amount - payFor.paidAmount : 0}
        onClose={() => setPayFor(null)}
        onRecorded={() => {
          setPayFor(null);
          void qc.invalidateQueries({ queryKey: ['admin', 'fees'] });
        }}
      />
    </div>
  );
}

function BreakdownCard({
  title, rows, loading, activeId, onSelect,
}: {
  title: string;
  rows: BreakdownRow[];
  loading: boolean;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const maxAmount = Math.max(1, ...rows.map((r) => r.billed));
  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
      <h3 className="font-semibold text-slate-200 mb-3 text-sm">{title}</h3>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No billed admissions yet</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(activeId === r.id ? '' : r.id)}
              className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${activeId === r.id ? 'bg-brand-violet/15 border border-brand-violet/40' : 'bg-surface-2 hover:bg-surface-high border border-transparent'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-200 truncate">{r.name}</p>
                <span className="text-xs text-slate-500 shrink-0">{r.admissions}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 mt-1.5 overflow-hidden">
                <div className="h-full bg-brand-violet rounded-full" style={{ width: `${(r.billed / maxAmount) * 100}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-1">{money(r.collected)} of {money(r.billed)}{r.outstanding > 0 ? ` · ${money(r.outstanding)} due` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentAccountsSection({ branches }: { branches: Option[] }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const can = useHasPermission();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);

  const canConfigure = can('fees.configure');
  const accountsQ = useQuery({
    queryKey: ['admin', 'payment-accounts'],
    queryFn: () => api.get<PaymentAccount[]>('/api/v1/admin/payment-accounts'),
    enabled: !!accessToken && canConfigure,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/payment-accounts/${id}`),
    onSuccess: () => { toast('Payment account removed', 'success'); void qc.invalidateQueries({ queryKey: ['admin', 'payment-accounts'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed to remove account', 'error'),
  });

  if (!canConfigure) return null;

  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? '—' : 'Any branch');
  const accounts = accountsQ.data?.data ?? [];

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-200 text-sm">Payment accounts</h3>
          <p className="text-xs text-slate-500 mt-0.5">Inspiro&apos;s own UPI/bank accounts — pick one at collection time to generate the QR against</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>+ Add account</Button>
      </div>

      {accountsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-slate-500">No payment accounts configured yet — add one to enable UPI QR collection.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-200 truncate">{a.name}</p>
                  {a.isDefault && <Badge>Default</Badge>}
                  {!a.isActive && <Badge variant="slate">Inactive</Badge>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{a.vpa} · {a.payeeName} · {branchName(a.branchId)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => { setEditing(a); setOpen(true); }}>Edit</Button>
                <button
                  className="text-xs text-rose-400/70 hover:text-rose-400 px-2"
                  onClick={() => { if (confirm(`Remove payment account "${a.name}"?`)) remove.mutate(a.id); }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PaymentAccountModal
        open={open}
        account={editing}
        branches={branches}
        onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); void qc.invalidateQueries({ queryKey: ['admin', 'payment-accounts'] }); }}
      />
    </div>
  );
}

function PaymentAccountModal({
  open, account, branches, onClose, onSaved,
}: {
  open: boolean;
  account: PaymentAccount | null;
  branches: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const isEdit = !!account;

  const [name, setName] = useState('');
  const [vpa, setVpa] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setVpa(account?.vpa ?? '');
    setPayeeName(account?.payeeName ?? 'Inspiro IAS Academy');
    setBranchId(account?.branchId ?? '');
    setIsActive(account?.isActive ?? true);
    setIsDefault(account?.isDefault ?? false);
    setError(null);
  }, [open, account]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        vpa: vpa.trim(),
        payeeName: payeeName.trim(),
        branchId: branchId || null,
        isActive,
        isDefault,
      };
      return isEdit
        ? api.patch(`/api/v1/admin/payment-accounts/${account!.id}`, payload)
        : api.post('/api/v1/admin/payment-accounts', payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save account'),
  });

  const valid = name.trim().length >= 2 && vpa.trim().length >= 3 && payeeName.trim().length >= 2;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit payment account' : 'Add payment account'} description="Shown to counsellors as a QR-collection option">
      <div className="space-y-4">
        <Field label="Account label"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Head office — HDFC" autoFocus /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="UPI ID"><Input value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="academy@upi" /></Field>
          <Field label="Payee name"><Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="Inspiro IAS Academy" /></Field>
        </div>
        <Field label="Branch (optional)">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Any branch (shared account)</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-brand-violet" />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-brand-violet" />
            Default for its scope
          </label>
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{isEdit ? 'Save changes' : 'Create account'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ExportLink({ groupBy, label }: { groupBy: 'branch' | 'counsellor' | 'course'; label: string }) {
  const href = `${API_BASE}/api/v1/crm/reports/revenue?groupBy=${groupBy}`;
  return (
    <a href={href} download className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-surface-2 hover:bg-surface-high text-xs font-medium text-slate-300 transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {label}
    </a>
  );
}
