'use client';

import { usePathname } from 'next/navigation';

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
};

export function Header() {
  const pathname = usePathname();
  const segment = '/' + (pathname.split('/')[1] ?? '');
  const title = titles[segment] ?? 'Admin';

  return (
    <header className="h-16 flex items-center px-8 border-b border-white/8 bg-surface/80 backdrop-blur sticky top-0 z-10">
      <h1 className="font-display font-bold text-lg text-slate-100">{title}</h1>
    </header>
  );
}
