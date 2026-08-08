import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ReactQueryProvider } from '@/lib/query-client';
import { ServiceWorkerRegistrar } from '@/components/pwa-register';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Inspiro Admin',
  description: 'Civil Connect LMS — Admin Dashboard',
  manifest: '/manifest.webmanifest',
  applicationName: 'Inspiro Admin',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Inspiro' },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

// viewport-fit=cover + the safe-area padding in globals.css keeps the app clear
// of notches and the iOS home indicator when installed to the home screen.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#11131e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-surface text-slate-100 antialiased`}>
        <ReactQueryProvider>{children}</ReactQueryProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
