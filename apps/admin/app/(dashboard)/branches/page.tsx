'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Field, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

type Branch = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
};

export default function BranchesPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'branches', page],
    queryFn: () => api.get<Branch[]>(`/api/v1/admin/branches?page=${page}&limit=${limit}`),
    enabled: !!accessToken,
  });

  const columns: Column<Branch>[] = [
    { key: 'name', header: 'Branch', render: (b) => (
      <div>
        <p className="font-medium text-slate-200">{b.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{b.address || '—'}</p>
      </div>
    ) },
    { key: 'code', header: 'Code', width: 'w-28', render: (b) => <span className="font-mono text-slate-300">{b.code}</span> },
    { key: 'phone', header: 'Phone', width: 'w-40', render: (b) => <span className="text-slate-400">{b.phone || '—'}</span> },
    { key: 'status', header: 'Status', width: 'w-24', render: (b) => (
      <Badge variant={b.isActive ? 'success' : 'slate'}>{b.isActive ? 'Active' : 'Inactive'}</Badge>
    ) },
    { key: 'actions', header: '', width: 'w-20', render: (b) => (
      <Button variant="outline" size="sm" onClick={() => { setEditing(b); setOpen(true); }}>Edit</Button>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Branches</h2>
          <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} branches / centres</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>+ Add branch</Button>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(b) => b.id} emptyMessage="No branches yet" />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />

      <BranchModal
        open={open}
        branch={editing}
        onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); void qc.invalidateQueries({ queryKey: ['admin', 'branches'] }); }}
      />
    </div>
  );
}

function BranchModal({ open, branch, onClose, onSaved }: { open: boolean; branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const isEdit = !!branch;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync fields when the modal opens for a given branch
  const [lastId, setLastId] = useState<string | null>(null);
  if (open && (branch?.id ?? null) !== lastId) {
    setLastId(branch?.id ?? null);
    setName(branch?.name ?? '');
    setCode(branch?.code ?? '');
    setAddress(branch?.address ?? '');
    setPhone(branch?.phone ?? '');
    setIsActive(branch?.isActive ?? true);
    setError(null);
  }

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: name.trim(), address: address.trim() || undefined, phone: phone.trim() || undefined };
      if (isEdit) return api.patch(`/api/v1/admin/branches/${branch!.id}`, { ...body, isActive });
      return api.post('/api/v1/admin/branches', { ...body, code: code.trim() });
    },
    onSuccess: () => { toast(isEdit ? 'Branch updated' : 'Branch created', 'success'); onSaved(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save branch'),
  });

  const valid = name.trim().length >= 1 && (isEdit || /^[A-Za-z0-9_-]+$/.test(code.trim()));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit branch' : 'Add branch'}>
      <div className="space-y-4">
        <Field label="Branch name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trivandrum Main" autoFocus /></Field>
        {!isEdit && (
          <Field label="Code (unique)"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TVM" /></Field>
        )}
        <Field label="Address"><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city…" /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" /></Field>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-brand-violet" />
            Active
          </label>
        )}
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{isEdit ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}
