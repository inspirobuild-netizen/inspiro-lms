'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

type SearchResult = {
  students: { id: string; name: string; phone: string; email: string | null }[];
  staff: { id: string; name: string; phone: string; email: string | null }[];
  leads: { id: string; leadCode: string; studentName: string; phone: string; status: string }[];
  courses: { id: string; title: string; subject: string }[];
  batches: { id: string; name: string }[];
};

export function GlobalSearch() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function onChange(v: string) {
    setQ(v);
    setOpen(v.length >= 2);
    clearTimeout((onChange as { t?: ReturnType<typeof setTimeout> }).t);
    (onChange as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => setDebounced(v), 350);
  }

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.get<SearchResult>(`/api/v1/admin/search?q=${encodeURIComponent(debounced)}`),
    enabled: !!accessToken && debounced.length >= 2,
  });

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ('');
    router.push(href);
  }

  const r = data?.data;
  const hasResults = r && (r.students.length || r.staff.length || r.leads.length || r.courses.length || r.batches.length);

  return (
    <div ref={boxRef} className="relative w-32 sm:w-72">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="Search…"
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-white/10 bg-surface-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-violet"
        />
      </div>

      {open && debounced.length >= 2 && (
        <div className="absolute mt-2 w-full max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-surface-1 shadow-2xl z-50 py-2">
          {isFetching && <p className="px-4 py-2 text-xs text-slate-500">Searching…</p>}
          {!isFetching && !hasResults && <p className="px-4 py-2 text-xs text-slate-500">No matches</p>}

          {!!r?.students.length && (
            <Section title="Students">
              {r.students.map((s) => (
                // No per-student detail page exists yet — land on the Students
                // list pre-filtered to this phone number (unique per student).
                <ResultRow key={s.id} onClick={() => go(`/students?q=${encodeURIComponent(s.phone)}`)} title={s.name} sub={s.phone} />
              ))}
            </Section>
          )}
          {!!r?.leads.length && (
            <Section title="Leads">
              {r.leads.map((l) => (
                <ResultRow key={l.id} onClick={() => go(`/admissions/leads/${l.id}`)} title={l.studentName} sub={`${l.leadCode} · ${l.status}`} />
              ))}
            </Section>
          )}
          {!!r?.staff.length && (
            <Section title="Staff">
              {r.staff.map((s) => (
                <ResultRow key={s.id} onClick={() => go(`/staff/${s.id}`)} title={s.name} sub={s.phone} />
              ))}
            </Section>
          )}
          {!!r?.courses.length && (
            <Section title="Courses">
              {r.courses.map((c) => (
                <ResultRow key={c.id} onClick={() => go(`/courses/${c.id}`)} title={c.title} sub={c.subject} />
              ))}
            </Section>
          )}
          {!!r?.batches.length && (
            <Section title="Batches">
              {r.batches.map((b) => (
                <ResultRow key={b.id} onClick={() => go(`/batches/${b.id}`)} title={b.name} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function ResultRow({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-2 hover:bg-surface-2 transition-colors">
      <p className="text-sm text-slate-200">{title}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </button>
  );
}
