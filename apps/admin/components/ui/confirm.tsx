'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from './modal';
import { Button } from './button';

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

const ConfirmCtx = createContext<(opts: ConfirmOpts) => Promise<boolean>>(async () => false);

/** Returns `confirm(opts)` → resolves true if the user confirms. */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState(opts);
      }),
    [],
  );

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal open onClose={() => close(false)} title={state.title} description={state.message}>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button variant={state.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
              {state.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
