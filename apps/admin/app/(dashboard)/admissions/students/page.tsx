'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore, useHasPermission } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/modal';
import { formatDate, formatPhone, money } from '@/lib/utils';

type AdmissionRow = {
  id: string;
  admissionNo: string;
  admissionDate: string;
  feeAmount: number;
  amountPaid: number;
  paymentStatus: 'pending' | 'partial' | 'paid';
  feePlan: string | null;
  studentName: string | null;
  studentPhone: string | null;
  batchName: string | null;
  courseTitle: string | null;
  counsellorName: string | null;
};
type Option = { id: string; name: string };
type CourseOption = { id: string; title: string };
type SummaryRow = { count: number; totalFee: number; totalPaid: number };
type Summary = {
  total: number;
  byBatch: (SummaryRow & { batchId: string; batchName: string })[];
  byCourse: (SummaryRow & { courseId: string; courseTitle: string })[];
};

const paymentVariant: Record<string, 'success' | 'amber' | 'rose'> = { paid: 'success', partial: 'amber', pending: 'rose' };

export default function AdmittedStudentsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const has = useHasPermission();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [batchId, setBatchId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const limit = 20;

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout((onSearch as { t?: ReturnType<typeof setTimeout> }).t);
    (onSearch as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => { setDebounced(v); setPage(1); }, 400);
  }

  const batches = useQuery({ queryKey: ['admin', 'batches', 'all'], queryFn: () => api.get<Option[]>('/api/v1/batches?limit=100'), enabled: !!accessToken });
  const courses = useQuery({ queryKey: ['admin', 'courses', 'all'], queryFn: () => api.get<CourseOption[]>('/api/v1/courses?limit=100'), enabled: !!accessToken });
  const branches = useQuery({ queryKey: ['admin', 'branches', 'all'], queryFn: () => api.get<Option[]>('/api/v1/admin/branches?limit=100'), enabled: !!accessToken });

  const summary = useQuery({
    queryKey: ['admissions', 'summary', branchId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (branchId) p.set('branchId', branchId);
      return api.get<Summary>(`/api/v1/admissions/summary?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admissions', 'list', page, debounced, batchId, courseId, branchId, paymentStatus],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (debounced) p.set('search', debounced);
      if (batchId) p.set('batchId', batchId);
      if (courseId) p.set('courseId', courseId);
      if (branchId) p.set('branchId', branchId);
      if (paymentStatus) p.set('paymentStatus', paymentStatus);
      return api.get<AdmissionRow[]>(`/api/v1/admissions?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const s = summary.data?.data;

  const columns: Column<AdmissionRow>[] = [
    { key: 'student', header: 'Student', render: (a) => (
      <div>
        <p className="font-medium text-slate-200">{a.studentName || '—'}</p>
        <p className="text-xs text-slate-500 mt-0.5">{a.admissionNo}{a.studentPhone ? ` · ${formatPhone(a.studentPhone)}` : ''}</p>
      </div>
    ) },
    { key: 'batch', header: 'Batch', width: 'w-40', render: (a) => <span className="text-slate-300">{a.batchName || '—'}</span> },
    { key: 'course', header: 'Course', width: 'w-40', render: (a) => <span className="text-slate-300">{a.courseTitle || '—'}</span> },
    { key: 'counsellor', header: 'Counsellor', width: 'w-36', render: (a) => <span className="text-slate-400">{a.counsellorName || '—'}</span> },
    { key: 'fee', header: 'Fee', width: 'w-32', render: (a) => (
      <div>
        <p className="text-slate-300">{money(a.amountPaid)} / {money(a.feeAmount)}</p>
        <Badge variant={paymentVariant[a.paymentStatus]}>{a.paymentStatus}</Badge>
      </div>
    ) },
    { key: 'date', header: 'Admitted', width: 'w-28', render: (a) => <span className="text-slate-400">{formatDate(a.admissionDate)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Admitted Students</h2>
          <p className="text-slate-400 text-sm mt-1">Every admission — who joined which batch and course, with fee status</p>
        </div>
        {has('analytics.view_all') && (
          <Link href="/admissions/analytics" className="px-4 py-2 rounded-xl border border-white/10 bg-surface-2 hover:bg-surface-high text-sm font-medium text-slate-200 transition-colors">Analytics</Link>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total admissions" value={summary.isLoading ? '…' : s?.total ?? 0} accent="violet" />
        <StatCard label="Batches with admissions" value={summary.isLoading ? '…' : s?.byBatch.length ?? 0} accent="teal" />
        <StatCard label="Courses with admissions" value={summary.isLoading ? '…' : s?.byCourse.length ?? 0} accent="amber" />
        <StatCard
          label="Fees collected"
          value={summary.isLoading ? '…' : money((s?.byBatch ?? []).reduce((sum, b) => sum + b.totalPaid, 0))}
          sub={summary.isLoading ? undefined : `of ${money((s?.byBatch ?? []).reduce((sum, b) => sum + b.totalFee, 0))}`}
          accent="rose"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <BreakdownCard
          title="By batch"
          rows={(s?.byBatch ?? []).map((b) => ({ id: b.batchId, label: b.batchName, count: b.count }))}
          onSelect={(id) => { setBatchId(id); setPage(1); }}
          active={batchId}
          money={money}
          fullRows={s?.byBatch}
        />
        <BreakdownCard
          title="By course"
          rows={(s?.byCourse ?? []).map((c) => ({ id: c.courseId, label: c.courseTitle, count: c.count }))}
          onSelect={(id) => { setCourseId(id); setPage(1); }}
          active={courseId}
          money={money}
          fullRows={s?.byCourse}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search name or admission no…" value={search} onChange={(e) => onSearch(e.target.value)} className="max-w-xs" />
        <Select value={batchId} onChange={(e) => { setBatchId(e.target.value); setPage(1); }} className="max-w-[200px]">
          <option value="">All batches</option>
          {(batches.data?.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setPage(1); }} className="max-w-[200px]">
          <option value="">All courses</option>
          {(courses.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }} className="max-w-[180px]">
          <option value="">All branches</option>
          {(branches.data?.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }} className="max-w-[160px]">
          <option value="">All payment status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(a) => a.id} emptyMessage="No admissions match these filters" />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function BreakdownCard({
  title, rows, onSelect, active, money, fullRows,
}: {
  title: string;
  rows: { id: string; label: string; count: number }[];
  onSelect: (id: string) => void;
  active: string;
  money: (n: number) => string;
  fullRows?: SummaryRow[];
}) {
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
      <h3 className="font-semibold text-slate-200 mb-3 text-sm">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No admissions yet</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const fee = fullRows?.[i];
            return (
              <button
                key={r.id}
                onClick={() => onSelect(active === r.id ? '' : r.id)}
                className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${active === r.id ? 'bg-brand-violet/15 border border-brand-violet/40' : 'bg-surface-2 hover:bg-surface-high border border-transparent'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200 truncate">{r.label}</p>
                  <span className="text-sm font-semibold text-slate-100 shrink-0">{r.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 mt-1.5 overflow-hidden">
                  <div className="h-full bg-brand-violet rounded-full" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                </div>
                {fee && <p className="text-xs text-slate-500 mt-1">{money(fee.totalPaid)} collected of {money(fee.totalFee)}</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
