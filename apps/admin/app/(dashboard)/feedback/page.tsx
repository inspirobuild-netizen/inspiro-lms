'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth';
import { createApiClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

/**
 * Feedback space, coordinator side: everything students send from the app's
 * feedback section, newest first. Read-only by design — feedback is signal,
 * not a ticket queue.
 */

type FeedbackRow = {
  id: string;
  category: 'teaching' | 'content' | 'app' | 'other';
  rating: number | null;
  message: string;
  createdAt: string;
  studentName: string;
  studentPhone: string;
  batchName: string | null;
};

const CATEGORIES = [
  { id: undefined, label: 'All' },
  { id: 'teaching', label: 'Teaching' },
  { id: 'content', label: 'Content' },
  { id: 'app', label: 'App' },
  { id: 'other', label: 'Other' },
] as const;

export default function FeedbackPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['admin', 'feedback', category, page],
    queryFn: () =>
      api.get<{ items: FeedbackRow[]; total: number }>(
        `/api/v1/admin/feedback?page=${page}&limit=30${category ? `&category=${category}` : ''}`,
      ),
  });

  const items = q.data?.data.items ?? [];
  const total = q.data?.data.total ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Student Feedback</h2>
        <p className="text-sm text-slate-500 mt-1">
          Collected from the app&apos;s feedback space. {total} total.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c.label}
            onClick={() => { setCategory(c.id); setPage(1); }}
            className={`rounded-xl border px-3 py-1.5 text-xs transition-colors ${
              category === c.id
                ? 'border-violet-400/60 bg-violet-400/10 text-violet-200'
                : 'border-white/8 bg-surface-1 text-slate-400 hover:text-slate-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-10 text-center">
          <p className="text-slate-300 font-medium">No feedback yet</p>
          <p className="text-sm text-slate-500 mt-1">Feedback students send in the app lands here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <div key={f.id} className="rounded-2xl border border-white/8 bg-surface-1 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-200 text-sm">{f.studentName}</span>
                <Badge variant="slate">{f.category}</Badge>
                {f.batchName && <Badge variant="slate">{f.batchName}</Badge>}
                {f.rating != null && (
                  <span className="text-amber-300 text-sm" aria-label={`${f.rating} out of 5`}>
                    {'★'.repeat(f.rating)}
                    <span className="text-slate-600">{'★'.repeat(5 - f.rating)}</span>
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {new Date(f.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{f.message}</p>
            </div>
          ))}
        </div>
      )}

      {total > 30 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">
            ← Newer
          </button>
          <span>Page {page} of {Math.ceil(total / 30)}</span>
          <button
            disabled={page >= Math.ceil(total / 30)}
            onClick={() => setPage((p) => p + 1)}
            className="disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
}
