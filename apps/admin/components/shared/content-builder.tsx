'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth';
import { createApiClient, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal, Field, Select, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

/**
 * The content builder — modules and lessons for one scope.
 *
 * One component serves both scopes because the work is identical; only where
 * the module list comes from differs:
 *   - batch:  the batch's own content (the primary CMS)
 *   - course: the course's MASTER content — the template batches copy from
 *
 * Lessons are exactly three kinds: a video, a notes PDF, or an exam paper.
 * All lesson-level endpoints are module-scoped, so they need no idea which
 * scope the module belongs to.
 */

export type ContentScope = { kind: 'course' | 'batch'; id: string };

type Lesson = {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'audio' | 'live_recording' | 'exam';
  duration?: number | null;
  bunnyVideoId?: string | null;
  fileUrl?: string | null;
};

type ModuleRow = {
  id: string;
  title: string;
  lessons: Lesson[];
  lessonCount: number;
};

const LESSON_KINDS = [
  { value: 'video', label: 'Video class', icon: '🎬', hint: 'Upload the video right after creating the lesson.' },
  { value: 'pdf', label: 'Notes (PDF)', icon: '📄', hint: 'Upload the PDF right after creating the lesson.' },
  { value: 'exam', label: 'Exam paper', icon: '📝', hint: 'Configure the exam and add questions after creating.' },
] as const;

export function ContentBuilder({ scope }: { scope: ContentScope }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [newModule, setNewModule] = useState('');

  const key = ['admin', 'content', scope.kind, scope.id];
  const contentQ = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (scope.kind === 'batch') {
        const r = await api.get<{ modules: ModuleRow[] }>(`/api/v1/admin/batches/${scope.id}/content`);
        return r.data.modules;
      }
      const r = await api.get<{ modules: ModuleRow[] }>(`/api/v1/courses/${scope.id}`);
      return r.data.modules;
    },
    enabled: !!accessToken,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: key });

  const addModule = useMutation({
    mutationFn: (title: string) =>
      scope.kind === 'batch'
        ? api.post(`/api/v1/admin/batches/${scope.id}/modules`, { title, order: (contentQ.data?.length ?? 0) })
        : api.post(`/api/v1/admin/courses/${scope.id}/modules`, { title, order: (contentQ.data?.length ?? 0) }),
    onSuccess: () => { setNewModule(''); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not add module', 'error'),
  });

  const deleteModule = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/modules/${id}`),
    onSuccess: invalidate,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not delete module', 'error'),
  });

  const mods = contentQ.data ?? [];

  return (
    <div className="space-y-4">
      {contentQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading content…</p>
      ) : mods.length === 0 ? (
        <p className="text-slate-500 text-sm rounded-2xl border border-white/8 bg-surface-1 p-6 text-center">
          No modules yet — add the first module below, then add classes inside it.
        </p>
      ) : (
        mods.map((mod, i) => (
          <ModuleCard
            key={mod.id}
            index={i + 1}
            module={mod}
            onChanged={invalidate}
            onDelete={async () => {
              const ok = await confirm({
                title: `Delete module "${mod.title}"?`,
                message: 'All of its lessons — videos, notes and exam papers — go with it.',
                destructive: true,
              });
              if (ok) deleteModule.mutate(mod.id);
            }}
          />
        ))
      )}

      <div className="flex gap-2">
        <Input
          value={newModule}
          onChange={(e) => setNewModule(e.target.value)}
          placeholder="New module title (e.g. Module 1: Indian Polity Basics)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newModule.trim().length >= 2) addModule.mutate(newModule.trim());
          }}
        />
        <Button
          loading={addModule.isPending}
          disabled={newModule.trim().length < 2}
          onClick={() => addModule.mutate(newModule.trim())}
        >
          + Add module
        </Button>
      </div>
    </div>
  );
}

// ── One module with its lessons ───────────────────────────────────────────────
function ModuleCard({
  index, module: mod, onChanged, onDelete,
}: {
  index: number;
  module: ModuleRow;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const confirm = useConfirm();

  const deleteLesson = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/lessons/${id}`),
    onSuccess: onChanged,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not delete lesson', 'error'),
  });

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-400/10 text-xs font-bold text-violet-300">
            {index}
          </span>
          <h3 className="font-semibold text-slate-100 truncate">{mod.title}</h3>
          <Badge variant="slate">{mod.lessons.length} item{mod.lessons.length === 1 ? '' : 's'}</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setOpenAdd(true)}>+ Add</Button>
          <Button variant="outline" size="sm" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {mod.lessons.length === 0 && (
          <p className="px-5 py-4 text-sm text-slate-500">Empty — add a video, notes or an exam paper.</p>
        )}
        {mod.lessons.map((l) => (
          <div key={l.id} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  <span className="mr-2">{l.type === 'video' ? '🎬' : l.type === 'pdf' ? '📄' : l.type === 'exam' ? '📝' : '🎧'}</span>
                  {l.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {l.type === 'exam'
                    ? 'Exam paper'
                    : l.type === 'pdf'
                      ? l.fileUrl ? 'Notes attached' : 'Notes not uploaded yet'
                      : l.bunnyVideoId
                        ? `Video attached${l.duration ? ` · ${Math.round(l.duration / 60)} min` : ''}`
                        : 'Video not uploaded yet'}
                </p>
              </div>
              <button
                className="text-xs text-slate-500 hover:text-rose-300 shrink-0"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete "${l.title}"?`,
                    message: 'Students lose access to it immediately.',
                    destructive: true,
                  });
                  if (ok) deleteLesson.mutate(l.id);
                }}
              >
                Remove
              </button>
            </div>
            {l.type === 'video' && <VideoLessonControl lesson={l} onChanged={onChanged} />}
            {l.type === 'pdf' && <PdfLessonControl lesson={l} onChanged={onChanged} />}
            {(l.type === 'video' || l.type === 'exam') && <TopicExamControl lesson={l} emphasized={l.type === 'exam'} />}
          </div>
        ))}
      </div>

      {openAdd && (
        <AddLessonModal
          moduleId={mod.id}
          nextOrder={mod.lessons.length}
          onClose={() => setOpenAdd(false)}
          onAdded={() => { setOpenAdd(false); onChanged(); }}
        />
      )}
    </div>
  );
}

// ── Add lesson: video / notes / exam paper ────────────────────────────────────
function AddLessonModal({
  moduleId, nextOrder, onClose, onAdded,
}: {
  moduleId: string;
  nextOrder: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const [kind, setKind] = useState<(typeof LESSON_KINDS)[number]['value']>('video');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/admin/modules/${moduleId}/lessons`, {
        title: title.trim(),
        type: kind,
        order: nextOrder,
        ...(kind === 'video' && minutes && Number(minutes) > 0 ? { duration: Number(minutes) * 60 } : {}),
      }),
    onSuccess: onAdded,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not add', 'error'),
  });

  const active = LESSON_KINDS.find((k) => k.value === kind)!;

  return (
    <Modal open onClose={onClose} title="Add to module">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {LESSON_KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-xl border p-3 text-center transition-colors ${
                kind === k.value
                  ? 'border-violet-400/60 bg-violet-400/10'
                  : 'border-white/8 bg-surface-2 hover:border-white/20'
              }`}
            >
              <div className="text-xl">{k.icon}</div>
              <div className={`mt-1 text-xs font-medium ${kind === k.value ? 'text-violet-200' : 'text-slate-400'}`}>
                {k.label}
              </div>
            </button>
          ))}
        </div>

        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'exam' ? 'Weekly Test 1' : '01. Introduction to the Indian Constitution'}
            autoFocus
          />
        </Field>

        {kind === 'video' && (
          <Field label="Duration (minutes)">
            <Input
              value={minutes}
              inputMode="numeric"
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              placeholder="45"
            />
          </Field>
        )}

        <p className="text-xs text-slate-500">{active.hint}</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} disabled={title.trim().length < 2} onClick={() => create.mutate()}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Video upload ──────────────────────────────────────────────────────────────
// create-video returns a one-time Bunny upload URL and stamps the lesson with
// the video id server-side; the browser PUTs the file straight to Bunny so
// nothing streams through our API.
function VideoLessonControl({ lesson, onChanged }: { lesson: Lesson; onChanged: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'uploading' | 'processing'>('idle');
  const [progress, setProgress] = useState(0);

  async function upload(file: File) {
    setPhase('requesting');
    try {
      const created = await api.post<{ videoGuid: string; uploadUrl: string; uploadHeaders: Record<string, string> }>(
        '/api/v1/admin/media/create-video',
        { lessonId: lesson.id, title: lesson.title },
      );
      const { videoGuid, uploadUrl, uploadHeaders } = created.data;

      setPhase('uploading');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        for (const [k, v] of Object.entries(uploadHeaders)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Bunny rejected the upload (HTTP ${xhr.status})`));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      setPhase('processing');
      // Poll until encoded; the webhook usually beats us to it.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await api.get<{ status: number }>(`/api/v1/admin/media/video/${videoGuid}/status`);
        if (st.data.status === 3 || st.data.status === 4) break;
      }
      toast('Video ready', 'success');
      setPhase('idle');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
      setPhase('idle');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (phase === 'uploading' || phase === 'requesting' || phase === 'processing') {
    return (
      <div className="mt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-violet-400 transition-all"
            style={{ width: phase === 'uploading' ? `${Math.max(progress, 3)}%` : '100%' }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {phase === 'requesting' ? 'Preparing upload…' : phase === 'uploading' ? `Uploading… ${progress}%` : 'Processing video…'}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        {lesson.bunnyVideoId ? 'Replace video' : '+ Upload video'}
      </Button>
    </div>
  );
}

// ── Notes upload ──────────────────────────────────────────────────────────────
function PdfLessonControl({ lesson, onChanged }: { lesson: Lesson; onChanged: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.type !== 'application/pdf') {
      toast('Notes must be a PDF file', 'error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast('Notes must be 25 MB or smaller', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/media/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Upload failed');
      await api.patch(`/api/v1/admin/lessons/${lesson.id}`, { fileUrl: json.data.filename });
      toast('Notes attached', 'success');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button variant="outline" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
        {lesson.fileUrl ? 'Replace notes' : '+ Upload notes (PDF)'}
      </Button>
    </div>
  );
}

// ── Topic exam ────────────────────────────────────────────────────────────────
type TopicExam = {
  id: string;
  title: string;
  subject: string;
  isPublished: boolean;
  questionCount: number;
  marksPerQuestion: number;
  negMarks: number;
  durationMins: number;
  passPercent: number;
};

function TopicExamControl({ lesson, emphasized }: { lesson: Lesson; emphasized: boolean }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [configuring, setConfiguring] = useState(false);

  const key = ['admin', 'lesson', lesson.id, 'quiz'];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.get<TopicExam[]>(`/api/v1/admin/exams?lessonId=${lesson.id}&limit=1`),
    enabled: !!accessToken,
  });
  const quiz = data?.data?.[0];
  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const publish = useMutation({
    mutationFn: () =>
      quiz!.isPublished
        ? api.patch(`/api/v1/admin/exams/${quiz!.id}`, { isPublished: false })
        : api.post(`/api/v1/admin/exams/${quiz!.id}/publish`, {}),
    onSuccess: () => { toast(quiz!.isPublished ? 'Exam unpublished' : 'Exam published', 'success'); refresh(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not change status', 'error'),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/v1/admin/exams/${quiz!.id}`),
    onSuccess: () => { toast('Exam deleted', 'success'); refresh(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not delete', 'error'),
  });

  if (!quiz) {
    return (
      <div className="mt-2">
        <Button variant="outline" size="sm" onClick={() => setConfiguring(true)}>
          {emphasized ? '+ Configure exam paper' : '+ Topic exam'}
        </Button>
        {configuring && (
          <TopicExamModal
            lesson={lesson}
            onClose={() => setConfiguring(false)}
            onSaved={() => { setConfiguring(false); toast('Exam created — now add questions', 'success'); refresh(); }}
          />
        )}
      </div>
    );
  }

  const ready = quiz.questionCount > 0;
  return (
    <div className={`mt-2 rounded-xl border p-3 ${emphasized ? 'border-violet-400/25 bg-violet-400/5' : 'border-white/8 bg-surface-2'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={quiz.isPublished ? 'success' : 'slate'}>{quiz.isPublished ? 'Published' : 'Draft'}</Badge>
        <span className="text-sm text-slate-200">{quiz.title}</span>
        <span className="text-xs text-slate-500">
          {quiz.questionCount} Q · {quiz.marksPerQuestion} mark{quiz.marksPerQuestion === 1 ? '' : 's'} each
          {quiz.negMarks > 0 ? ` · −${quiz.negMarks} wrong` : ''} · {quiz.durationMins} min
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Link href={`/exams/${quiz.id}`}>
          <Button variant="outline" size="sm">Questions</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={() => setConfiguring(true)}>Settings</Button>
        <Button
          variant="outline"
          size="sm"
          loading={publish.isPending}
          disabled={!quiz.isPublished && !ready}
          onClick={() => publish.mutate()}
        >
          {quiz.isPublished ? 'Unpublish' : 'Publish'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete this exam?',
              message: 'Its questions and any student attempts go with it.',
              destructive: true,
            });
            if (ok) remove.mutate();
          }}
        >
          Delete
        </Button>
      </div>
      {!quiz.isPublished && !ready && (
        <p className="mt-2 text-xs text-amber-300/80">Add at least one question before publishing.</p>
      )}
      {configuring && (
        <TopicExamModal
          lesson={lesson}
          exam={quiz}
          onClose={() => setConfiguring(false)}
          onSaved={() => { setConfiguring(false); toast('Settings saved', 'success'); refresh(); }}
        />
      )}
    </div>
  );
}

function TopicExamModal({
  lesson, exam, onClose, onSaved,
}: {
  lesson: Lesson;
  exam?: TopicExam;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const [title, setTitle] = useState(exam?.title ?? (lesson.type === 'exam' ? lesson.title : `${lesson.title} — Test`));
  const [subject, setSubject] = useState(exam?.subject ?? '');
  const [duration, setDuration] = useState(String(exam?.durationMins ?? 15));
  const [marks, setMarks] = useState(String(exam?.marksPerQuestion ?? 1));
  const [neg, setNeg] = useState(String(exam?.negMarks ?? 0));
  const [pass, setPass] = useState(String(exam?.passPercent ?? 40));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        subject: subject.trim() || 'General',
        durationMins: Number(duration) || 15,
        marksPerQuestion: Number(marks) || 1,
        negMarks: Number(neg) || 0,
        passPercent: Number(pass) || 40,
      };
      return exam
        ? api.patch(`/api/v1/admin/exams/${exam.id}`, payload)
        : api.post('/api/v1/admin/exams', { ...payload, type: 'topic_quiz', lessonId: lesson.id });
    },
    onSuccess: onSaved,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });

  const num = (v: string) => v.replace(/[^0-9.]/g, '');

  return (
    <Modal open onClose={onClose} title={exam ? 'Exam settings' : 'New exam paper'}>
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Subject (optional)">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Polity" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (minutes)">
            <Input value={duration} inputMode="numeric" onChange={(e) => setDuration(num(e.target.value))} />
          </Field>
          <Field label="Pass mark (%)">
            <Input value={pass} inputMode="numeric" onChange={(e) => setPass(num(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marks per correct answer">
            <Input value={marks} inputMode="decimal" onChange={(e) => setMarks(num(e.target.value))} />
          </Field>
          <Field label="Negative per wrong answer">
            <Input value={neg} inputMode="decimal" onChange={(e) => setNeg(num(e.target.value))} />
          </Field>
        </div>
        <p className="text-xs text-slate-500">Students may sit an exam once. Questions are added after saving.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={title.trim().length < 2} onClick={() => save.mutate()}>
            {exam ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Copy content into a batch ─────────────────────────────────────────────────
export function CopyContentButton({ batchId, courseId, onDone }: { batchId: string; courseId: string; onDone: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');

  type BatchOpt = { id: string; name: string; status?: string };
  // Only batches of the SAME course are valid sources — content transfer is
  // sibling-to-sibling, never across courses.
  const batchesQ = useQuery({
    queryKey: ['admin', 'course', courseId, 'sibling-batches'],
    queryFn: () => api.get<BatchOpt[]>(`/api/v1/courses/${courseId}/batches`),
    enabled: open,
  });

  const copy = useMutation({
    mutationFn: () =>
      api.post<{ copiedModules: number; copiedLessons: number; copiedExams: number; copiedQuestions: number }>(
        `/api/v1/admin/batches/${batchId}/content/copy`,
        { fromBatchId: source },
      ),
    onSuccess: (r) => {
      const d = r.data;
      toast(
        `Copied ${d.copiedModules} modules, ${d.copiedLessons} lessons` +
          (d.copiedExams ? `, ${d.copiedExams} exams (as drafts)` : ''),
        'success',
      );
      setOpen(false);
      onDone();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Copy failed', 'error'),
  });

  const options = (batchesQ.data?.data ?? []).filter((b) => b.id !== batchId);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>⧉ Copy content from…</Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Copy content into this batch">
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Copies another batch&apos;s modules, lessons and exam papers from this course into
              this batch. Videos and notes are reused, not re-uploaded. Copied exams arrive as{' '}
              <span className="text-slate-200">drafts</span> so nothing goes live by accident.
            </p>
            {options.length === 0 ? (
              <p className="text-sm text-amber-300/80 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                This course has no other batch to copy from yet. Build this batch&apos;s content
                directly, and future batches can copy from it.
              </p>
            ) : (
              <Field label="Copy from batch">
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Choose a batch…</option>
                  {options.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button loading={copy.isPending} disabled={!source} onClick={() => copy.mutate()}>
                Copy
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
