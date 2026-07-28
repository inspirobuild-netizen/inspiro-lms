'use client';

import * as Dialog from '@radix-ui/react-dialog';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
};

export function Modal({ open, onClose, title, description, children, wide }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] ${wide ? 'max-w-2xl' : 'max-w-md'} -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-surface-1 p-4 sm:p-6 shadow-2xl focus:outline-none max-h-[85vh] overflow-y-auto`}
        >
          <Dialog.Title className="font-display font-bold text-lg text-slate-100">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="text-sm text-slate-400 mt-1">{description}</Dialog.Description>
          )}
          <div className="mt-5">{children}</div>
          <Dialog.Close asChild>
            <button
              aria-label="Close"
              className="absolute right-4 top-4 text-slate-500 hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Styled native select matching the Input look. */
export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`flex h-10 w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent ${className}`}
      {...props}
    />
  );
}

/** Styled textarea matching the Input look. */
export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent resize-y ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
