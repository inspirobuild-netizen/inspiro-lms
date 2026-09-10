'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useHasPermission } from '@/lib/auth';
import { createApiClient, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal, Field, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

/**
 * Activity space, staff side: publish tasks to batches, watch submissions
 * come in, review them with remarks. Mentors see only their mapped batches
 * (enforced server-side); the coordinator and admin see everything.
 */

type Activity = {
  id: string;
  title: string;
  description: string;
  dueAt: string | null;
  createdAt: string;
  batchId: string;
  batchName: string;
  createdByName: string | null;
  submissions: number;
  reviewed: number;
  enrolled: number;
};

type Attachment = { name: string; file: string; kind: 'image' | 'pdf' };

type Submission = {
  id: string;
  body: string | null;
  attachments: Attachment[] | null;
  submittedAt: string;
  reviewedAt: string | null;
  remarks: string | null;
  studentName: string;
  studentPhone: string;
};

type Batch = { id: string; name: string };

export default function ActivitiesPage() {
  const { accessToken } = useAuthStore();
  const has = useHasPermission();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Activity | null>(null);

  const activitiesQ = useQuery({
    queryKey: ['admin', 'activities'],
    queryFn: () => api.get<Activity[]>('/api/v1/admin/activities'),
  });

  const batchesQ = useQuery({
    queryKey: ['admin', 'batches', 'for-activities'],
    queryFn: () => api.get<Batch[]>('/api/v1/batches?limit=100'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/activities/${id}`),
    onSuccess: () => { toast('Activity deleted', 'success'); void qc.invalidateQueries({ queryKey: ['admin', 'activities'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not delete', 'error'),
  });

  const items = activitiesQ.data?.data ?? [];
  const canManage = has('activities.manage');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Activities</h2>
          <p className="text-sm text-slate-500 mt-1">
            Tasks published to batches — students submit inside the app and you review with remarks.
          </p>
        </div>
        {canManage && <Button onClick={() => setCreating(true)}>+ Publish activity</Button>}
      </div>

      {activitiesQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-10 text-center">
          <p className="text-slate-300 font-medium">No activities yet</p>
          <p className="text-sm text-slate-500 mt-1">Publish the first task and every active student in the batch is notified.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-2xl border border-white/8 bg-surface-1 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-100">{a.title}</h3>
                    <Badge variant="slate">{a.batchName}</Badge>
                    {a.dueAt && (
                      <Badge variant={new Date(a.dueAt) < new Date() ? 'rose' : 'amber'}>
                        due {new Date(a.dueAt).toLocaleDateString('en-IN')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-1 line-clamp-2">{a.description}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {a.submissions}/{a.enrolled} submitted · {a.reviewed} reviewed
                    {a.createdByName ? ` · by ${a.createdByName}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setViewing(a)}>
                    Submissions ({a.submissions})
                  </Button>
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete this activity?',
                          message: 'Its submissions are deleted with it.',
                          destructive: true,
                        });
                        if (ok) remove.mutate(a.id);
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <PublishModal
          api={api}
          batches={batchesQ.data?.data ?? []}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            toast('Activity published — students notified', 'success');
            void qc.invalidateQueries({ queryKey: ['admin', 'activities'] });
          }}
        />
      )}

      {viewing && (
        <SubmissionsModal
          api={api}
          activity={viewing}
          canManage={canManage}
          onClose={() => setViewing(null)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ['admin', 'activities'] })}
        />
      )}
    </div>
  );
}

function PublishModal({
  api, batches, onClose, onDone,
}: {
  api: ReturnType<typeof createApiClient>;
  batches: Batch[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expects, setExpects] = useState<'text' | 'file' | 'both'>('text');
  const [allowed, setAllowed] = useState<'image' | 'pdf' | 'image,pdf'>('image,pdf');

  const publish = useMutation({
    mutationFn: () =>
      api.post('/api/v1/admin/activities', {
        batchIds: [...selected],
        title: title.trim(),
        description: description.trim(),
        requiresFile: expects !== 'text',
        allowedTypes: allowed,
        ...(due ? { dueAt: new Date(due).toISOString() } : {}),
      }),
    onSuccess: onDone,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not publish', 'error'),
  });

  return (
    <Modal open onClose={onClose} title="Publish activity">
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Answer writing: Article 21" autoFocus />
        </Field>
        <Field label="Instructions">
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What exactly should students do, and how will it be assessed?"
          />
        </Field>
        <Field label="What should students hand in?">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['text', 'Written answer', 'Typed in the app'],
              ['file', 'Uploaded work', 'Photo or PDF only'],
              ['both', 'Both', 'Writing and a file'],
            ] as const).map(([v, label, hint]) => (
              <button
                key={v}
                onClick={() => setExpects(v)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  expects === v
                    ? 'border-violet-400/60 bg-violet-400/10'
                    : 'border-white/8 bg-surface-2 hover:border-white/20'
                }`}
              >
                <div className={`text-sm font-medium ${expects === v ? 'text-violet-200' : 'text-slate-300'}`}>
                  {label}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
              </button>
            ))}
          </div>
        </Field>

        {expects !== 'text' && (
          <Field label="Accepted file types">
            <div className="flex gap-2">
              {([
                ['image,pdf', 'Photo or PDF'],
                ['image', 'Photo only'],
                ['pdf', 'PDF only'],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setAllowed(v)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    allowed === v
                      ? 'border-violet-400/60 bg-violet-400/10 text-violet-200'
                      : 'border-white/8 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Due date (optional)">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Publish to batches">
          <div className="space-y-1.5 max-h-44 overflow-y-auto rounded-xl border border-white/8 p-3">
            {batches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(b.id); else next.delete(b.id);
                    setSelected(next);
                  }}
                />
                {b.name}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={publish.isPending}
            disabled={title.trim().length < 2 || description.trim().length < 2 || selected.size === 0}
            onClick={() => publish.mutate()}
          >
            Publish
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SubmissionsModal({
  api, activity, canManage, onClose, onChanged,
}: {
  api: ReturnType<typeof createApiClient>;
  activity: Activity;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [remarksFor, setRemarksFor] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');

  const subsQ = useQuery({
    queryKey: ['admin', 'activities', activity.id, 'submissions'],
    queryFn: () => api.get<{ submissions: Submission[] }>(`/api/v1/admin/activities/${activity.id}/submissions`),
  });

  const review = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.post(`/api/v1/admin/submissions/${id}/review`, { remarks: text }),
    onSuccess: () => {
      toast('Review sent to the student', 'success');
      setRemarksFor(null);
      setRemarks('');
      void qc.invalidateQueries({ queryKey: ['admin', 'activities', activity.id, 'submissions'] });
      onChanged();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not review', 'error'),
  });

  const subs = subsQ.data?.data.submissions ?? [];

  return (
    <Modal open onClose={onClose} title={activity.title}>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {subsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : subs.length === 0 ? (
          <p className="text-sm text-slate-500">No submissions yet.</p>
        ) : (
          subs.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/8 bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-200 text-sm">{s.studentName}</p>
                <span className="text-xs text-slate-500">
                  {new Date(s.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              {s.body && (
                <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{s.body}</p>
              )}
              {(s.attachments ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.attachments!.map((a) => (
                    <a
                      key={a.file}
                      href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/submissions/${s.id}/attachment/${a.file}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-white/8 bg-surface-1 px-3 py-1.5 text-xs text-slate-300 hover:border-violet-400/40 hover:text-violet-200"
                    >
                      <span>{a.kind === 'pdf' ? '📄' : '🖼️'}</span>
                      <span className="max-w-[190px] truncate">{a.name}</span>
                    </a>
                  ))}
                </div>
              )}
              {s.reviewedAt ? (
                <p className="text-xs text-teal-300 mt-3">Reviewed: {s.remarks}</p>
              ) : canManage && remarksFor === s.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks for the student…" />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setRemarksFor(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      loading={review.isPending}
                      disabled={remarks.trim().length === 0}
                      onClick={() => review.mutate({ id: s.id, text: remarks.trim() })}
                    >
                      Send review
                    </Button>
                  </div>
                </div>
              ) : canManage ? (
                <Button className="mt-3" variant="outline" size="sm" onClick={() => { setRemarksFor(s.id); setRemarks(''); }}>
                  Review
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
