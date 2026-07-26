'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Field, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

type Role = { id: string; name: string; slug: string; description: string | null; isSystem: boolean; memberCount: number };
type Perm = { code: string; label: string; category: string };
type RoleDetail = Role & { permissions: string[] };

export default function RolesPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const rolesQ = useQuery({ queryKey: ['admin', 'staff-roles'], queryFn: () => api.get<Role[]>('/api/v1/admin/staff-roles'), enabled: !!accessToken });
  const catalogQ = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => api.get<Perm[]>('/api/v1/admin/permissions'), enabled: !!accessToken });

  const roles = rolesQ.data?.data ?? [];
  const activeId = selected ?? roles[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Roles &amp; Permissions</h2>
          <p className="text-slate-400 text-sm mt-1">Data-driven staff roles — add a role any time, no code change.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Add role</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles list */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-3 space-y-1 h-fit">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${r.id === activeId ? 'bg-brand-violet/20' : 'hover:bg-surface-high'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${r.id === activeId ? 'text-violet-200' : 'text-slate-200'}`}>{r.name}</span>
                {r.isSystem && <Badge variant="slate">system</Badge>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{r.memberCount} member{r.memberCount === 1 ? '' : 's'}</p>
            </button>
          ))}
          {roles.length === 0 && <p className="text-sm text-slate-500 p-3">No roles yet.</p>}
        </div>

        {/* Permission matrix */}
        <div className="lg:col-span-2">
          {activeId && catalogQ.data ? (
            <PermissionMatrix roleId={activeId} catalog={catalogQ.data.data} role={roles.find((r) => r.id === activeId)!} onChanged={() => void qc.invalidateQueries({ queryKey: ['admin', 'staff-roles'] })} />
          ) : (
            <div className="rounded-2xl border border-white/8 bg-surface-1 p-8 text-center text-slate-500">Select a role to edit its permissions.</div>
          )}
        </div>
      </div>

      <AddRoleModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={(id) => { setAddOpen(false); setSelected(id); void qc.invalidateQueries({ queryKey: ['admin', 'staff-roles'] }); }} />
    </div>
  );
}

function PermissionMatrix({ roleId, catalog, role, onChanged }: { roleId: string; catalog: Perm[]; role: Role; onChanged: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const detailQ = useQuery({ queryKey: ['admin', 'staff-role', roleId], queryFn: () => api.get<RoleDetail>(`/api/v1/admin/staff-roles/${roleId}`), enabled: !!accessToken });

  const [sel, setSel] = useState<Set<string> | null>(null);
  const [lastRole, setLastRole] = useState<string | null>(null);
  if (detailQ.data && lastRole !== roleId) {
    setLastRole(roleId);
    setSel(new Set(detailQ.data.data.permissions));
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Perm[]>();
    for (const p of catalog) { const arr = m.get(p.category) ?? []; arr.push(p); m.set(p.category, arr); }
    return [...m.entries()];
  }, [catalog]);

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/admin/staff-roles/${roleId}/permissions`, { permissions: [...(sel ?? [])] }),
    onSuccess: () => { toast('Permissions updated', 'success'); void qc.invalidateQueries({ queryKey: ['admin', 'staff-role', roleId] }); onChanged(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/api/v1/admin/staff-roles/${roleId}`),
    onSuccess: () => { toast('Role deleted', 'success'); onChanged(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  if (!sel) return <div className="rounded-2xl border border-white/8 bg-surface-1 p-8 text-slate-500">Loading permissions…</div>;

  const toggle = (code: string) => setSel((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-200">{role.name}</h3>
          {role.description && <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>}
        </div>
        <span className="text-xs text-slate-500">{sel.size} selected</span>
      </div>

      <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">
        {grouped.map(([category, perms]) => (
          <div key={category}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{category}</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {perms.map((p) => (
                <label key={p.code} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-high cursor-pointer text-sm">
                  <input type="checkbox" checked={sel.has(p.code)} onChange={() => toggle(p.code)} className="accent-brand-violet" />
                  <span className="text-slate-300">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/8">
        <div>
          {!role.isSystem && (
            <Button variant="destructive" size="sm" loading={del.isPending} onClick={async () => {
              if (await confirm({ title: `Delete role "${role.name}"?`, message: role.memberCount > 0 ? 'This role still has members — reassign them first.' : 'This cannot be undone.', destructive: true, confirmLabel: 'Delete role' })) del.mutate();
            }}>Delete role</Button>
          )}
        </div>
        <Button loading={save.isPending} onClick={() => save.mutate()}>Save permissions</Button>
      </div>
    </div>
  );
}

function AddRoleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>('/api/v1/admin/staff-roles', { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (r) => { setName(''); setDescription(''); setError(null); onCreated(r.data.id); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create role'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add role" description="Create a new staff role, then grant it permissions.">
      <div className="space-y-4">
        <Field label="Role name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Regional Coordinator" autoFocus /></Field>
        <Field label="Description (optional)"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}>Create role</Button>
        </div>
      </div>
    </Modal>
  );
}
