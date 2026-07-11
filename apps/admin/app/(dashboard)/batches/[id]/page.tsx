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
  courses: { id: string; title: string; subject: string }[];
};

// API returns enrolled students nested: { enrollment, user }
type EnrolledRow = {
  enrollment: { userId: string; enrolledAt: string };
  user: { id: string; name: string; phone: string };
};
type CourseRow = { id: string; title: string; subject: string; isPublished: boolean };
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

  const removeCourse = useMutation({
    mutationFn: (courseId: string) => api.delete(`/api/v1/admin/batches/${id}/courses/${courseId}`),
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
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="slate" className="capitalize">{batch.type}</Badge>
            <Badge variant="default" className="uppercase">{batch.targetExam.replace('_', ' ')}</Badge>
            <Badge variant={batch.status === 'active' ? 'success' : 'amber'} className="capitalize">{batch.status}</Badge>
          </div>
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

      {/* Assigned courses */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-slate-200">Courses</h3>
          <AssignCourseButton batchId={id} assigned={batch?.courses.map((c) => c.id) ?? []} onAssigned={invalidate} />
        </div>
        {(batch?.courses ?? []).length === 0 ? (
          <p className="text-slate-500 text-sm rounded-2xl border border-white/8 bg-surface-1 p-6 text-center">
            No courses assigned — students in this batch see assigned courses in the app.
          </p>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-surface-1 divide-y divide-white/5">
            {batch!.courses.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-slate-200">{c.title}</p>
                  <p className="text-xs text-slate-500">{c.subject}</p>
                </div>
                <button
                  className="text-xs text-rose-400/70 hover:text-rose-400"
                  onClick={() => { if (confirm(`Remove "${c.title}" from this batch?`)) removeCourse.mutate(c.id); }}
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

// ── Assign course picker ───────────────────────────────────────────────────────
function AssignCourseButton({ batchId, assigned, onAssigned }: { batchId: string; assigned: string[]; onAssigned: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin', 'courses', 'picker'],
    queryFn: () => api.get<CourseRow[]>('/api/v1/courses?limit=100'),
    enabled: !!accessToken && open,
  });

  const assign = useMutation({
    mutationFn: (courseId: string) => api.post(`/api/v1/admin/batches/${batchId}/courses`, { courseId }),
    onSuccess: () => { setError(null); onAssigned(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to assign'),
  });

  const available = (data?.data ?? []).filter((c) => !assigned.includes(c.id));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Assign course</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Assign course" description="Students in this batch get access to assigned courses">
        <div className="space-y-3">
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {available.map((c) => (
              <button
                key={c.id}
                className="w-full flex items-center justify-between rounded-xl bg-surface-2 border border-white/5 px-4 py-3 hover:bg-surface-high transition-colors text-left"
                onClick={() => assign.mutate(c.id)}
                disabled={assign.isPending}
              >
                <div>
                  <p className="text-sm text-slate-200">{c.title}</p>
                  <p className="text-xs text-slate-500">{c.subject} · {c.isPublished ? 'Published' : 'Draft'}</p>
                </div>
                <span className="text-xs text-teal-300">Assign →</span>
              </button>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">
                No unassigned courses — create one from the Courses page.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
