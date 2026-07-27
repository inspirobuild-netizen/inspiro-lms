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

export function Header() {
  const pathname = usePathname();
  const segment = '/' + (pathname.split('/')[1] ?? '');
  const title = titles[segment] ?? 'Admin';

  return (
    <header className="h-16 flex items-center justify-between px-8 border-b border-white/8 bg-surface/80 backdrop-blur sticky top-0 z-10">
      <h1 className="font-display font-bold text-lg text-slate-100">{title}</h1>
      <GlobalSearch />
    </header>
  );
}
