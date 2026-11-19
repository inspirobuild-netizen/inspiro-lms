'use client';

import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

export type BatchOption = { id: string; name: string; course?: { id: string; title: string } | null };

/** All batches with their course, for pickers and for naming batch ids. */
export function useBatchOptions() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const q = useQuery({
    queryKey: ['admin', 'batches', 'options'],
    queryFn: () => api.get<BatchOption[]>('/api/v1/batches?limit=100'),
    enabled: !!accessToken,
    staleTime: 60_000,
  });
  const batches = q.data?.data ?? [];
  const label = (b: BatchOption) => (b.course?.title ? `${b.course.title} · ${b.name}` : b.name);
  const nameOf = (id: string) => {
    const b = batches.find((x) => x.id === id);
    return b ? label(b) : 'Removed batch';
  };
  return { batches, loading: q.isLoading, label, nameOf };
}

/**
 * Tick the batches that should see something. Batches carry their course in
 * the label because several courses have a batch called "001".
 */
export function BatchPicker({
  selected, onChange,
}: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { batches, loading, label } = useBatchOptions();
  if (loading) return <p className="text-sm text-slate-500">Loading batches…</p>;
  if (batches.length === 0) return <p className="text-sm text-slate-500">No batches yet — create one under Courses.</p>;
  const sorted = [...batches].sort((a, b) => label(a).localeCompare(label(b)));
  return (
    <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
      {sorted.map((b) => {
        const on = selected.includes(b.id);
        return (
          <label key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-white/5">
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(on ? selected.filter((x) => x !== b.id) : [...selected, b.id])}
            />
            <span className={on ? 'text-slate-100' : 'text-slate-400'}>{label(b)}</span>
          </label>
        );
      })}
    </div>
  );
}
