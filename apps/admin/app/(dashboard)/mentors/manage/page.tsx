'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth';
import { createApiClient, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal, Field } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

/**
 * Admin-only mentor configuration: subject identity and the batch mapping
 * that scopes everything the mentor can touch. Staff holding the Mentor role
 * appear here automatically; add mentors from the Staff page first.
 */

type Mentor = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  isActive: boolean;
  coreSubject: string | null;
  strongSubjects: string[];
  batches: { id: string; name: string }[];
};

type Batch = { id: string; name: string; status: string };

export default function MentorManagePage() {
  const { accessToken, user } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Mentor | null>(null);

  const mentorsQ = useQuery({
    queryKey: ['admin', 'mentors', 'config'],
    queryFn: () => api.get<Mentor[]>('/api/v1/admin/mentors'),
    enabled: user?.role === 'admin',
  });

  const batchesQ = useQuery({
    queryKey: ['admin', 'batches', 'all-for-mapping'],
    queryFn: () => api.get<{ items: Batch[] }>('/api/v1/batches?limit=100'),
  });

  if (user && user.role !== 'admin') {
    return <p className="text-slate-500 text-sm p-6">This page is only available to administrators.</p>;
  }

  const mentors = mentorsQ.data?.data ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Mentor Setup</h2>
        <p className="text-sm text-slate-500 mt-1">
          Each mentor has one core subject, strong areas, and the batches they guide. The batch
          mapping decides whose students, doubts and activities they can see.
        </p>
      </div>

      {mentorsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : mentors.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-10 text-center">
          <p className="text-slate-300 font-medium">No mentors yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Create a staff member with the <span className="text-slate-300">Mentor</span> role on the
            Staff page — they will appear here for subject and batch setup.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mentors.map((m) => (
            <div key={m.id} className="rounded-2xl border border-white/8 bg-surface-1 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-100">{m.name}</h3>
                    {!m.isActive && <Badge variant="rose">disabled</Badge>}
                    {m.coreSubject ? (
                      <Badge variant="teal">{m.coreSubject}</Badge>
                    ) : (
                      <Badge variant="amber">not configured</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{m.phone}{m.email ? ` · ${m.email}` : ''}</p>
                  {m.strongSubjects.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">
                      Strong areas: {m.strongSubjects.join(', ')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.batches.length === 0 ? (
                      <span className="text-xs text-slate-500">No batches mapped — sees nothing</span>
                    ) : (
                      m.batches.map((b) => <Badge key={b.id} variant="slate">{b.name}</Badge>)
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(m)}>Configure</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ConfigureModal
          mentor={editing}
          batches={batchesQ.data?.data.items ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['admin', 'mentors', 'config'] });
            toast('Mentor updated', 'success');
          }}
          api={api}
        />
      )}
    </div>
  );
}

function ConfigureModal({
  mentor, batches, onClose, onSaved, api,
}: {
  mentor: Mentor;
  batches: Batch[];
  onClose: () => void;
  onSaved: () => void;
  api: ReturnType<typeof createApiClient>;
}) {
  const toast = useToast();
  const [core, setCore] = useState(mentor.coreSubject ?? '');
  const [strong, setStrong] = useState(mentor.strongSubjects.join(', '));
  const [selected, setSelected] = useState<Set<string>>(new Set(mentor.batches.map((b) => b.id)));

  const save = useMutation({
    mutationFn: async () => {
      await api.put(`/api/v1/admin/mentors/${mentor.id}/profile`, {
        coreSubject: core.trim(),
        strongSubjects: strong.split(',').map((s) => s.trim()).filter(Boolean),
      });
      await api.put(`/api/v1/admin/mentors/${mentor.id}/batches`, { batchIds: [...selected] });
    },
    onSuccess: onSaved,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });

  return (
    <Modal open onClose={onClose} title={`Configure ${mentor.name}`}>
      <div className="space-y-4">
        <Field label="Core subject">
          <Input value={core} onChange={(e) => setCore(e.target.value)} placeholder="Polity" autoFocus />
        </Field>
        <Field label="Strong areas (comma separated)">
          <Input value={strong} onChange={(e) => setStrong(e.target.value)} placeholder="History, Geography" />
        </Field>
        <Field label="Batches this mentor guides">
          <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-xl border border-white/8 p-3">
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
                {b.name} <span className="text-xs text-slate-500">({b.status})</span>
              </label>
            ))}
            {batches.length === 0 && <p className="text-xs text-slate-500">No batches exist yet.</p>}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={core.trim().length < 2} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
