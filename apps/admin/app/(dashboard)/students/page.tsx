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
};

export default function StudentsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
        <AddStudentButton onCreated={() => void qc.invalidateQueries({ queryKey: ['admin', 'users'] })} />
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

function AddStudentButton({ onCreated }: { onCreated: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [targetExam, setTargetExam] = useState('kerala_psc');
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
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Target exam">
              <Select value={targetExam} onChange={(e) => setTargetExam(e.target.value)}>
                <option value="kerala_psc">Kerala PSC</option>
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
