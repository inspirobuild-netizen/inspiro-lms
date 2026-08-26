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
 * Mentor management — one page.
 *
 * Previously split in two: a read-only workload table here, and subject/batch
 * setup on a separate page under a different sidebar group. Anyone looking to
 * "manage mentors" naturally clicked the read-only one and concluded the
 * feature was missing. Configuration and workload now sit together, since
 * they describe the same person.
 *
 * Everyone with mentors.view can read the page; only an admin may change the
 * subject or batch mapping, because the mapping decides whose students a
 * mentor can see.
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

type Workload = {
  id: string;
  name: string;
  batchCount: number;
  batchNames: string[];
  doubtsAnswered: number;
  avgResponseMins: number | null;
};

type Batch = { id: string; name: string; status: string };

function formatMins(mins: number): string {
  return mins < 60 ? `${Math.round(mins)}m` : `${(mins / 60).toFixed(1)}h`;
}

export default function MentorsPage() {
  const { accessToken, user } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Mentor | null>(null);

  const isAdmin = user?.role === 'admin';

  // Only an admin may read the mentor roster endpoint, so staff get the
  // workload view alone rather than a failed request.
  const mentorsQ = useQuery({
    queryKey: ['admin', 'mentors', 'config'],
    queryFn: () => api.get<Mentor[]>('/api/v1/admin/mentors'),
    enabled: !!accessToken && isAdmin,
  });

  const workloadQ = useQuery({
    queryKey: ['admin', 'mentors', 'workload'],
    queryFn: () => api.get<Workload[]>('/api/v1/admin/mentors/workload'),
    enabled: !!accessToken,
  });

  const batchesQ = useQuery({
    queryKey: ['admin', 'batches', 'for-mentors'],
    queryFn: () => api.get<Batch[]>('/api/v1/batches?limit=100'),
    enabled: !!accessToken && isAdmin,
  });

  const mentors = mentorsQ.data?.data ?? [];
  const workById = new Map((workloadQ.data?.data ?? []).map((w) => [w.id, w]));

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Mentors</h2>
        <p className="text-sm text-slate-500 mt-1">
          Each mentor has one core subject, strong areas, and the batches they guide. The batch
          mapping decides whose students, doubts and activities they can see.
        </p>
      </div>

      {!isAdmin ? (
        <WorkloadOnly rows={workloadQ.data?.data ?? []} loading={workloadQ.isLoading} />
      ) : mentorsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : mentors.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-10 text-center">
          <p className="text-slate-300 font-medium">No mentors yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Add a staff member with the <span className="text-slate-300">Mentor</span> role on the
            Staff page. They appear here for subject and batch setup.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => (window.location.href = '/staff')}>
            Go to Staff
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {mentors.map((m) => {
            const w = workById.get(m.id);
            return (
              <div key={m.id} className="rounded-2xl border border-white/8 bg-surface-1 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-100">{m.name}</h3>
                      {!m.isActive && <Badge variant="rose">disabled</Badge>}
                      {m.coreSubject ? (
                        <Badge variant="teal">{m.coreSubject}</Badge>
                      ) : (
                        <Badge variant="amber">subject not set</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {m.phone}
                      {m.email ? ` · ${m.email}` : ''}
                    </p>
                    {m.strongSubjects.length > 0 && (
                      <p className="text-xs text-slate-400 mt-2">
                        Also strong in: {m.strongSubjects.join(', ')}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {m.batches.length === 0 ? (
                        <span className="text-xs text-amber-300/80">
                          No batches assigned — this mentor currently sees nothing
                        </span>
                      ) : (
                        m.batches.map((b) => (
                          <Badge key={b.id} variant="slate">{b.name}</Badge>
                        ))
                      )}
                    </div>

                    {w && (
                      <p className="text-xs text-slate-500 mt-3">
                        {w.doubtsAnswered} doubt{w.doubtsAnswered === 1 ? '' : 's'} answered
                        {w.avgResponseMins !== null ? ` · avg reply ${formatMins(w.avgResponseMins)}` : ''}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                    Configure
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ConfigureModal
          api={api}
          mentor={editing}
          batches={batchesQ.data?.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['admin', 'mentors'] });
            toast('Mentor updated', 'success');
          }}
        />
      )}
    </div>
  );
}

/** What non-admin staff see: workload only, no configuration. */
function WorkloadOnly({ rows, loading }: { rows: Workload[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">No staff found.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Teaching load and doubt-resolution across staff. Only an administrator can change subjects
        or batch assignments.
      </p>
      {rows.map((w) => (
        <div key={w.id} className="rounded-2xl border border-white/8 bg-surface-1 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-200">{w.name}</span>
            <span className="text-xs text-slate-500">
              {w.batchCount} batch{w.batchCount === 1 ? '' : 'es'} · {w.doubtsAnswered} doubts
              {w.avgResponseMins !== null ? ` · avg ${formatMins(w.avgResponseMins)}` : ''}
            </span>
          </div>
          {w.batchNames.length > 0 && (
            <p className="text-xs text-slate-500 mt-1 truncate">{w.batchNames.join(', ')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ConfigureModal({
  api, mentor, batches, onClose, onSaved,
}: {
  api: ReturnType<typeof createApiClient>;
  mentor: Mentor;
  batches: Batch[];
  onClose: () => void;
  onSaved: () => void;
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
          <Input
            value={strong}
            onChange={(e) => setStrong(e.target.value)}
            placeholder="History, Geography"
          />
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
                    if (e.target.checked) next.add(b.id);
                    else next.delete(b.id);
                    setSelected(next);
                  }}
                />
                {b.name} <span className="text-xs text-slate-500">({b.status})</span>
              </label>
            ))}
            {batches.length === 0 && <p className="text-xs text-slate-500">No batches exist yet.</p>}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            A mentor with no batches sees no students, doubts or activities.
          </p>
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
