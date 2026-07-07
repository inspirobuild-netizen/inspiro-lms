'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useAuthStore } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();

  useEffect(() => {
    if (!user || !accessToken) {
      router.replace('/login');
    }
  }, [user, accessToken, router]);

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
