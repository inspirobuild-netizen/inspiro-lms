'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore, useHasPermission } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { formatDate, formatPhone } from '@/lib/utils';

type Lead = {
  id: string; leadCode: string; studentName: string; parentName: string | null; phone: string;
  whatsapp: string | null; email: string | null; city: string | null; state: string | null;
  courseInterested: string | null; source: string; priority: string; status: string;
  ownerName: string | null; remarks: string | null; nextFollowupAt: string | null; createdAt: string;
};
type Followup = { id: string; remarks: string; callSummary: string | null; nextAction: string | null; reminderAt: string | null; createdAt: string; staffName: string | null };

const STAGES = ['new', 'contacted', 'interested', 'demo', 'counselling', 'fee_discussion', 'admission_confirmed'] as const;
const statusLabel: Record<string, string> = {
  new: 'New', contacted: 'Contacted', interested: 'Interested', demo: 'Demo', counselling: 'Counselling',
  fee_discussion: 'Fee discussion', admission_confirmed: 'Admission confirmed', converted: 'Converted',
  not_interested: 'Not interested', lost: 'Lost',
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const has = useHasPermission();

  const leadQ = useQuery({ queryKey: ['crm', 'lead', id], queryFn: () => api.get<Lead>(`/api/v1/leads/${id}`), enabled: !!accessToken && !!id });
  const fuQ = useQuery({ queryKey: ['crm', 'lead', id, 'followups'], queryFn: () => api.get<Followup[]>(`/api/v1/leads/${id}/followups`), enabled: !!accessToken && !!id });

  const [convertOpen, setConvertOpen] = useState(false);
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['crm', 'lead', id] }); void qc.invalidateQueries({ queryKey: ['crm', 'leads'] }); };

  const changeStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/api/v1/leads/${id}/status`, { status }),
    onSuccess: () => { toast('Status updated', 'success'); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const lead = leadQ.data?.data;
  if (leadQ.isLoading) return <div className="text-slate-500">Loading…</div>;
  if (!lead) return <div className="text-slate-500">Lead not found. <Link href="/admissions/leads" className="text-violet-300">Back</Link></div>;

  const terminal = lead.status === 'converted' || lead.status === 'lost' || lead.status === 'not_interested';
  const stageIdx = STAGES.indexOf(lead.status as (typeof STAGES)[number]);

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/admissions/leads" className="text-sm text-slate-400 hover:text-slate-200">← All leads</Link>

      <div className="rounded-2xl border border-white/8 bg-surface-1 p-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-xl text-slate-100">{lead.studentName}</h2>
            <Badge variant={lead.status === 'converted' ? 'success' : 'default'}>{statusLabel[lead.status]}</Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">{lead.leadCode} · {formatPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ''}</p>
          <p className="text-xs text-slate-500 mt-1">{lead.courseInterested || 'No course specified'} · {lead.city || '—'} · Owner: {lead.ownerName || '—'}</p>
        </div>
        {!terminal && has('admissions.manage') && (
          <Button onClick={() => setConvertOpen(true)}>Convert to student</Button>
        )}
      </div>

      {/* Pipeline stage stepper */}
      {!terminal && (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
          <h3 className="font-semibold text-slate-200 mb-3 text-sm">Pipeline stage</h3>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s, i) => (
              <button
                key={s}
                onClick={() => changeStatus.mutate(s)}
                disabled={changeStatus.isPending}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === stageIdx ? 'bg-brand-violet text-white' : i < stageIdx ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-2 text-slate-400 hover:bg-surface-high'
                }`}
              >{statusLabel[s]}</button>
            ))}
            <button onClick={() => changeStatus.mutate('not_interested')} disabled={changeStatus.isPending} className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors">Not interested</button>
            <button onClick={() => changeStatus.mutate('lost')} disabled={changeStatus.isPending} className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors">Lost</button>
          </div>
        </div>
      )}

      <FollowupTimeline leadId={id} followups={fuQ.data?.data ?? []} loading={fuQ.isLoading} onAdded={() => { void qc.invalidateQueries({ queryKey: ['crm', 'lead', id, 'followups'] }); invalidate(); }} />

      <ConvertModal
        open={convertOpen}
        leadId={id}
        onClose={() => setConvertOpen(false)}
        onConverted={(admissionNo) => { setConvertOpen(false); toast(`Converted — admission ${admissionNo} created`, 'success'); router.push('/admissions'); }}
      />
    </div>
  );
}

function FollowupTimeline({ leadId, followups, loading, onAdded }: { leadId: string; followups: Followup[]; loading: boolean; onAdded: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [remarks, setRemarks] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextFollowupAt, setNextFollowupAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => api.post(`/api/v1/leads/${leadId}/followups`, {
      remarks: remarks.trim(),
      nextAction: nextAction.trim() || undefined,
      nextFollowupAt: nextFollowupAt ? new Date(nextFollowupAt).toISOString() : undefined,
    }),
    onSuccess: () => { setRemarks(''); setNextAction(''); setNextFollowupAt(''); setError(null); onAdded(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add follow-up'),
  });

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
      <h3 className="font-semibold text-slate-200 mb-4 text-sm">Follow-up timeline</h3>

      <div className="space-y-3 mb-3">
        <Textarea rows={2} placeholder="Call summary / remarks…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Next action (e.g. Send brochure)" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          <Input type="datetime-local" value={nextFollowupAt} onChange={(e) => setNextFollowupAt(e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end"><Button size="sm" loading={add.isPending} disabled={remarks.trim().length < 1} onClick={() => add.mutate()}>Add follow-up</Button></div>
      </div>

      <div className="space-y-3 mt-5 pt-4 border-t border-white/8">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : followups.length === 0 ? (
          <p className="text-sm text-slate-500">No follow-ups yet.</p>
        ) : (
          followups.map((f) => (
            <div key={f.id} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-brand-violet mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-slate-200">{f.remarks}</p>
                {f.nextAction && <p className="text-xs text-slate-500 mt-0.5">Next: {f.nextAction}</p>}
                <p className="text-xs text-slate-500 mt-0.5">{f.staffName ?? 'Staff'} · {formatDate(f.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConvertModal({ open, leadId, onClose, onConverted }: { open: boolean; leadId: string; onClose: () => void; onConverted: (admissionNo: string) => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const batchesQ = useQuery({ queryKey: ['admin', 'batches', 'all'], queryFn: () => api.get<{ id: string; name: string }[]>('/api/v1/batches?limit=100'), enabled: open && !!accessToken });
  const coursesQ = useQuery({ queryKey: ['admin', 'courses', 'all'], queryFn: () => api.get<{ id: string; title: string }[]>('/api/v1/courses?limit=100'), enabled: open && !!accessToken });

  const [f, setF] = useState({ batchId: '', courseId: '', feeAmount: '', amountPaid: '', feePlan: '', paymentStatus: 'pending' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const convert = useMutation({
    mutationFn: () => api.post<{ admissionNo: string }>(`/api/v1/leads/${leadId}/convert`, {
      batchId: f.batchId, courseId: f.courseId || undefined, feePlan: f.feePlan.trim() || undefined,
      feeAmount: Number(f.feeAmount) || 0, amountPaid: Number(f.amountPaid) || 0, paymentStatus: f.paymentStatus,
    }),
    onSuccess: (r) => onConverted(r.data.admissionNo),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to convert lead'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Convert to student" description="Creates a verified student account, enrols them in the batch, and records the admission.">
      <div className="space-y-4">
        <Field label="Batch">
          <Select value={f.batchId} onChange={(e) => set('batchId')(e.target.value)}>
            <option value="">Select batch…</option>
            {(batchesQ.data?.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Course (optional)">
          <Select value={f.courseId} onChange={(e) => set('courseId')(e.target.value)}>
            <option value="">— None —</option>
            {(coursesQ.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee amount"><Input type="number" min={0} value={f.feeAmount} onChange={(e) => set('feeAmount')(e.target.value)} placeholder="25000" /></Field>
          <Field label="Amount paid"><Input type="number" min={0} value={f.amountPaid} onChange={(e) => set('amountPaid')(e.target.value)} placeholder="0" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee plan"><Input value={f.feePlan} onChange={(e) => set('feePlan')(e.target.value)} placeholder="2 installments" /></Field>
          <Field label="Payment status">
            <Select value={f.paymentStatus} onChange={(e) => set('paymentStatus')(e.target.value)}>
              <option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option>
            </Select>
          </Field>
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={convert.isPending} disabled={!f.batchId} onClick={() => convert.mutate()}>Convert</Button>
        </div>
      </div>
    </Modal>
  );
}
