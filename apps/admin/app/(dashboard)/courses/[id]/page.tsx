'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field } from '@/components/ui/modal';

type CourseDetail = {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  isPublished: boolean;
  modules: { id: string; title: string; order: number; lessonCount: number }[];
};

type Lesson = {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'audio' | 'live_recording';
  order: number;
  duration: number | null;
  bunnyVideoId?: string | null;
  fileUrl?: string | null;
};

export default function CourseBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const courseKey = ['admin', 'course', id];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: courseKey,
    queryFn: () => api.get<CourseDetail>(`/api/v1/courses/${id}`),
    enabled: !!accessToken,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: courseKey });

  const addModule = useMutation({
    mutationFn: (title: string) =>
      api.post(`/api/v1/admin/courses/${id}/modules`, { title, order: data?.data.modules.length ?? 0 }),
    onSuccess: invalidate,
  });

  const deleteModule = useMutation({
    mutationFn: (moduleId: string) => api.delete(`/api/v1/admin/modules/${moduleId}`),
    onSuccess: invalidate,
  });

  const [newModule, setNewModule] = useState('');

  if (isLoading) return <p className="text-slate-400">Loading course…</p>;
  if (isError || !data)
    return (
      <div className="space-y-3">
        <p className="text-rose-400">Could not load this course.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
      </div>
    );

  const course = data.data;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/courses" className="text-sm text-slate-500 hover:text-slate-300">← Courses</Link>
          <h2 className="font-display font-bold text-2xl text-slate-100 mt-1">{course.title}</h2>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="slate">{course.subject}</Badge>
            <Badge variant={course.isPublished ? 'teal' : 'amber'}>
              {course.isPublished ? 'Published' : 'Draft'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-4">
        {course.modules.length === 0 && (
          <p className="text-slate-500 text-sm rounded-2xl border border-white/8 bg-surface-1 p-6 text-center">
            No modules yet — add the first module below, then add lessons inside it.
          </p>
        )}
        {course.modules.map((mod, i) => (
          <ModuleCard
            key={mod.id}
            index={i + 1}
            module={mod}
            onChanged={invalidate}
            onDelete={() => {
              if (confirm(`Delete module "${mod.title}" and all its lessons?`)) deleteModule.mutate(mod.id);
            }}
          />
        ))}
      </div>

      {/* Add module */}
      <div className="flex gap-2">
        <Input
          value={newModule}
          onChange={(e) => setNewModule(e.target.value)}
          placeholder="New module title (e.g. Module 1: Historical Background)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newModule.trim().length >= 2) {
              addModule.mutate(newModule.trim());
              setNewModule('');
            }
          }}
        />
        <Button
          loading={addModule.isPending}
          disabled={newModule.trim().length < 2}
          onClick={() => { addModule.mutate(newModule.trim()); setNewModule(''); }}
        >
          + Add module
        </Button>
      </div>
    </div>
  );
}

// ── Module card with its lessons ───────────────────────────────────────────────
function ModuleCard({
  index, module: mod, onChanged, onDelete,
}: {
  index: number;
  module: { id: string; title: string; lessonCount: number };
  onChanged: () => void;
  onDelete: () => void;
}) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const lessonsKey = ['admin', 'module', mod.id, 'lessons'];
  const { data: lessons } = useQuery({
    queryKey: lessonsKey,
    queryFn: () => api.get<Lesson[]>(`/api/v1/modules/${mod.id}/lessons`),
    enabled: !!accessToken && expanded,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: lessonsKey });
    onChanged();
  };

  const deleteLesson = useMutation({
    mutationFn: (lessonId: string) => api.delete(`/api/v1/admin/lessons/${lessonId}`),
    onSuccess: refresh,
  });

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1">
      <button
        className="w-full flex items-center justify-between p-5 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div>
          <p className="font-medium text-slate-200">{index}. {mod.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{mod.lessonCount} lessons</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="button"
            tabIndex={0}
            className="text-xs text-rose-400/70 hover:text-rose-400"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDelete(); } }}
          >
            Delete
          </span>
          <span className="text-slate-500">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 p-5 space-y-3">
          {(lessons?.data ?? []).map((l, li) => (
            <div key={l.id} className="flex items-center justify-between rounded-xl bg-surface-2 border border-white/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-200 truncate">{li + 1}. {l.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">
                  {l.type}{l.duration ? ` · ${Math.round(l.duration / 60)} min` : ''}
                  {l.type === 'video' && (l.bunnyVideoId ? ' · video linked' : ' · no video linked yet')}
                </p>
              </div>
              <button
                className="text-xs text-rose-400/70 hover:text-rose-400 ml-3 shrink-0"
                onClick={() => { if (confirm(`Delete lesson "${l.title}"?`)) deleteLesson.mutate(l.id); }}
              >
                Delete
              </button>
            </div>
          ))}
          <AddLessonForm moduleId={mod.id} nextOrder={lessons?.data?.length ?? 0} onAdded={refresh} />
        </div>
      )}
    </div>
  );
}

// ── Add lesson ─────────────────────────────────────────────────────────────────
function AddLessonForm({ moduleId, nextOrder, onAdded }: { moduleId: string; nextOrder: number; onAdded: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('video');
  const [minutes, setMinutes] = useState('');
  const [bunnyVideoId, setBunnyVideoId] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/admin/modules/${moduleId}/lessons`, {
        title: title.trim(),
        type,
        order: nextOrder,
        ...(minutes && Number(minutes) > 0 ? { duration: Number(minutes) * 60 } : {}),
        ...(type === 'video' && bunnyVideoId.trim() ? { bunnyVideoId: bunnyVideoId.trim() } : {}),
        ...(type === 'pdf' && fileUrl.trim() ? { fileUrl: fileUrl.trim() } : {}),
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle(''); setMinutes(''); setBunnyVideoId(''); setFileUrl(''); setError(null);
      onAdded();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add lesson'),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>+ Add lesson</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add lesson">
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="01. Historical Background" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="video">Video</option>
                <option value="pdf">PDF / Notes</option>
                <option value="audio">Audio</option>
                <option value="live_recording">Live recording</option>
              </Select>
            </Field>
            <Field label="Duration (minutes)">
              <Input value={minutes} inputMode="numeric" onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="45" />
            </Field>
          </div>
          {type === 'video' && (
            <Field label="Bunny video ID (paste after uploading in Bunny Stream — can be added later)">
              <Input value={bunnyVideoId} onChange={(e) => setBunnyVideoId(e.target.value)} placeholder="e.g. 1c8a2f56-…" />
            </Field>
          )}
          {type === 'pdf' && (
            <Field label="File URL">
              <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
            </Field>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={title.trim().length < 2} onClick={() => create.mutate()}>
              Add lesson
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
