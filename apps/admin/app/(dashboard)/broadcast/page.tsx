'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useAuthStore } from '@/lib/auth';
import { createApiClient, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal, Field, Select, Textarea } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

/**
 * Marketing surface: the sliding home banners students see, and one-off
 * push broadcasts. Kept on one page because they are the same job — telling
 * every student something — done through two different channels.
 */

type Banner = {
  id: string;
  title: string;
  imageUrl: string;
  courseId: string | null;
  courseTitle: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdByName: string | null;
};

type Course = { id: string; title: string };

type Tab = 'banners' | 'push';

export default function BroadcastPage() {
  const [tab, setTab] = useState<Tab>('banners');

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Banners &amp; Notifications</h2>
        <p className="text-sm text-slate-500 mt-1">
          Promotional cards on the student home screen, and push messages to every active student.
        </p>
      </div>

      <div className="flex gap-1 border-b border-white/8">
        {([['banners', 'Home banners'], ['push', 'Push notification']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id ? 'text-violet-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
            {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-violet-400" />}
          </button>
        ))}
      </div>

      {tab === 'banners' ? <BannersTab /> : <PushTab />}
    </div>
  );
}

// ── Banners ───────────────────────────────────────────────────────────────────
function BannersTab() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);

  const bannersQ = useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: () => api.get<Banner[]>('/api/v1/admin/banners'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/api/v1/admin/banners/${id}`, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'banners'] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not update', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/banners/${id}`),
    onSuccess: () => {
      toast('Banner deleted', 'success');
      void qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not delete', 'error'),
  });

  const items = bannersQ.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500">
          Shown in order, lowest number first. Students see only active banners inside their date window.
        </p>
        <Button onClick={() => setEditing('new')}>+ New banner</Button>
      </div>

      {bannersQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-10 text-center">
          <p className="text-slate-300 font-medium">No banners yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Add one and it appears on every student&apos;s home screen straight away.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b) => {
            const scheduled = b.startsAt && new Date(b.startsAt) > new Date();
            const expired = b.endsAt && new Date(b.endsAt) < new Date();
            return (
              <div key={b.id} className="rounded-2xl border border-white/8 bg-surface-1 overflow-hidden">
                <div className="relative h-32 bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-100">{b.title}</span>
                      <Badge variant="slate">#{b.sortOrder}</Badge>
                      {!b.isActive ? (
                        <Badge variant="slate">hidden</Badge>
                      ) : scheduled ? (
                        <Badge variant="amber">scheduled</Badge>
                      ) : expired ? (
                        <Badge variant="rose">expired</Badge>
                      ) : (
                        <Badge variant="teal">live</Badge>
                      )}
                      {b.courseTitle && <Badge variant="slate">→ {b.courseTitle}</Badge>}
                    </div>
                    {(b.startsAt || b.endsAt) && (
                      <p className="text-xs text-slate-500 mt-1">
                        {b.startsAt ? new Date(b.startsAt).toLocaleDateString('en-IN') : 'now'} —{' '}
                        {b.endsAt ? new Date(b.endsAt).toLocaleDateString('en-IN') : 'no end'}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle.mutate({ id: b.id, isActive: !b.isActive })}
                    >
                      {b.isActive ? 'Hide' : 'Show'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(b)}>Edit</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete this banner?',
                          message: 'It disappears from every student home screen immediately.',
                          destructive: true,
                        });
                        if (ok) remove.mutate(b.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <BannerModal
          api={api}
          banner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Banner saved', 'success');
            void qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
          }}
        />
      )}
    </div>
  );
}

function BannerModal({
  api, banner, onClose, onSaved,
}: {
  api: ReturnType<typeof createApiClient>;
  banner: Banner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuthStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(banner?.title ?? '');
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? '');
  const [courseId, setCourseId] = useState(banner?.courseId ?? '');
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0));
  const [startsAt, setStartsAt] = useState(banner?.startsAt?.slice(0, 10) ?? '');
  const [endsAt, setEndsAt] = useState(banner?.endsAt?.slice(0, 10) ?? '');
  const [uploading, setUploading] = useState(false);

  const coursesQ = useQuery({
    queryKey: ['admin', 'courses', 'for-banner'],
    queryFn: () => api.get<Course[]>('/api/v1/courses?limit=100'),
  });

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast('Banner must be an image', 'error');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/media/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Upload failed');
      setImageUrl(json.data.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        imageUrl,
        courseId: courseId || null,
        sortOrder: Number(sortOrder) || 0,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      };
      return banner
        ? api.patch(`/api/v1/admin/banners/${banner.id}`, payload)
        : api.post('/api/v1/admin/banners', payload);
    },
    onSuccess: onSaved,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });

  return (
    <Modal open onClose={onClose} title={banner ? 'Edit banner' : 'New banner'}>
      <div className="space-y-4">
        <Field label="Title (shown over the image)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kerala PSC 2026 — admissions open" autoFocus />
        </Field>

        <Field label="Image">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          {imageUrl ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="w-full h-28 object-cover rounded-xl border border-white/8" />
              <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                Replace image
              </Button>
            </div>
          ) : (
            <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              Upload image
            </Button>
          )}
          <p className="text-xs text-slate-500 mt-1.5">Wide images work best — the rail is about 16:7.</p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens course (optional)">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Not tappable</option>
              {(coursesQ.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Order">
            <Input
              value={sortOrder}
              inputMode="numeric"
              onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (optional)">
            <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends (optional)">
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={save.isPending}
            disabled={title.trim().length < 2 || !imageUrl}
            onClick={() => save.mutate()}
          >
            {banner ? 'Save' : 'Publish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Push ──────────────────────────────────────────────────────────────────────
function PushTab() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const send = useMutation({
    mutationFn: () => api.post<{ sent: number }>('/api/v1/admin/notifications/broadcast-all', {
      title: title.trim(),
      body: body.trim(),
    }),
    onSuccess: (r) => {
      toast(`Sent to ${r.data.sent} students`, 'success');
      setTitle('');
      setBody('');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not send', 'error'),
  });

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-2xl border border-white/8 bg-surface-1 p-5 space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New batch starting Monday" />
        </Field>
        <Field label="Message">
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Keep it short — this appears as a phone notification."
          />
        </Field>

        <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
          <p className="text-xs text-amber-200/90">
            This goes to <strong>every active student</strong> at once and cannot be recalled. To reach a
            single cohort instead, use the batch broadcast on the Batches page.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            loading={send.isPending}
            disabled={title.trim().length < 2 || body.trim().length < 2}
            onClick={async () => {
              const ok = await confirm({
                title: 'Send to all students?',
                message: `"${title.trim()}" will be pushed to every active student immediately.`,
              });
              if (ok) send.mutate();
            }}
          >
            Send to all students
          </Button>
        </div>
      </div>
    </div>
  );
}
