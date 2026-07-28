'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useAuthStore } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, hydrated } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Only redirect AFTER the persisted session has loaded — redirecting
    // earlier logs users out on every full page load / refresh.
    if (hydrated && (!user || !accessToken)) {
      router.replace('/login');
    }
  }, [hydrated, user, accessToken, router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand-violet border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user || !accessToken) return null;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex-1 lg:ml-60 flex flex-col min-h-screen min-w-0">
            <Header onMenuClick={() => setSidebarOpen(true)} />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">{children}</main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
