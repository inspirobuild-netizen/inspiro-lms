'use client';

import { usePathname } from 'next/navigation';
import { GlobalSearch } from './global-search';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/students': 'Students',
  '/batches': 'Batches',
  '/courses': 'Courses',
  '/exams': 'Exams',
  '/doubts': 'Doubts',
  '/analytics': 'Analytics',
  '/staff': 'Staff Management',
  '/branches': 'Branches',
  '/admissions': 'Admission CRM',
  '/reports': 'Reports',
  '/audit-log': 'Audit Log',
};

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const segment = '/' + (pathname.split('/')[1] ?? '');
  const title = titles[segment] ?? 'Admin';

  return (
    <header className="h-16 flex items-center gap-3 justify-between px-4 sm:px-6 lg:px-8 border-b border-white/8 bg-surface/80 backdrop-blur sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="lg:hidden shrink-0 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="font-display font-bold text-base sm:text-lg text-slate-100 truncate">{title}</h1>
      </div>
      <GlobalSearch />
    </header>
  );
}
