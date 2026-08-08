'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, Textarea, Field } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';

type CurrentAffair = {
  id: string;
  title: string;
  summary: string;
  category: string;
  sourceUrl: string | null;
  publishedAt: string;
};
type Coverage = {
  courses: { id: string; title: string; hasContentChunk: boolean }[];
  currentAffairs: { total: number; indexed: number };
};

export default function ContentPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CurrentAffair | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'current-affairs', page],
    queryFn: () => api.get<CurrentAffair[]>(`/api/v1/admin/current-affairs?page=${page}&limit=${limit}`),
    enabled: !!accessToken,
  });

  const coverageQ = useQuery({
    queryKey: ['admin', 'content', 'coverage'],
    queryFn: () => api.get<Coverage>('/api/v1/admin/content/coverage'),
    enabled: !!accessToken,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'current-affairs'] });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/current-affairs/${id}`),
    onSuccess: () => { toast('Removed', 'success'); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed to delete', 'error'),
  });

  const reindex = useMutation({
    mutationFn: () => api.post('/api/v1/admin/rag/reindex'),
    onSuccess: () => { toast('Reindex started', 'success'); void qc.invalidateQueries({ queryKey: ['admin', 'content', 'coverage'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed to reindex', 'error'),
  });

  const refresh = useMutation({
    mutationFn: () => api.post<{ ingested: number; skipped: number }>('/api/v1/admin/current-affairs/refresh'),
    onSuccess: (res) => { toast(`Ingested ${res.data.ingested}, skipped ${res.data.skipped}`, 'success'); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed to refresh', 'error'),
  });

  const cov = coverageQ.data?.data;
  const coveredCourses = cov?.courses.filter((c) => c.hasContentChunk).length ?? 0;
  const totalCourses = cov?.courses.length ?? 0;

  const columns: Column<CurrentAffair>[] = [
    { key: 'title', header: 'Item', render: (c) => (
      <div>
        <p className="font-medium text-slate-200 line-clamp-1">{c.title}</p>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.summary}</p>
      </div>
    ) },
    { key: 'category', header: 'Category', width: 'w-32', render: (c) => <Badge variant="slate">{c.category}</Badge> },
    { key: 'published', header: 'Published', width: 'w-32', render: (c) => <span className="text-slate-400">{formatDate(c.publishedAt)}</span> },
    { key: 'actions', header: '', width: 'w-40', render: (c) => (
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => setEditing(c)}>Edit</Button>
        <Button
          size="sm"
          variant="destructive"
          loading={deleteItem.isPending && deleteItem.variables === c.id}
          onClick={() => { if (confirm(`Remove "${c.title}" from the feed?`)) deleteItem.mutate(c.id); }}
        >
          Remove
        </Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Content</h2>
          <p className="text-slate-400 text-sm mt-1">Current-affairs curation and AI content coverage</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" loading={reindex.isPending} onClick={() => reindex.mutate()}>Reindex</Button>
          <Button size="sm" loading={refresh.isPending} onClick={() => refresh.mutate()}>Fetch new articles</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
          <p className="text-sm text-slate-400">Course content indexed</p>
          <p className="font-display font-bold text-2xl text-slate-100 mt-1">{coverageQ.isLoading ? '…' : `${coveredCourses}/${totalCourses}`}</p>
          {!coverageQ.isLoading && totalCourses > coveredCourses && (
            <p className="text-xs text-amber-400 mt-1">{totalCourses - coveredCourses} course(s) not yet indexed for AI — try Reindex</p>
          )}
        </div>
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
          <p className="text-sm text-slate-400">Current-affairs indexed</p>
          <p className="font-display font-bold text-2xl text-slate-100 mt-1">
            {coverageQ.isLoading ? '…' : `${cov?.currentAffairs.indexed ?? 0}/${cov?.currentAffairs.total ?? 0}`}
          </p>
        </div>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(c) => c.id} emptyMessage="No current-affairs items yet — use Fetch new articles" />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />

      <EditModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} />
    </div>
  );
}

function EditModal({ item, onClose, onSaved }: { item: CurrentAffair | null; onClose: () => void; onSaved: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (item) { setTitle(item.title); setSummary(item.summary); setCategory(item.category); }
  }, [item]);

  const save = useMutation({
    mutationFn: () => api.patch(`/api/v1/admin/current-affairs/${item!.id}`, { title: title.trim(), summary: summary.trim(), category: category.trim() }),
    onSuccess: () => { toast('Updated', 'success'); setTitle(''); setSummary(''); setCategory(''); onSaved(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed to update', 'error'),
  });

  return (
    <Modal open={!!item} onClose={() => { setTitle(''); setSummary(''); setCategory(''); onClose(); }} title="Edit current-affairs item" wide>
      <div className="space-y-4">
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Category"><Input value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
        <Field label="Summary"><Textarea rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={title.trim().length < 3 || summary.trim().length < 10} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
