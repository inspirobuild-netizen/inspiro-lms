'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field } from '@/components/ui/modal';
import { formatDate, formatPhone } from '@/lib/utils';

type User = {
  id: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  appDevices: string[];
};

/** "today", "3 days ago", "12 Nov 2026" */
function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}

export default function StudentsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [appStatus, setAppStatus] = useState<'' | 'signed_in' | 'never'>('');
  const limit = 20;

  // Prefill from ?q= (e.g. arriving via the global search dropdown)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
      setSearch(q);
      setDebouncedSearch(q);
    }
  }, []);

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
    queryKey: ['admin', 'users', page, debouncedSearch, appStatus],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        role: 'student',
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(appStatus ? { appStatus } : {}),
      });
      return api.get<User[]>(`/api/v1/admin/users?${params.toString()}`);
    },
    enabled: !!accessToken,
  });

  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [deleting, setDeleting] = useState<User | null>(null);

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
      key: 'app',
      header: 'App',
      width: 'w-44',
      render: (u) =>
        u.lastActiveAt ? (
          <div>
            <p className="text-slate-300 text-sm">
              {u.appDevices.length ? u.appDevices.map((d) => (d === 'ios' ? 'iPhone' : 'Android')).join(' + ') : 'Signed in'}
            </p>
            <p className="text-xs text-slate-500">active {ago(u.lastActiveAt)}</p>
          </div>
        ) : (
          <span className="text-xs text-slate-500">Never signed in</span>
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
      width: isAdmin ? 'w-48' : 'w-28',
      render: (u) => (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            loading={toggleStatus.isPending && (toggleStatus.variables as { id: string })?.id === u.id}
            onClick={() => toggleStatus.mutate({ id: u.id, isActive: !u.isActive })}
          >
            {u.isActive ? 'Disable' : 'Enable'}
          </Button>
          {isAdmin && (
            <Button variant="destructive" size="sm" onClick={() => setDeleting(u)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Students</h2>
          <p className="text-slate-400 text-sm mt-1">
            {data?.meta?.total ?? 0} {appStatus === 'signed_in' ? 'students using the app' : appStatus === 'never' ? 'students who never signed in' : 'registered students'}
          </p>
        </div>
        <AddStudentButton onCreated={() => void qc.invalidateQueries({ queryKey: ['admin', 'users'] })} />
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={appStatus}
          onChange={(e) => { setAppStatus(e.target.value as typeof appStatus); setPage(1); }}
          className="max-w-[220px]"
        >
          <option value="">All students</option>
          <option value="signed_in">Using the app</option>
          <option value="never">Never signed in</option>
        </Select>
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

      <DeleteStudentModal
        student={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          void qc.invalidateQueries({ queryKey: ['admin'] });
        }}
      />
    </div>
  );
}

type DeletionImpact = {
  name: string;
  phone: string;
  admissions: string[];
  confirmedPaid: number;
  paymentEntries: number;
  leads: number;
  enrolments: number;
  enrolmentRequests: number;
  testAttempts: number;
  doubts: number;
  lessonsWatched: number;
};

/**
 * Permanent deletion. Shows exactly what goes, asks for DELETE typed, and a
 * second tick when confirmed fee payments would disappear. Admins only.
 */
function DeleteStudentModal({
  student, onClose, onDeleted,
}: { student: User | null; onClose: () => void; onDeleted: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [typed, setTyped] = useState('');
  const [paidOk, setPaidOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTyped(''); setPaidOk(false); setError(null);
  }, [student?.id]);

  const impactQ = useQuery({
    queryKey: ['admin', 'student-deletion-impact', student?.id],
    queryFn: () => api.get<DeletionImpact>(`/api/v1/admin/students/${student!.id}/deletion-impact`),
    enabled: !!student && !!accessToken,
  });
  const impact = impactQ.data?.data;

  const del = useMutation({
    mutationFn: () => api.delete(`/api/v1/admin/students/${student!.id}`, { confirm: 'DELETE', confirmPaid: paidOk }),
    onSuccess: onDeleted,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not delete the student'),
  });

  const needsPaidOk = (impact?.confirmedPaid ?? 0) > 0;
  const ready = typed === 'DELETE' && (!needsPaidOk || paidOk) && !!impact;

  const rows: [string, number | string][] = impact
    ? ([
        ['Admissions', impact.admissions.length ? impact.admissions.join(', ') : 0],
        ['Fee payment entries', impact.paymentEntries],
        ['CRM leads with this number', impact.leads],
        ['Batch enrolments', impact.enrolments],
        ['Enrolment requests', impact.enrolmentRequests],
        ['Test attempts', impact.testAttempts],
        ['Doubts', impact.doubts],
        ['Lessons watched', impact.lessonsWatched],
      ] as [string, number | string][]).filter(([, v]) => v !== 0)
    : [];

  return (
    <Modal
      open={!!student}
      onClose={onClose}
      title="Delete student permanently"
      description="Removes the account and everything linked to it. This cannot be undone."
    >
      <div className="space-y-4">
        <div>
          <p className="font-medium text-slate-200">{student?.name || '—'}</p>
          <p className="text-xs text-slate-500">{student ? formatPhone(student.phone) : ''}</p>
        </div>

        {impactQ.isLoading && <p className="text-sm text-slate-400">Checking what will be removed…</p>}
        {impact && (
          <div className="rounded-xl border border-white/10 p-3 text-sm">
            <p className="text-slate-300 mb-2">Also removed:</p>
            {rows.length === 0 ? (
              <p className="text-slate-500">Nothing else — the account has no admissions, leads or activity.</p>
            ) : (
              <ul className="space-y-1">
                {rows.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-4">
                    <span className="text-slate-400">{k}</span>
                    <span className="text-slate-200 text-right">{v}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500 mt-3">
              Afterwards the number is free: the student can sign up again as a new account.
            </p>
          </div>
        )}

        {needsPaidOk && (
          <label className="flex items-start gap-2 text-sm text-amber-300">
            <input type="checkbox" className="mt-1" checked={paidOk} onChange={(e) => setPaidOk(e.target.checked)} />
            <span>
              This student has <b>₹{impact!.confirmedPaid.toLocaleString('en-IN')}</b> of confirmed payments. I understand
              these fee records will be removed from the books.
            </span>
          </label>
        )}

        <Field label="Type DELETE to confirm">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoFocus />
        </Field>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" loading={del.isPending} disabled={!ready} onClick={() => del.mutate()}>
            Delete permanently
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddStudentButton({ onCreated }: { onCreated: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [targetExam, setTargetExam] = useState('upsc');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/admin/users', {
        name: name.trim(),
        phone: `+91${phone}`,
        ...(email.trim() ? { email: email.trim() } : {}),
        role,
        targetExam,
      }),
    onSuccess: () => {
      setOpen(false);
      setName(''); setPhone(''); setEmail(''); setRole('student');
      setError(null);
      onCreated();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create user'),
  });

  const valid = name.trim().length >= 2 && /^[6-9]\d{9}$/.test(phone);

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Add student</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add user" description="Students sign in with OTP on this phone number">
        <div className="space-y-4">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Arun Krishnan" autoFocus />
          </Field>
          <Field label="Mobile number">
            <div className="flex gap-2">
              <span className="flex items-center px-3 h-10 rounded-xl bg-surface-2 border border-white/10 text-slate-400 text-sm select-none">+91</span>
              <Input
                value={phone}
                inputMode="numeric"
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(-10))}
                placeholder="98765 43210"
                className="flex-1"
              />
            </div>
            {phone.length > 0 && !/^[6-9]\d{9}$/.test(phone) && (
              <p className="text-xs text-amber-400 mt-1">Enter 10 digits, starting with 6-9 — don&apos;t include +91, it&apos;s added automatically</p>
            )}
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@example.com" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Target exam">
              <Select value={targetExam} onChange={(e) => setTargetExam(e.target.value)}>
                <option value="upsc">UPSC</option>
                <option value="other_psc">Other PSC</option>
              </Select>
            </Field>
          </div>
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
