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

type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  isActive: boolean;
  employeeId: string | null;
  roleName: string | null;
  branchName: string | null;
};
type RoleOpt = { id: string; name: string };
type BranchOpt = { id: string; name: string };

export default function StaffPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const limit = 20;

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout((onSearch as { t?: ReturnType<typeof setTimeout> }).t);
    (onSearch as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => { setDebounced(v); setPage(1); }, 400);
  }

  const roles = useQuery({ queryKey: ['admin', 'staff-roles'], queryFn: () => api.get<RoleOpt[]>('/api/v1/admin/staff-roles'), enabled: !!accessToken });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'staff', page, debounced, roleFilter, statusFilter],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (debounced) p.set('search', debounced);
      if (roleFilter) p.set('staffRoleId', roleFilter);
      if (statusFilter) p.set('isActive', statusFilter);
      return api.get<StaffRow[]>(`/api/v1/admin/staff?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const columns: Column<StaffRow>[] = [
    { key: 'name', header: 'Staff', render: (s) => (
      <Link href={`/staff/${s.id}`} className="block group">
        <p className="font-medium text-slate-200 group-hover:text-violet-300">{s.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{s.employeeId} · {s.email}</p>
      </Link>
    ) },
    { key: 'role', header: 'Role', width: 'w-44', render: (s) => <span className="text-slate-300">{s.roleName || '—'}</span> },
    { key: 'branch', header: 'Branch', width: 'w-40', render: (s) => <span className="text-slate-400">{s.branchName || '—'}</span> },
    { key: 'status', header: 'Status', width: 'w-24', render: (s) => (
      <Badge variant={s.isActive ? 'success' : 'slate'}>{s.isActive ? 'Active' : 'Disabled'}</Badge>
    ) },
    { key: 'actions', header: '', width: 'w-20', render: (s) => (
      <Link href={`/staff/${s.id}`}><Button variant="outline" size="sm">Manage</Button></Link>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Staff Management</h2>
          <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} staff members</p>
        </div>
        <AddStaffButton roles={roles.data?.data ?? []} onCreated={() => void qc.invalidateQueries({ queryKey: ['admin', 'staff'] })} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search name, email, phone, employee ID…" value={search} onChange={(e) => onSearch(e.target.value)} className="max-w-xs" />
        <Select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="max-w-[200px]">
          <option value="">All roles</option>
          {(roles.data?.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="max-w-[160px]">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(s) => s.id} emptyMessage="No staff found" />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function AddStaffButton({ roles, onCreated }: { roles: RoleOpt[]; onCreated: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const branches = useQuery({ queryKey: ['admin', 'branches', 'all'], queryFn: () => api.get<BranchOpt[]>('/api/v1/admin/branches?limit=100'), enabled: open && !!accessToken });

  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', staffRoleId: '', branchId: '', designation: '', department: '', whatsapp: '', gender: '', address: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const create = useMutation({
    mutationFn: () => api.post('/api/v1/admin/staff', {
      name: f.name.trim(), email: f.email.trim(), phone: `+91${f.phone}`, password: f.password,
      staffRoleId: f.staffRoleId, branchId: f.branchId || undefined,
      designation: f.designation.trim() || undefined, department: f.department.trim() || undefined,
      whatsapp: f.whatsapp.trim() || undefined, gender: f.gender || undefined, address: f.address.trim() || undefined,
    }),
    onSuccess: () => {
      toast('Staff member created — credentials emailed', 'success');
      setOpen(false); setError(null);
      setF({ name: '', email: '', phone: '', password: '', staffRoleId: '', branchId: '', designation: '', department: '', whatsapp: '', gender: '', address: '' });
      onCreated();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create staff'),
  });

  const valid = f.name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(f.email) && /^[6-9]\d{9}$/.test(f.phone) && f.password.length >= 8 && !!f.staffRoleId;

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Add staff</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add staff member" description="They sign in with this email + password" wide>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name"><Input value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="Priya Nair" autoFocus /></Field>
          <Field label="Role">
            <Select value={f.staffRoleId} onChange={(e) => set('staffRoleId')(e.target.value)}>
              <option value="">Select role…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Email (login)"><Input type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} placeholder="priya@inspiro.in" /></Field>
          <Field label="Mobile number">
            <div className="flex gap-2">
              <span className="flex items-center px-3 h-10 rounded-xl bg-surface-2 border border-white/10 text-slate-400 text-sm select-none">+91</span>
              <Input value={f.phone} inputMode="numeric" onChange={(e) => set('phone')(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" className="flex-1" />
            </div>
            {f.phone.length > 0 && !/^[6-9]\d{9}$/.test(f.phone) && (
              <p className="text-xs text-amber-400 mt-1">Enter 10 digits, starting with 6-9 — don&apos;t include +91, it&apos;s added automatically</p>
            )}
          </Field>
          <Field label="Temporary password"><Input value={f.password} onChange={(e) => set('password')(e.target.value)} placeholder="min 8 characters" /></Field>
          <Field label="Branch">
            <Select value={f.branchId} onChange={(e) => set('branchId')(e.target.value)}>
              <option value="">— None —</option>
              {(branches.data?.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Designation"><Input value={f.designation} onChange={(e) => set('designation')(e.target.value)} placeholder="Senior Counsellor" /></Field>
          <Field label="Department"><Input value={f.department} onChange={(e) => set('department')(e.target.value)} placeholder="Admissions" /></Field>
          <Field label="WhatsApp (optional)"><Input value={f.whatsapp} onChange={(e) => set('whatsapp')(e.target.value)} placeholder="+91…" /></Field>
          <Field label="Gender (optional)">
            <Select value={f.gender} onChange={(e) => set('gender')(e.target.value)}>
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </Select>
          </Field>
          <div className="col-span-2"><Field label="Address (optional)"><Textarea rows={2} value={f.address} onChange={(e) => set('address')(e.target.value)} /></Field></div>
        </div>
        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>Create staff</Button>
        </div>
      </Modal>
    </>
  );
}
