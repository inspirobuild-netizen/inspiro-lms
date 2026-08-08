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
import { Modal } from '@/components/ui/modal';
import { formatPhone } from '@/lib/utils';

type BatchDetail = {
  id: string;
  name: string;
  type: string;
  targetExam: string;
  status: string;
  enrolledCount: number;
  instructors: { id: string; name: string }[];
  course: { id: string; title: string; subject: string };
};

// API returns enrolled students nested: { enrollment, user }
type EnrolledRow = {
  enrollment: { userId: string; enrolledAt: string };
  user: { id: string; name: string; phone: string };
};
type UserRow = { id: string; name: string; phone: string; role: string };

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const batchKey = ['admin', 'batch', id];
  const { data, isError, refetch } = useQuery({
    queryKey: batchKey,
    queryFn: () => api.get<BatchDetail>(`/api/v1/batches/${id}`),
    enabled: !!accessToken,
  });

  const studentsKey = ['admin', 'batch', id, 'students'];
  const { data: studentsData } = useQuery({
    queryKey: studentsKey,
    queryFn: () => api.get<EnrolledRow[]>(`/api/v1/admin/batches/${id}/students?limit=100`),
    enabled: !!accessToken,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: batchKey });
    void qc.invalidateQueries({ queryKey: studentsKey });
  };

  const unenroll = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/v1/admin/batches/${id}/students/${userId}`),
    onSuccess: invalidate,
  });

  const removeInstructor = useMutation({
    mutationFn: (instructorId: string) => api.delete(`/api/v1/admin/batches/${id}/instructors/${instructorId}`),
    onSuccess: invalidate,
  });

  if (isError)
    return (
      <div className="space-y-3">
        <p className="text-rose-400">Could not load this batch.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
      </div>
    );

  const batch = data?.data;
  const students = studentsData?.data ?? [];

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Link href="/batches" className="text-sm text-slate-500 hover:text-slate-300">← Batches</Link>
        <h2 className="font-display font-bold text-2xl text-slate-100 mt-1">{batch?.name ?? 'Loading…'}</h2>
        {batch && (
          <>
            <p className="text-sm text-slate-400 mt-1">
              <Link href={`/courses/${batch.course.id}`} className="text-violet-300 hover:underline">{batch.course.title}</Link>
              {' · '}{batch.course.subject}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="slate" className="capitalize">{batch.type}</Badge>
              <Badge variant="default" className="uppercase">{batch.targetExam.replace('_', ' ')}</Badge>
              <Badge variant={batch.status === 'active' ? 'success' : 'amber'} className="capitalize">{batch.status}</Badge>
            </div>
          </>
        )}
      </div>

      {/* Enrolled students */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-slate-200">
            Students <span className="text-slate-500 text-sm font-normal">({batch?.enrolledCount ?? 0} enrolled)</span>
          </h3>
          <EnrollStudentButton batchId={id} onEnrolled={invalidate} />
        </div>
        {students.length === 0 ? (
          <p className="text-slate-500 text-sm rounded-2xl border border-white/8 bg-surface-1 p-6 text-center">
            No students enrolled — use “Enroll student” to add them.
          </p>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-surface-1 divide-y divide-white/5">
            {students.map((s) => (
              <div key={s.user.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-200">{s.user.name}</p>
                  <p className="text-xs text-slate-500">{formatPhone(s.user.phone)}</p>
                </div>
                <button
                  className="text-xs text-rose-400/70 hover:text-rose-400"
                  onClick={() => { if (confirm(`Remove ${s.user.name} from this batch?`)) unenroll.mutate(s.user.id); }}
                >
                  Unenroll
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Instructors */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-slate-200">Instructors</h3>
          <AssignInstructorButton batchId={id} assigned={batch?.instructors.map((i) => i.id) ?? []} onAssigned={invalidate} />
        </div>
        {(batch?.instructors ?? []).length === 0 ? (
          <p className="text-slate-500 text-sm rounded-2xl border border-white/8 bg-surface-1 p-6 text-center">
            No instructors assigned to this batch yet.
          </p>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-surface-1 divide-y divide-white/5">
            {batch!.instructors.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm text-slate-200">{i.name}</p>
                <button
                  className="text-xs text-rose-400/70 hover:text-rose-400"
                  onClick={() => { if (confirm(`Remove ${i.name} as an instructor for this batch?`)) removeInstructor.mutate(i.id); }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

// ── Enroll student picker ──────────────────────────────────────────────────────
function EnrollStudentButton({ batchId, onEnrolled }: { batchId: string; onEnrolled: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin', 'users', 'picker', search],
    queryFn: () => {
      const params = new URLSearchParams({ role: 'student', limit: '8', ...(search ? { search } : {}) });
      return api.get<UserRow[]>(`/api/v1/admin/users?${params.toString()}`);
    },
    enabled: !!accessToken && open,
  });

  const enroll = useMutation({
    mutationFn: (userId: string) => api.post(`/api/v1/admin/batches/${batchId}/enroll`, { userId }),
    onSuccess: () => { setError(null); onEnrolled(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to enroll'),
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Enroll student</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Enroll student" description="Search registered students and click to enroll">
        <div className="space-y-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone…" autoFocus />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(data?.data ?? []).map((u) => (
              <button
                key={u.id}
                className="w-full flex items-center justify-between rounded-xl bg-surface-2 border border-white/5 px-4 py-3 hover:bg-surface-high transition-colors text-left"
                onClick={() => enroll.mutate(u.id)}
                disabled={enroll.isPending}
              >
                <div>
                  <p className="text-sm text-slate-200">{u.name}</p>
                  <p className="text-xs text-slate-500">{formatPhone(u.phone)}</p>
                </div>
                <span className="text-xs text-teal-300">Enroll →</span>
              </button>
            ))}
            {(data?.data ?? []).length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">No students found — add them from the Students page first.</p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Assign instructor picker ────────────────────────────────────────────────────
function AssignInstructorButton({ batchId, assigned, onAssigned }: { batchId: string; assigned: string[]; onAssigned: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instructorsQ = useQuery({
    queryKey: ['admin', 'users', 'instructor-picker'],
    queryFn: () => api.get<UserRow[]>('/api/v1/admin/users?role=instructor&limit=100'),
    enabled: !!accessToken && open,
  });
  const staffQ = useQuery({
    queryKey: ['admin', 'staff', 'instructor-picker'],
    queryFn: () => api.get<UserRow[]>('/api/v1/admin/staff?limit=100'),
    enabled: !!accessToken && open,
  });

  const assign = useMutation({
    mutationFn: (instructorId: string) => api.post(`/api/v1/admin/batches/${batchId}/instructors`, { instructorId }),
    onSuccess: () => { setError(null); onAssigned(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to assign'),
  });

  const candidates = [...(instructorsQ.data?.data ?? []), ...(staffQ.data?.data ?? [])];
  const available = candidates.filter((c) => !assigned.includes(c.id));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Assign instructor</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Assign instructor" description="They'll be listed as teaching this batch">
        <div className="space-y-3">
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {available.map((u) => (
              <button
                key={u.id}
                className="w-full flex items-center justify-between rounded-xl bg-surface-2 border border-white/5 px-4 py-3 hover:bg-surface-high transition-colors text-left"
                onClick={() => assign.mutate(u.id)}
                disabled={assign.isPending}
              >
                <div>
                  <p className="text-sm text-slate-200">{u.name}</p>
                  <p className="text-xs text-slate-500">{formatPhone(u.phone)}</p>
                </div>
                <span className="text-xs text-teal-300">Assign →</span>
              </button>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">
                No instructors available — add a Teacher via Staff, or a legacy instructor account.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
