'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { RolePicker } from '@/components/shared/role-picker';

type Staff = {
  id: string; name: string; email: string | null; phone: string; isActive: boolean;
  employeeId: string | null; staffRoleId: string | null; branchId: string | null;
  designation: string | null; department: string | null; whatsapp: string | null;
  gender: string | null; address: string | null; notes: string | null;
  dob: string | null; joiningDate: string | null; roleName: string | null; branchName: string | null;
  staffRoles?: { id: string; name: string }[];
};
type DeletionImpact = {
  name: string; roles: string[];
  leadsOwned: number; followUps: number; admissions: number; paymentsHandled: number;
  doubtsInProgress: number; doubtsAnswered: number; coursesCreated: number; testsCreated: number;
  batchesTaught: number; mentorBatches: number; pastLiveClasses: number; upcomingLiveClasses: number;
  auditEntries: number;
};
type RoleOpt = { id: string; name: string };
type BranchOpt = { id: string; name: string };

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'staff', id],
    queryFn: () => api.get<Staff>(`/api/v1/admin/staff/${id}`),
    enabled: !!accessToken && !!id,
  });
  const roles = useQuery({ queryKey: ['admin', 'staff-roles'], queryFn: () => api.get<RoleOpt[]>('/api/v1/admin/staff-roles'), enabled: !!accessToken });
  const branches = useQuery({ queryKey: ['admin', 'branches', 'all'], queryFn: () => api.get<BranchOpt[]>('/api/v1/admin/branches?limit=100'), enabled: !!accessToken });

  const staff = data?.data;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'staff'] });

  const [resetOpen, setResetOpen] = useState(false);

  const toggleStatus = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/api/v1/admin/staff/${id}/status`, { isActive }),
    onSuccess: (_r, isActive) => { toast(isActive ? 'Login enabled' : 'Login disabled', 'success'); void invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });
  const forceReset = useMutation({
    mutationFn: () => api.post(`/api/v1/admin/staff/${id}/force-reset`),
    onSuccess: () => toast('They must change their password at next sign-in', 'success'),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (!staff) return <div className="text-slate-500">Staff member not found. <Link href="/staff" className="text-violet-300">Back</Link></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/staff" className="text-sm text-slate-400 hover:text-slate-200">← All staff</Link>

      {/* Header card */}
      <div className="rounded-2xl border border-white/8 bg-surface-1 p-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-violet/25 flex items-center justify-center text-violet-200 text-xl font-bold">{staff.name[0]?.toUpperCase()}</div>
          <div>
            <h2 className="font-display font-bold text-xl text-slate-100">{staff.name}</h2>
            <p className="text-sm text-slate-400">{staff.employeeId} · {staff.roleName}</p>
            <p className="text-xs text-slate-500 mt-0.5">{staff.email} · {staff.phone}</p>
          </div>
        </div>
        <Badge variant={staff.isActive ? 'success' : 'slate'}>{staff.isActive ? 'Active' : 'Disabled'}</Badge>
      </div>

      {/* Actions */}
      <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
        <h3 className="font-semibold text-slate-200 mb-3 text-sm">Login & security</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>Reset password</Button>
          <Button variant="outline" size="sm" loading={forceReset.isPending} onClick={async () => {
            if (await confirm({ title: 'Force password reset?', message: 'They will be asked to set a new password at next sign-in.', confirmLabel: 'Force reset' })) forceReset.mutate();
          }}>Force reset at next login</Button>
          <Button
            variant={staff.isActive ? 'destructive' : 'default'}
            size="sm"
            loading={toggleStatus.isPending}
            onClick={async () => {
              const disabling = staff.isActive;
              if (await confirm({ title: disabling ? 'Disable login?' : 'Enable login?', message: disabling ? 'They will be unable to sign in until re-enabled.' : undefined, destructive: disabling, confirmLabel: disabling ? 'Disable' : 'Enable' })) {
                toggleStatus.mutate(!staff.isActive);
              }
            }}
          >{staff.isActive ? 'Disable login' : 'Enable login'}</Button>
        </div>
      </div>

      {/* Permanent delete: admins only, and never yourself. */}
      {user?.role === 'admin' && user.id !== staff.id && (
        <div className="rounded-2xl border border-rose-500/20 bg-surface-1 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-200 text-sm">Delete permanently</h3>
            <p className="text-xs text-slate-500 mt-1">
              For staff added by mistake, test accounts and duplicates. To take away access but keep their name on their work, use Disable login.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>Delete staff member</Button>
        </div>
      )}

      <EditForm staff={staff} roles={roles.data?.data ?? []} branches={branches.data?.data ?? []} onSaved={() => { toast('Profile updated', 'success'); void qc.invalidateQueries({ queryKey: ['admin', 'staff', id] }); void invalidate(); }} />

      <ResetPasswordModal open={resetOpen} staffId={id} onClose={() => setResetOpen(false)} onDone={() => { setResetOpen(false); toast('Password reset — new credentials emailed', 'success'); }} />
      <DeleteStaffModal
        open={deleteOpen}
        staff={staff}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => { toast(`${staff.name} deleted`, 'success'); void invalidate(); router.push('/staff'); }}
      />
    </div>
  );
}

function DeleteStaffModal({ open, staff, onClose, onDeleted }: { open: boolean; staff: Staff; onClose: () => void; onDeleted: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const impactQ = useQuery({
    queryKey: ['admin', 'staff-deletion-impact', staff.id],
    queryFn: () => api.get<DeletionImpact>(`/api/v1/admin/staff/${staff.id}/deletion-impact`),
    enabled: open && !!accessToken,
  });
  const impact = impactQ.data?.data;

  const del = useMutation({
    mutationFn: () => api.delete(`/api/v1/admin/staff/${staff.id}`, { confirm: 'DELETE' }),
    onSuccess: onDeleted,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not delete this staff member'),
  });

  const blocked = (impact?.upcomingLiveClasses ?? 0) > 0;
  const ready = typed === 'DELETE' && !!impact && !blocked;

  // What happens to their work, in the order an admin would worry about it.
  const rows: [string, number][] = impact
    ? ([
        ['Leads that become unassigned', impact.leadsOwned],
        ['Doubts returned to the mentor queue', impact.doubtsInProgress],
        ['Batches they stop teaching', impact.batchesTaught],
        ['Batches they stop mentoring', impact.mentorBatches],
        ['Courses and tests passed to you', impact.coursesCreated + impact.testsCreated],
        ['Past live classes passed to you', impact.pastLiveClasses],
        ['Follow-ups, admissions and payments that lose their name', impact.followUps + impact.admissions + impact.paymentsHandled],
        ['Doubts they answered (answers stay)', impact.doubtsAnswered],
        ['Audit log entries (their name is kept)', impact.auditEntries],
      ] as [string, number][]).filter(([, v]) => v !== 0)
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete staff member permanently"
      description="Removes the account and its login. This cannot be undone."
    >
      <div className="space-y-4">
        <div>
          <p className="font-medium text-slate-200">{staff.name}</p>
          <p className="text-xs text-slate-500">{staff.employeeId} · {staff.roleName}</p>
        </div>

        {impactQ.isLoading && <p className="text-sm text-slate-400">Checking what this affects…</p>}
        {impact && (
          <div className="rounded-xl border border-white/10 p-3 text-sm">
            {rows.length === 0 ? (
              <p className="text-slate-500">Nothing else is affected — this account has no leads, doubts, batches or history.</p>
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
            <p className="text-xs text-slate-500 mt-3">Afterwards their email and mobile number can be used for a new account.</p>
          </div>
        )}

        {blocked && (
          <p className="text-sm text-amber-300">
            {staff.name} still has {impact!.upcomingLiveClasses} live class(es) to teach. Give those to someone else first.
          </p>
        )}

        <Field label="Type DELETE to confirm">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" disabled={blocked} />
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

function EditForm({ staff, roles, branches, onSaved }: { staff: Staff; roles: RoleOpt[]; branches: BranchOpt[]; onSaved: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  // Main role first, as the API returns them; an account from before roles
  // could be combined has just the one.
  const [roleIds, setRoleIds] = useState<string[]>(
    staff.staffRoles?.length ? staff.staffRoles.map((r) => r.id) : staff.staffRoleId ? [staff.staffRoleId] : [],
  );
  const [f, setF] = useState({
    name: staff.name, branchId: staff.branchId ?? '',
    designation: staff.designation ?? '', department: staff.department ?? '', whatsapp: staff.whatsapp ?? '',
    gender: staff.gender ?? '', address: staff.address ?? '', notes: staff.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: () => api.patch(`/api/v1/admin/staff/${staff.id}`, {
      name: f.name.trim(), staffRoleIds: roleIds, branchId: f.branchId || null,
      designation: f.designation.trim() || null, department: f.department.trim() || null,
      whatsapp: f.whatsapp.trim() || null, gender: f.gender || undefined, address: f.address.trim() || null, notes: f.notes.trim() || null,
    }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
      <h3 className="font-semibold text-slate-200 mb-4 text-sm">Profile</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name"><Input value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
        <Field label="Branch">
          <Select value={f.branchId} onChange={(e) => set('branchId')(e.target.value)}>
            <option value="">— None —</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Designation"><Input value={f.designation} onChange={(e) => set('designation')(e.target.value)} /></Field>
        <Field label="Department"><Input value={f.department} onChange={(e) => set('department')(e.target.value)} /></Field>
        <Field label="WhatsApp"><Input value={f.whatsapp} onChange={(e) => set('whatsapp')(e.target.value)} /></Field>
        <Field label="Gender">
          <Select value={f.gender} onChange={(e) => set('gender')(e.target.value)}>
            <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
          </Select>
        </Field>
        <div className="col-span-2">
          <Field label="Roles (tick every role this person holds)">
            <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} />
          </Field>
          {roleIds.length === 0 && <p className="text-xs text-amber-400 mt-1">Choose at least one role.</p>}
        </div>
        <div className="col-span-2"><Field label="Address"><Textarea rows={2} value={f.address} onChange={(e) => set('address')(e.target.value)} /></Field></div>
        <div className="col-span-2"><Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field></div>
      </div>
      {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
      <div className="flex justify-end pt-4">
        <Button loading={save.isPending} disabled={roleIds.length === 0} onClick={() => save.mutate()}>Save changes</Button>
      </div>
    </div>
  );
}

function ResetPasswordModal({ open, staffId, onClose, onDone }: { open: boolean; staffId: string; onClose: () => void; onDone: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => api.post(`/api/v1/admin/staff/${staffId}/reset-password`, { password }),
    onSuccess: () => { setPassword(''); setError(null); onDone(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to reset'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Reset password" description="Sets a new password and emails the new credentials.">
      <div className="space-y-4">
        <Field label="New password"><Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" autoFocus /></Field>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={reset.isPending} disabled={password.length < 8} onClick={() => reset.mutate()}>Reset password</Button>
        </div>
      </div>
    </Modal>
  );
}
