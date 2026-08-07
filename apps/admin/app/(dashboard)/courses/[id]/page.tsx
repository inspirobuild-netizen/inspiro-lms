'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore, useHasPermission } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field } from '@/components/ui/modal';
import { money } from '@/lib/utils';

type CourseDetail = {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  isPublished: boolean;
  feeAmount: number;
  modules: { id: string; title: string; order: number; lessonCount: number }[];
};

type Installment = { label: string; amount: number; dueAfterDays: number };
type FeePlan = {
  id: string;
  name: string;
  totalAmount: number;
  installments: Installment[];
  isActive: boolean;
  sortOrder: number;
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
  const has = useHasPermission();

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

      {has('fees.configure') && <FeesSection courseId={id} feeAmount={course.feeAmount} onCourseFeeChanged={invalidate} />}

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
            <div key={l.id} className="rounded-xl bg-surface-2 border border-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{li + 1}. {l.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">
                    {l.type}{l.duration ? ` · ${Math.round(l.duration / 60)} min` : ''}
                  </p>
                </div>
                <button
                  className="text-xs text-rose-400/70 hover:text-rose-400 ml-3 shrink-0"
                  onClick={() => { if (confirm(`Delete lesson "${l.title}"?`)) deleteLesson.mutate(l.id); }}
                >
                  Delete
                </button>
              </div>
              {l.type === 'video' && <VideoLessonControl lesson={l} onChanged={refresh} />}
              <LessonQuizControl lesson={l} />
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
  const [fileUrl, setFileUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/admin/modules/${moduleId}/lessons`, {
        title: title.trim(),
        type,
        order: nextOrder,
        ...(minutes && Number(minutes) > 0 ? { duration: Number(minutes) * 60 } : {}),
        ...(type === 'pdf' && fileUrl.trim() ? { fileUrl: fileUrl.trim() } : {}),
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle(''); setMinutes(''); setFileUrl(''); setError(null);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <p className="text-xs text-slate-500 -mt-1">
              You&apos;ll upload the video file right after creating this lesson.
            </p>
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

// ── Fees & plans ─────────────────────────────────────────────────────────────────
function FeesSection({ courseId, feeAmount, onCourseFeeChanged }: { courseId: string; feeAmount: number; onCourseFeeChanged: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const plansKey = ['admin', 'course', courseId, 'fee-plans'];
  const { data: plansData } = useQuery({
    queryKey: plansKey,
    queryFn: () => api.get<FeePlan[]>(`/api/v1/admin/courses/${courseId}/fee-plans`),
    enabled: !!accessToken,
  });
  const plans = plansData?.data ?? [];
  const invalidatePlans = () => void qc.invalidateQueries({ queryKey: plansKey });

  const [feeInput, setFeeInput] = useState(String(feeAmount));
  const [editingPlan, setEditingPlan] = useState<FeePlan | null>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);

  const saveFee = useMutation({
    mutationFn: () => api.patch(`/api/v1/admin/courses/${courseId}/fee`, { feeAmount: Number(feeInput) || 0 }),
    onSuccess: onCourseFeeChanged,
  });

  const deletePlan = useMutation({
    mutationFn: (planId: string) => api.delete(`/api/v1/admin/fee-plans/${planId}`),
    onSuccess: invalidatePlans,
  });

  return (
    <section className="space-y-4">
      <h3 className="font-display font-semibold text-lg text-slate-200">Fees &amp; plans</h3>

      <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
        <p className="text-sm font-medium text-slate-300 mb-2">Standard course fee</p>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">₹</span>
          <Input
            type="number"
            min={0}
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            className="max-w-[160px]"
          />
          <Button size="sm" loading={saveFee.isPending} disabled={Number(feeInput) === feeAmount} onClick={() => saveFee.mutate()}>
            Save
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Fee plans below may discount this (e.g. a full-payment offer).</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">Installment plans</p>
        <Button size="sm" variant="outline" onClick={() => setCreatingPlan(true)}>+ Add plan</Button>
      </div>

      {plans.length === 0 ? (
        <p className="text-slate-500 text-sm rounded-2xl border border-white/8 bg-surface-1 p-6 text-center">
          No fee plans yet — counsellors won&apos;t be able to select one when converting a lead into this course.
        </p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl bg-surface-2 border border-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-200">{plan.name}</p>
                    {!plan.isActive && <Badge variant="slate">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{money(plan.totalAmount)} · {plan.installments.length} installment{plan.installments.length > 1 ? 's' : ''}</p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setEditingPlan(plan)}>Edit</button>
                  <button
                    className="text-xs text-rose-400/70 hover:text-rose-400"
                    onClick={() => { if (confirm(`Delete plan "${plan.name}"?`)) deletePlan.mutate(plan.id); }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {plan.installments.map((inst, i) => (
                  <span key={i} className="text-xs text-slate-400 bg-surface-1 rounded-lg px-2 py-1">
                    {inst.label}: {money(inst.amount)}{inst.dueAfterDays > 0 ? ` (+${inst.dueAfterDays}d)` : ' (now)'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <FeePlanModal
        courseId={courseId}
        plan={editingPlan}
        open={creatingPlan || !!editingPlan}
        defaultTotal={feeAmount}
        onClose={() => { setCreatingPlan(false); setEditingPlan(null); }}
        onSaved={() => { setCreatingPlan(false); setEditingPlan(null); invalidatePlans(); }}
      />
    </section>
  );
}

function FeePlanModal({
  courseId, plan, open, defaultTotal, onClose, onSaved,
}: {
  courseId: string;
  plan: FeePlan | null;
  open: boolean;
  defaultTotal: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [name, setName] = useState('');
  const [installments, setInstallments] = useState<Installment[]>([{ label: 'Full payment', amount: 0, dueAfterDays: 0 }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (plan) {
      setName(plan.name);
      setInstallments(plan.installments);
    } else {
      setName('');
      setInstallments([{ label: 'Full payment', amount: defaultTotal, dueAfterDays: 0 }]);
    }
    setError(null);
  }, [open, plan, defaultTotal]);

  const total = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const balanced = installments.length > 0 && installments.every((i) => i.label.trim() && Number(i.amount) > 0);

  function updateRow(i: number, patch: Partial<Installment>) {
    setInstallments((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setInstallments((rows) => [...rows, { label: `Installment ${rows.length + 1}`, amount: 0, dueAfterDays: 30 * rows.length }]);
  }
  function removeRow(i: number) {
    setInstallments((rows) => rows.filter((_, idx) => idx !== i));
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), totalAmount: total, installments: installments.map((i) => ({ ...i, amount: Number(i.amount) || 0, dueAfterDays: Number(i.dueAfterDays) || 0 })) };
      return plan
        ? api.patch(`/api/v1/admin/fee-plans/${plan.id}`, payload)
        : api.post(`/api/v1/admin/courses/${courseId}/fee-plans`, payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save plan'),
  });

  return (
    <Modal open={open} onClose={onClose} title={plan ? 'Edit fee plan' : 'Add fee plan'} description="Installment amounts must add up to the plan total" wide>
      <div className="space-y-4">
        <Field label="Plan name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2 installments — 5% off" autoFocus /></Field>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">Installments</p>
          {installments.map((inst, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={inst.label} onChange={(e) => updateRow(i, { label: e.target.value })} placeholder="Label" className="flex-1" />
              <Input type="number" min={0} value={inst.amount || ''} onChange={(e) => updateRow(i, { amount: Number(e.target.value) })} placeholder="Amount" className="w-28" />
              <Input type="number" min={0} value={inst.dueAfterDays} onChange={(e) => updateRow(i, { dueAfterDays: Number(e.target.value) })} placeholder="Days" className="w-20" />
              {installments.length > 1 && (
                <button className="text-rose-400/70 hover:text-rose-400 text-sm px-1" onClick={() => removeRow(i)}>✕</button>
              )}
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addRow}>+ Add installment</Button>
        </div>

        <div className="flex items-center justify-between text-sm rounded-xl bg-surface-2 px-4 py-2.5">
          <span className="text-slate-400">Total</span>
          <span className="font-semibold text-slate-100">{money(total)}</span>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!balanced || name.trim().length < 2} onClick={() => save.mutate()}>
            {plan ? 'Save changes' : 'Create plan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Topic quiz control ──────────────────────────────────────────────────────────
// Every lesson (any type) can have one auto-graded MCQ quiz tied to it —
// the "30-min class → quiz on that topic" flow.
function LessonQuizControl({ lesson }: { lesson: Lesson }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const { data } = useQuery({
    queryKey: ['admin', 'lesson', lesson.id, 'quiz'],
    queryFn: () => api.get<{ id: string; title: string; isPublished: boolean }[]>(`/api/v1/admin/exams?lessonId=${lesson.id}&limit=1`),
    enabled: !!accessToken,
  });

  const quiz = data?.data?.[0];

  if (quiz) {
    return (
      <div className="mt-2">
        <Link href={`/exams/${quiz.id}`} className="inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200">
          <Badge variant={quiz.isPublished ? 'success' : 'slate'}>Quiz</Badge>
          {quiz.title} →
        </Link>
      </div>
    );
  }

  const params = new URLSearchParams({ title: lesson.title });
  return (
    <div className="mt-2 flex items-center gap-3">
      <Link href={`/exams?createFor=${lesson.id}&${params.toString()}`} className="text-xs text-slate-400 hover:text-slate-200">
        + Quiz (manual)
      </Link>
      <Link
        href={`/exams/generate?lessonId=${lesson.id}&${new URLSearchParams({ topic: lesson.title }).toString()}`}
        className="text-xs text-slate-400 hover:text-slate-200"
      >
        + Quiz (AI)
      </Link>
    </div>
  );
}

// ── Video upload control ────────────────────────────────────────────────────────
// Uploads directly from the browser to Bunny Stream (server is never in the
// upload path — it only issues a one-time upload URL). Phase machine:
//   idle → requesting (server creates the Bunny video slot)
//        → uploading (raw PUT with progress)
//        → processing (Bunny is transcoding — poll for status)
//        → ready | failed
type UploadPhase = 'idle' | 'requesting' | 'uploading' | 'processing' | 'ready' | 'failed';

function VideoLessonControl({ lesson, onChanged }: { lesson: Lesson; onChanged: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function pollStatus(videoGuid: string) {
    let attempts = 0;
    pollRef.current = setInterval(() => {
      attempts += 1;
      api
        .get<{ statusText: string }>(`/api/v1/admin/media/video/${videoGuid}/status`)
        .then((res) => {
          if (res.data.statusText === 'ready') {
            setPhase('ready');
            if (pollRef.current) clearInterval(pollRef.current);
            onChanged();
          } else if (res.data.statusText === 'failed') {
            setPhase('failed');
            setError('Bunny could not process this video — try a different file.');
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (attempts >= 30 && pollRef.current) {
            // ~2 minutes of polling — long video, stop and let admin check back later
            clearInterval(pollRef.current);
          }
        })
        .catch(() => {
          /* transient network hiccup — keep polling */
        });
    }, 4000);
  }

  async function startUpload(file: File) {
    setError(null);
    setProgress(0);
    setPhase('requesting');
    try {
      const created = await api.post<{
        videoGuid: string;
        uploadUrl: string;
        uploadHeaders: Record<string, string>;
      }>('/api/v1/admin/media/create-video', { lessonId: lesson.id, title: lesson.title });
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
        xhr.onerror = () => reject(new Error('Network error during upload — check your connection and try again'));
        xhr.send(file);
      });

      setPhase('processing');
      onChanged(); // the lesson now has a bunnyVideoId — refresh the list
      pollStatus(videoGuid);
    } catch (e) {
      setPhase('failed');
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed');
    }
  }

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/v1/admin/media/video/${lesson.bunnyVideoId}`),
    onSuccess: () => { setPhase('idle'); setError(null); onChanged(); },
  });

  const checkStatus = useMutation({
    mutationFn: () => api.get<{ statusText: string }>(`/api/v1/admin/media/video/${lesson.bunnyVideoId}/status`),
    onSuccess: (res) => {
      if (res.data.statusText === 'ready') setPhase('ready');
      else if (res.data.statusText === 'failed') setPhase('failed');
      else setPhase('processing');
    },
  });

  // Already has a linked video and we haven't touched it this session
  if (lesson.bunnyVideoId && phase === 'idle') {
    return (
      <div className="flex items-center gap-3 mt-2">
        <Badge variant="teal">Video linked</Badge>
        <button
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
          onClick={() => checkStatus.mutate()}
          disabled={checkStatus.isPending}
        >
          {checkStatus.isPending ? 'Checking…' : 'Check status'}
        </button>
        <button
          className="text-xs text-rose-400/70 hover:text-rose-400"
          onClick={() => { if (confirm('Remove this video? You will need to upload a replacement.')) remove.mutate(); }}
        >
          Remove
        </button>
      </div>
    );
  }

  if (phase === 'requesting' || phase === 'uploading') {
    return (
      <div className="mt-2 max-w-xs space-y-1">
        <div className="h-1.5 rounded-full bg-surface-1 overflow-hidden">
          <div
            className="h-full bg-brand-violet transition-all duration-200"
            style={{ width: `${phase === 'uploading' ? Math.max(progress, 3) : 5}%` }}
          />
        </div>
        <p className="text-xs text-slate-500">
          {phase === 'requesting' ? 'Preparing upload…' : `Uploading… ${progress}%`}
        </p>
      </div>
    );
  }

  if (phase === 'processing') {
    return (
      <p className="text-xs text-amber-400 mt-2">
        Uploaded — Bunny is processing the video. This can take a few minutes for longer recordings; refresh later if it&apos;s still going.
      </p>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="flex items-center gap-3 mt-2">
        <Badge variant="success">Ready to stream</Badge>
        <button
          className="text-xs text-rose-400/70 hover:text-rose-400"
          onClick={() => { if (confirm('Remove this video?')) remove.mutate(); }}
        >
          Remove
        </button>
      </div>
    );
  }

  // idle with no video yet, or a failed attempt — show the upload trigger
  return (
    <div className="mt-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void startUpload(file);
          e.target.value = '';
        }}
      />
      <button
        className="text-xs text-teal-300 hover:text-teal-200 font-medium"
        onClick={() => fileInputRef.current?.click()}
      >
        {phase === 'failed' ? '⟲ Upload failed — try again' : '+ Upload video'}
      </button>
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
}
