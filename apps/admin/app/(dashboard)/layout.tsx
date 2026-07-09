'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useAuthStore } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, hydrated } = useAuthStore();

  useEffect(() => {
    // Only redirect AFTER the persisted session has loaded — redirecting
    // earlier logs users out on every full page load / refresh.
    if (hydrated && (!user || !accessToken)) {
      router.replace('/login');
    }
  }, [hydrated, user, accessToken, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand-violet border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user || !accessToken) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
