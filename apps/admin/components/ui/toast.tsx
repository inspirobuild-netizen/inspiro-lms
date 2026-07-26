'use client';

import { createContext, useCallback, useContext, useState } from 'react';

type ToastVariant = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; variant: ToastVariant };

const ToastCtx = createContext<(message: string, variant?: ToastVariant) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const styles: Record<ToastVariant, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  info: 'border-white/10 bg-surface-2 text-slate-200',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-3rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${styles[t.variant]}`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
