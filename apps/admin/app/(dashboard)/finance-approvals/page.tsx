'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth';
import { createApiClient, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

/**
 * The admin's checker queue over counsellor admissions.
 *
 * A counsellor recording a payment creates a CLAIM; the student's enrolment
 * sits at pending_approval and grants nothing. This page is where an admin
 * checks the claim against the bank and opens the door. Access is role-gated
 * server-side (requireRole admin, not a permission) — the page merely matches
 * that.
 */

type PendingPayment = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  collectedByName: string | null;
  createdAt: string;
};

type Approval = {
  studentId: string;
  studentName: string;
  studentPhone: string;
  counsellorId: string | null;
  counsellorName: string | null;
  admissionId: string | null;
  admissionNo: string | null;
  courseTitle: string | null;
  feeAmount: number | null;
  confirmedPaid: number | null;
  paymentStatus: string | null;
  pendingPayments: PendingPayment[];
  pendingEnrollment: { id: string; batchName: string; enrolledAt: string } | null;
};

type CounsellorRow = {
  counsellorId: string | null;
  counsellorName: string;
  pendingAmount: number;
  pendingCount: number;
  confirmedAmount: number;
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function FinanceApprovalsPage() {
  const { accessToken, user } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [counsellorFilter, setCounsellorFilter] = useState<string | null>(null);

  const approvalsQ = useQuery({
    queryKey: ['admin', 'finance', 'approvals', counsellorFilter],
    queryFn: () =>
      api.get<Approval[]>(
        `/api/v1/admin/finance/approvals${counsellorFilter ? `?counsellorId=${counsellorFilter}` : ''}`,
      ),
    enabled: user?.role === 'admin',
  });

  const counsellorsQ = useQuery({
    queryKey: ['admin', 'finance', 'counsellors'],
    queryFn: () => api.get<CounsellorRow[]>('/api/v1/admin/finance/counsellors'),
    enabled: user?.role === 'admin',
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'finance'] });
  };

  const verify = useMutation({
    mutationFn: (paymentId: string) => api.post(`/api/v1/admin/finance/payments/${paymentId}/verify`, {}),
    onSuccess: () => { toast('Payment verified — it now counts as confirmed money', 'success'); refresh(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not verify payment', 'error'),
  });

  const reject = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason?: string }) =>
      api.post(`/api/v1/admin/finance/payments/${paymentId}/reject`, { reason }),
    onSuccess: () => { toast('Payment rejected — the counsellor has been notified', 'success'); refresh(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not reject payment', 'error'),
  });

  const activate = useMutation({
    mutationFn: (enrollmentId: string) => api.post(`/api/v1/admin/finance/enrollments/${enrollmentId}/activate`, {}),
    onSuccess: () => { toast('Access opened — the student has been notified', 'success'); refresh(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not activate enrolment', 'error'),
  });

  if (user && user.role !== 'admin') {
    return <p className="text-slate-500 text-sm p-6">This page is only available to administrators.</p>;
  }

  const approvals = approvalsQ.data?.data ?? [];
  const counsellors = (counsellorsQ.data?.data ?? []).filter((c) => c.pendingCount > 0 || c.pendingAmount > 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Finance Approvals</h2>
        <p className="text-sm text-slate-500 mt-1">
          Payments recorded by counsellors are claims until checked against the bank here. Students
          admitted by counsellors get course access only when you open it.
        </p>
      </div>

      {/* Per-counsellor pending strip — who is waiting on how much */}
      {counsellors.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCounsellorFilter(null)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
              counsellorFilter === null
                ? 'border-violet-400/60 bg-violet-400/10 text-violet-200'
                : 'border-white/8 bg-surface-1 text-slate-400 hover:text-slate-200'
            }`}
          >
            All counsellors
          </button>
          {counsellors.map((c) => (
            <button
              key={c.counsellorId ?? 'none'}
              onClick={() => setCounsellorFilter(c.counsellorId)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                counsellorFilter === c.counsellorId
                  ? 'border-violet-400/60 bg-violet-400/10 text-violet-200'
                  : 'border-white/8 bg-surface-1 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block font-semibold text-slate-200">{c.counsellorName}</span>
              <span className="block mt-0.5">
                {inr(c.pendingAmount)} unconfirmed · {c.pendingCount}
              </span>
            </button>
          ))}
        </div>
      )}

      {approvalsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : approvals.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-10 text-center">
          <p className="text-slate-300 font-medium">Nothing waiting 🎉</p>
          <p className="text-sm text-slate-500 mt-1">
            Every counsellor admission has been checked and every recorded payment reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((a) => (
            <div key={a.studentId} className="rounded-2xl border border-white/8 bg-surface-1 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-100">{a.studentName}</h3>
                    {a.admissionNo && <Badge variant="slate">{a.admissionNo}</Badge>}
                    {a.pendingEnrollment && <Badge variant="amber">access blocked</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {a.studentPhone}
                    {a.courseTitle ? ` · ${a.courseTitle}` : ''}
                    {a.counsellorName ? ` · via ${a.counsellorName}` : ''}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  {a.feeAmount != null && (
                    <p>
                      Fee {inr(a.feeAmount)} · confirmed{' '}
                      <span className={a.confirmedPaid ? 'text-teal-300' : 'text-slate-500'}>
                        {inr(a.confirmedPaid ?? 0)}
                      </span>
                    </p>
                  )}
                  {a.paymentStatus && <p className="mt-0.5">status: {a.paymentStatus}</p>}
                </div>
              </div>

              {a.pendingPayments.length > 0 && (
                <div className="mt-4 space-y-2">
                  {a.pendingPayments.map((pm) => (
                    <div
                      key={pm.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3"
                    >
                      <div className="text-sm">
                        <span className="font-semibold text-slate-100">{inr(pm.amount)}</span>
                        <span className="text-slate-400"> · {pm.method.toUpperCase()}</span>
                        {pm.reference && (
                          <span className="text-slate-300"> · ref <span className="font-mono">{pm.reference}</span></span>
                        )}
                        <span className="block text-xs text-slate-500 mt-0.5">
                          recorded by {pm.collectedByName ?? 'unknown'} ·{' '}
                          {new Date(pm.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          loading={verify.isPending}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Verify this payment?',
                              message: `Confirm ${inr(pm.amount)}${pm.reference ? ` (ref ${pm.reference})` : ''} has actually arrived in the academy's account. It will count as confirmed money.`,
                              confirmLabel: 'Yes, money received',
                            });
                            if (ok) verify.mutate(pm.id);
                          }}
                        >
                          Verify
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={reject.isPending}
                          onClick={async () => {
                            const reason = window.prompt('Why is this being rejected? (sent to the counsellor)') ?? undefined;
                            if (reason === undefined) return;
                            reject.mutate({ paymentId: pm.id, reason: reason || undefined });
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {a.pendingEnrollment && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-surface-2 px-4 py-3">
                  <p className="text-sm text-slate-300">
                    Enrolment in <span className="font-medium text-slate-100">{a.pendingEnrollment.batchName}</span>{' '}
                    is waiting — the student cannot open the course.
                  </p>
                  <Button
                    size="sm"
                    loading={activate.isPending}
                    onClick={async () => {
                      const unconfirmed = a.pendingPayments.length > 0;
                      const ok = await confirm({
                        title: 'Open course access?',
                        message: unconfirmed
                          ? 'This student still has unverified payment claims. Normally verify the money first. Open access anyway?'
                          : `Give ${a.studentName} access to ${a.pendingEnrollment!.batchName}? They will be notified immediately.`,
                        confirmLabel: 'Open access',
                      });
                      if (ok) activate.mutate(a.pendingEnrollment!.id);
                    }}
                  >
                    Open access
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
