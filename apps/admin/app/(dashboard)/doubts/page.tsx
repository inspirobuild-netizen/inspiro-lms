'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Pagination } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

type Doubt = {
  id: string;
  studentId: string;
  subject: string;
  body: string;
  imageUrl: string | null;
  aiAnswer: string | null;
  aiConfidence: number | null;
  humanAnswer: string | null;
  status: 'open' | 'ai_answered' | 'escalated' | 'resolved';
  createdAt: string;
};

const statusTabs = [
  { key: 'escalated', label: 'Needs Answer' },
  { key: 'ai_answered', label: 'AI Answered' },
  { key: 'resolved', label: 'Resolved' },
  { key: '', label: 'All' },
] as const;

const statusBadge: Record<Doubt['status'], { variant: 'amber' | 'teal' | 'success' | 'slate'; label: string }> = {
  escalated: { variant: 'amber', label: 'Escalated' },
  ai_answered: { variant: 'teal', label: 'AI Answered' },
  resolved: { variant: 'success', label: 'Resolved' },
  open: { variant: 'slate', label: 'Open' },
};

export default function DoubtsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const [status, setStatus] = useState<string>('escalated');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'doubts', status, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(status ? { status } : {}),
      });
      return api.get<Doubt[]>(`/api/v1/admin/doubts?${params.toString()}`);
    },
    enabled: !!accessToken,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Doubts</h2>
        <p className="text-slate-400 text-sm mt-1">
          Escalated doubts need a mentor&apos;s answer — students are notified when you reply
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatus(tab.key); setPage(1); }}
            className={
              status === tab.key
                ? 'px-4 py-1.5 rounded-full text-sm font-medium bg-brand-violet/20 text-violet-300'
                : 'px-4 py-1.5 rounded-full text-sm font-medium text-slate-400 hover:bg-surface-high hover:text-slate-200'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm py-12 text-center">Loading…</div>
      ) : (data?.data?.length ?? 0) === 0 ? (
        <div className="text-slate-500 text-sm py-12 text-center rounded-2xl bg-surface-1 border border-white/8">
          No doubts here 🎉
        </div>
      ) : (
        <div className="space-y-4">
          {data!.data.map((doubt) => (
            <DoubtCard
              key={doubt.id}
              doubt={doubt}
              onAnswered={() => void qc.invalidateQueries({ queryKey: ['admin', 'doubts'] })}
            />
          ))}
        </div>
      )}

      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function DoubtCard({ doubt, onAnswered }: { doubt: Doubt; onAnswered: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post(`/api/v1/admin/doubts/${doubt.id}/answer`, { answer }),
    onSuccess: () => {
      setAnswering(false);
      setAnswer('');
      onAnswered();
    },
  });

  const badge = statusBadge[doubt.status];
  const canAnswer = doubt.status !== 'resolved';

  return (
    <div className="rounded-2xl bg-surface-1 border border-white/8 p-5">
      <div className="flex items-center gap-3">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <Badge variant="slate">{doubt.subject}</Badge>
        {doubt.aiConfidence !== null && (
          <span className="text-xs text-slate-500">
            AI confidence {(doubt.aiConfidence * 100).toFixed(0)}%
          </span>
        )}
        <span className="ml-auto text-xs text-slate-500">{formatDate(doubt.createdAt)}</span>
      </div>

      <p className="mt-3 text-slate-200 text-sm leading-relaxed">{doubt.body}</p>

      {doubt.aiAnswer && (
        <div className="mt-3 rounded-xl bg-surface-2 border border-white/5 p-4">
          <p className="text-[10px] font-bold tracking-wide text-teal-300 mb-1.5">AI ANSWER</p>
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{doubt.aiAnswer}</p>
        </div>
      )}

      {doubt.humanAnswer && (
        <div className="mt-3 rounded-xl bg-surface-2 border border-amber-500/20 p-4">
          <p className="text-[10px] font-bold tracking-wide text-amber-300 mb-1.5">MENTOR ANSWER</p>
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{doubt.humanAnswer}</p>
        </div>
      )}

      {canAnswer && !answering && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={() => setAnswering(true)}>
            {doubt.status === 'escalated' ? 'Answer this doubt' : 'Add mentor answer'}
          </Button>
        </div>
      )}

      {answering && (
        <div className="mt-4 space-y-3">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Write a clear, exam-focused answer…"
            className="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent resize-y"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              loading={submit.isPending}
              disabled={answer.trim().length < 3}
              onClick={() => submit.mutate()}
            >
              Send answer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnswering(false)}>
              Cancel
            </Button>
            {submit.isError && (
              <span className="text-xs text-rose-400">Failed to send — try again</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
