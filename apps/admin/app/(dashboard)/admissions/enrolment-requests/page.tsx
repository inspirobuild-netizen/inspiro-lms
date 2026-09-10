'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth';
import { createApiClient, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal, Field, Select, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

/**
 * Fee verification for students who signed up in the app.
 *
 * A student picks a course, pays, and lands here. Until this page existed the
 * request was written to the database and shown nowhere, so nobody could
 * check the money had arrived — the API had been live with no screen behind it.
 *
 * Grouped by course on purpose. "Which course did this person sign up for" is
 * the question staff actually ask, and a flat list of names across every
 * course is exactly the confusion this is meant to prevent.
 */

type Request = {
  id: string;
  studentId: string;
  studentName: string;
  studentPhone: string;
  studentEmail: string | null;
  courseId: string;
  courseTitle: string;
  courseFee: number;
  amount: number;
  method: string;
  channel: 'manual' | 'gateway';
  gatewayPaymentId: string | null;
  reference: string | null;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  batchName: string | null;
};

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function EnrolmentRequestsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'verified' | 'rejected' | ''>('pending');
  const [acting, setActing] = useState<{ req: Request; mode: 'verify' | 'reject' } | null>(null);

  const q = useQuery({
    queryKey: ['admin', 'enrolment-requests', status],
    queryFn: () =>
      api.get<Request[]>(`/api/v1/admin/enrollment-requests${status ? `?status=${status}` : ''}`),
    enabled: !!accessToken,
  });

  const rows = q.data?.data ?? [];

  // Grouped by course: the fee is a course-level fact, and staff think in courses.
  const byCourse = rows.reduce<Record<string, { title: string; id: string; items: Request[] }>>(
    (acc, r) => {
      acc[r.courseId] ??= { title: r.courseTitle, id: r.courseId, items: [] };
      acc[r.courseId]!.items.push(r);
      return acc;
    },
    {},
  );
  const groups = Object.values(byCourse);
  const pendingTotal = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Enrolment requests</h2>
          <p className="text-sm text-slate-500 mt-1">
            Students who signed up in the app and paid. Check the money arrived, then verify —
            that records the payment, admits them and places them in a batch in one step.
          </p>
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-44"
        >
          <option value="pending">Awaiting check</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </Select>
      </div>

      {status === 'pending' && rows.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-4">
          <p className="text-sm text-amber-200">
            <span className="font-semibold">{rows.length}</span> request
            {rows.length === 1 ? '' : 's'} awaiting a fee check ·{' '}
            <span className="font-semibold">{money(pendingTotal)}</span> claimed in total
          </p>
        </div>
      )}

      {q.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-10 text-center">
          <p className="text-slate-300 font-medium">
            {status === 'pending' ? 'Nothing waiting to be checked' : 'Nothing here'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            App sign-ups appear here the moment a student submits payment.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((g) => (
            <section key={g.id} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display font-semibold text-slate-200">
                  <Link href={`/courses/${g.id}`} className="hover:text-violet-300">
                    {g.title}
                  </Link>
                </h3>
                <span className="text-xs text-slate-500">
                  {g.items.length} request{g.items.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="rounded-2xl border border-white/8 bg-surface-1 divide-y divide-white/5">
                {g.items.map((r) => (
                  <div key={r.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-100">{r.studentName}</span>
                          <Badge
                            variant={
                              r.status === 'verified'
                                ? 'success'
                                : r.status === 'rejected'
                                  ? 'rose'
                                  : 'amber'
                            }
                          >
                            {r.status === 'pending' ? 'awaiting check' : r.status}
                          </Badge>
                          {r.channel === 'gateway' && <Badge variant="teal">bank gateway</Badge>}
                          {r.status === 'verified' &&
                            (r.batchName ? (
                              <Badge variant="slate">in {r.batchName}</Badge>
                            ) : (
                              <Badge variant="amber">no batch yet</Badge>
                            ))}
                        </div>

                        <p className="text-xs text-slate-500 mt-1">
                          {r.studentPhone}
                          {r.studentEmail ? ` · ${r.studentEmail}` : ''} · signed up{' '}
                          {when(r.createdAt)}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                          <span className="text-slate-400">
                            Paid{' '}
                            <span className="text-slate-100 font-medium">{money(r.amount)}</span>
                            {r.amount !== r.courseFee && (
                              <span className="text-amber-300/80">
                                {' '}
                                (course fee {money(r.courseFee)})
                              </span>
                            )}
                          </span>
                          <span className="text-slate-400">
                            via <span className="text-slate-200 uppercase">{r.method}</span>
                          </span>
                          <span className="text-slate-400">
                            Ref{' '}
                            <span className="text-slate-200 font-mono">
                              {r.gatewayPaymentId ?? r.reference ?? 'not given'}
                            </span>
                          </span>
                        </div>

                        {r.status === 'rejected' && r.rejectionReason && (
                          <p className="text-xs text-rose-300/80 mt-2">
                            Rejected: {r.rejectionReason}
                          </p>
                        )}
                        {r.status === 'verified' && !r.batchName && (
                          <p className="text-xs text-amber-300/80 mt-2">
                            Verified by a counsellor — the enrolment is awaiting an admin&apos;s
                            approval under Finance approvals before the course opens.
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {r.status === 'pending' ? (
                          <>
                            <Button size="sm" onClick={() => setActing({ req: r, mode: 'verify' })}>
                              Verify fee
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActing({ req: r, mode: 'reject' })}
                            >
                              Reject
                            </Button>
                          </>
                        ) : r.status === 'verified' && !r.batchName ? (
                          <Link href={`/courses/${r.courseId}`}>
                            <Button variant="outline" size="sm">
                              Place in batch
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {acting && (
        <ActionModal
          api={api}
          request={acting.req}
          mode={acting.mode}
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null);
            // Every list that changes as a result, so nothing needs a manual
            // page reload to look right afterwards.
            void qc.invalidateQueries({ queryKey: ['admin', 'enrolment-requests'] });
            void qc.invalidateQueries({ queryKey: ['admin', 'students'] });
            void qc.invalidateQueries({ queryKey: ['admin', 'fees'] });
            void qc.invalidateQueries({ queryKey: ['admin', 'admissions'] });
          }}
        />
      )}
    </div>
  );
}

type BatchOption = {
  id: string;
  name: string;
  status: string;
  capacity: number;
  enrolledCount?: number;
};

function ActionModal({
  api,
  request,
  mode,
  onClose,
  onDone,
}: {
  api: ReturnType<typeof createApiClient>;
  request: Request;
  mode: 'verify' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [batchId, setBatchId] = useState('');
  const [reason, setReason] = useState('');

  // Verifying admits the student AND places them, in one transaction, so the
  // batch is chosen here rather than in a later step. Only batches of THIS
  // request's course are valid — the server refuses others outright.
  const batchesQ = useQuery({
    queryKey: ['admin', 'course', request.courseId, 'batches'],
    queryFn: () => api.get<BatchOption[]>(`/api/v1/courses/${request.courseId}/batches`),
    enabled: mode === 'verify',
  });
  const batches = batchesQ.data?.data ?? [];

  const act = useMutation({
    mutationFn: () =>
      mode === 'verify'
        ? api.post(`/api/v1/admin/enrollment-requests/${request.id}/verify`, { batchId })
        : api.post(`/api/v1/admin/enrollment-requests/${request.id}/reject`, {
            reason: reason.trim(),
          }),
    onSuccess: () => {
      const batch = batches.find((b) => b.id === batchId);
      toast(
        mode === 'verify'
          ? `Fee verified — ${request.studentName} is admitted${
              batch ? ` into ${batch.name}` : ''
            } and can open the course now.`
          : `Request rejected. ${request.studentName} has been told why.`,
        mode === 'verify' ? 'success' : 'info',
      );
      onDone();
    },
    // The server names the real problem — no payment reference, batch full,
    // already processed — so its message beats anything generic here.
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not complete that', 'error'),
  });

  const noReference = !request.reference && !request.gatewayPaymentId;

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'verify' ? 'Verify fee and admit' : 'Reject this request'}
      description={`${request.studentName} · ${request.courseTitle}`}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-white/8 bg-surface-2 p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Amount claimed</span>
            <span className="text-slate-100 font-medium">{money(request.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Course fee</span>
            <span className="text-slate-300">{money(request.courseFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Method</span>
            <span className="text-slate-300 uppercase">{request.method}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Student reference</span>
            <span
              className={`font-mono text-xs ${noReference ? 'text-amber-300' : 'text-slate-300'}`}
            >
              {request.gatewayPaymentId ?? request.reference ?? 'not submitted'}
            </span>
          </div>
        </div>

        {mode === 'verify' ? (
          <>
            {noReference && (
              <p className="text-xs text-amber-300/90">
                This student has not submitted a payment reference yet, so the fee cannot be
                verified. Ask them to enter it in the app first.
              </p>
            )}
            {request.amount !== request.courseFee && (
              <p className="text-xs text-amber-300/90">
                This is {request.amount < request.courseFee ? 'less' : 'more'} than the course fee.
                Verify only if that is expected.
              </p>
            )}

            <Field label="Place them in which batch?">
              {batchesQ.isLoading ? (
                <p className="text-sm text-slate-500">Loading batches…</p>
              ) : batches.length === 0 ? (
                <p className="text-sm text-amber-300">
                  This course has no batches yet. Create one on the course page first — verifying
                  admits the student into a batch, so there has to be one.
                </p>
              ) : (
                <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  <option value="">Choose a batch…</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.status}
                      {typeof b.enrolledCount === 'number'
                        ? ` · ${b.enrolledCount}/${b.capacity} enrolled`
                        : ` · capacity ${b.capacity}`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <p className="text-xs text-slate-500">
              Check the payment against the bank statement first. This records the payment, creates
              the admission and enrols the student in one step — they can open the course
              immediately afterwards.
            </p>
          </>
        ) : (
          <Field label="Reason (the student sees this)">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="No payment found against this reference."
              autoFocus
            />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={act.isPending}
            disabled={mode === 'verify' ? !batchId || noReference : reason.trim().length < 3}
            onClick={() => act.mutate()}
          >
            {mode === 'verify' ? 'Verify and admit' : 'Reject request'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
