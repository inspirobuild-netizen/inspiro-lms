'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field, Textarea } from '@/components/ui/modal';
import { ImageUpload } from '@/components/shared/image-upload';
import { formatDate } from '@/lib/utils';

type Course = {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  thumbnailUrl: string | null;
  isPublished: boolean;
  createdAt: string;
};

const SUBJECTS = ['Polity', 'History', 'Geography', 'Economy', 'Science & Tech', 'Environment', 'Current Affairs', 'Kerala GK', 'General Studies'];

export default function CoursesPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'courses', page],
    queryFn: () => api.get<Course[]>(`/api/v1/courses?page=${page}&limit=${limit}`),
    enabled: !!accessToken,
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      api.patch(`/api/v1/admin/courses/${id}`, { isPublished }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'courses'] }),
  });

  const columns: Column<Course>[] = [
    {
      key: 'title',
      header: 'Course',
      render: (c) => (
        <div className="flex items-center gap-3 min-w-0">
          {c.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnailUrl} alt="" className="w-14 h-9 rounded-lg object-cover border border-white/10 shrink-0" />
          ) : (
            <div className="w-14 h-9 rounded-lg bg-surface-2 border border-white/5 flex items-center justify-center shrink-0">
              <span className="text-xs text-slate-600">—</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-slate-200 truncate">{c.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 capitalize">{c.subject}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      render: (c) => (
        <Badge variant={c.isPublished ? 'teal' : 'slate'}>
          {c.isPublished ? 'Published' : 'Draft'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      width: 'w-28',
      render: (c) => <span className="text-slate-400">{formatDate(c.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-56',
      render: (c) => (
        <div className="flex gap-2 justify-end">
          <Link href={`/courses/${c.id}`}>
            <Button variant="outline" size="sm">Manage content</Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            loading={togglePublish.isPending && (togglePublish.variables as { id: string })?.id === c.id}
            onClick={() => togglePublish.mutate({ id: c.id, isPublished: !c.isPublished })}
          >
            {c.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Courses</h2>
          <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} courses</p>
        </div>
        <CreateCourseButton onCreated={() => void qc.invalidateQueries({ queryKey: ['admin', 'courses'] })} />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        getKey={(c) => c.id}
        emptyMessage="No courses yet — create your first one"
      />

      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function CreateCourseButton({ onCreated }: { onCreated: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/admin/courses', {
        title: title.trim(),
        subject,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle(''); setDescription(''); setThumbnailUrl(null); setError(null);
      onCreated();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create course'),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Create course</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create course" description="Created as a draft — publish when content is ready">
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Indian Constitution: Comprehensive Foundation" autoFocus />
          </Field>
          <Field label="Subject">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Description (shown to students & used by the AI doubt solver)">
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this course covers…" />
          </Field>
          <Field label="Thumbnail (shown on course cards in the app)">
            <ImageUpload value={thumbnailUrl} onChange={setThumbnailUrl} />
          </Field>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={title.trim().length < 2} onClick={() => create.mutate()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
