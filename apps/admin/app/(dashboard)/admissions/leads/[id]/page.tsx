'use client';

import { useEffect, useState } from 'react';
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
import { PaymentModal } from '@/components/shared/payment-modal';
import { formatDate, formatPhone, money } from '@/lib/utils';

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

type FeePlan = { id: string; name: string; totalAmount: number; installments: { label: string; amount: number; dueAfterDays: number }[] };
type ConvertResult = { admissionId: string; admissionNo: string };

function ConvertModal({ open, leadId, onClose, onConverted }: { open: boolean; leadId: string; onClose: () => void; onConverted: (admissionNo: string) => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const batchesQ = useQuery({ queryKey: ['admin', 'batches', 'all'], queryFn: () => api.get<{ id: string; name: string }[]>('/api/v1/batches?limit=100'), enabled: open && !!accessToken });
  const coursesQ = useQuery({ queryKey: ['admin', 'courses', 'all'], queryFn: () => api.get<{ id: string; title: string; feeAmount: number }[]>('/api/v1/courses?limit=100'), enabled: open && !!accessToken });

  const [f, setF] = useState({ batchId: '', courseId: '', feePlanId: '', manualFeeAmount: '', collectMode: 'skip' as 'skip' | 'cash' | 'upi', collectAmount: '' });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!open) { setF({ batchId: '', courseId: '', feePlanId: '', manualFeeAmount: '', collectMode: 'skip', collectAmount: '' }); setError(null); setResult(null); setPaymentOpen(false); }
  }, [open]);

  const plansQ = useQuery({
    queryKey: ['courses', f.courseId, 'fee-plans'],
    queryFn: () => api.get<FeePlan[]>(`/api/v1/courses/${f.courseId}/fee-plans`),
    enabled: open && !!f.courseId && !!accessToken,
  });
  const plans = plansQ.data?.data ?? [];
  const selectedPlan = plans.find((p) => p.id === f.feePlanId);
  const selectedCourse = (coursesQ.data?.data ?? []).find((c) => c.id === f.courseId);
  const feeAmount = selectedPlan?.totalAmount ?? (Number(f.manualFeeAmount) || 0);
  const firstInstallment = selectedPlan?.installments[0]?.amount ?? feeAmount;

  useEffect(() => {
    // Default the collect amount to the first installment whenever the plan changes.
    setF((s) => ({ ...s, collectAmount: String(firstInstallment || '') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.feePlanId, f.courseId]);

  const convert = useMutation({
    mutationFn: () => api.post<ConvertResult>(`/api/v1/leads/${leadId}/convert`, {
      batchId: f.batchId,
      courseId: f.courseId || undefined,
      feePlanId: f.feePlanId || undefined,
      feeAmount: f.feePlanId ? undefined : Number(f.manualFeeAmount) || 0,
      ...(f.collectMode === 'cash' && Number(f.collectAmount) > 0
        ? { collectAmount: Number(f.collectAmount), collectMethod: 'cash' }
        : {}),
    }),
    onSuccess: (r) => {
      setResult(r.data);
      if (f.collectMode === 'upi' && Number(f.collectAmount) > 0) setPaymentOpen(true);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to convert lead'),
  });

  if (result) {
    return (
      <>
        <Modal open={open && !paymentOpen} onClose={() => onConverted(result.admissionNo)} title="Admission created">
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-slate-200 font-medium">Admission {result.admissionNo} created</p>
            <div className="flex justify-center gap-2 pt-2">
              {feeAmount > 0 && (
                <Button size="sm" onClick={() => setPaymentOpen(true)}>Collect payment</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onConverted(result.admissionNo)}>Done</Button>
            </div>
          </div>
        </Modal>
        <PaymentModal
          open={paymentOpen}
          admissionId={result.admissionId}
          defaultAmount={Number(f.collectAmount) || firstInstallment || feeAmount}
          onClose={() => { setPaymentOpen(false); onConverted(result.admissionNo); }}
          onRecorded={() => { setPaymentOpen(false); onConverted(result.admissionNo); }}
        />
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Convert to student" description="Creates a verified student account, enrols them in the batch, and records the admission." wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Batch">
            <Select value={f.batchId} onChange={(e) => set('batchId')(e.target.value)}>
              <option value="">Select batch…</option>
              {(batchesQ.data?.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Course (optional)">
            <Select value={f.courseId} onChange={(e) => { set('courseId')(e.target.value); set('feePlanId')(''); }}>
              <option value="">— None —</option>
              {(coursesQ.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
        </div>

        {f.courseId && (
          <Field label="Fee plan">
            <Select value={f.feePlanId} onChange={(e) => set('feePlanId')(e.target.value)}>
              <option value="">
                {plansQ.isLoading ? 'Loading plans…' : plans.length === 0 ? 'No preset plans — enter amount manually' : 'Select a plan…'}
              </option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.totalAmount)}</option>)}
            </Select>
          </Field>
        )}

        {selectedPlan ? (
          <div className="rounded-xl bg-surface-2 border border-white/5 p-3 flex flex-wrap gap-2">
            {selectedPlan.installments.map((inst, i) => (
              <span key={i} className="text-xs text-slate-400 bg-surface-1 rounded-lg px-2 py-1">
                {inst.label}: {money(inst.amount)}{inst.dueAfterDays > 0 ? ` (+${inst.dueAfterDays}d)` : ' (now)'}
              </span>
            ))}
          </div>
        ) : (
          <Field label={`Fee amount${selectedCourse ? ` (course default: ${money(selectedCourse.feeAmount)})` : ''}`}>
            <Input type="number" min={0} value={f.manualFeeAmount} onChange={(e) => set('manualFeeAmount')(e.target.value)} placeholder={selectedCourse ? String(selectedCourse.feeAmount) : '25000'} />
          </Field>
        )}

        {feeAmount > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">Collect {money(firstInstallment)} now?</p>
            <div className="flex gap-2">
              {([
                { key: 'skip', label: 'Not now' },
                { key: 'cash', label: 'Cash / card in hand' },
                { key: 'upi', label: 'UPI QR' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => set('collectMode')(opt.key)}
                  className={
                    f.collectMode === opt.key
                      ? 'px-3 py-1.5 rounded-full text-xs font-medium bg-brand-violet text-white'
                      : 'px-3 py-1.5 rounded-full text-xs font-medium bg-surface-2 text-slate-400 hover:text-slate-200'
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {f.collectMode !== 'skip' && (
              <Input type="number" min={0} value={f.collectAmount} onChange={(e) => set('collectAmount')(e.target.value)} className="max-w-[160px]" />
            )}
            {f.collectMode === 'upi' && (
              <p className="text-xs text-slate-500">A QR with this amount opens right after the admission is created.</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={convert.isPending} disabled={!f.batchId} onClick={() => convert.mutate()}>Convert</Button>
        </div>
      </div>
    </Modal>
  );
}
