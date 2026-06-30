"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * İmperatif onay diyaloğu — native window.confirm() yerine Catalyst UI.
 * `const confirm = useConfirm();  if (!(await confirm({...}))) return;`
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onClose={() => settle(false)}>
        <DialogTitle>{opts?.title}</DialogTitle>
        {opts?.description ? (
          <DialogDescription>{opts.description}</DialogDescription>
        ) : null}
        <DialogActions>
          <Button plain onClick={() => settle(false)}>
            {opts?.cancelLabel ?? "Vazgeç"}
          </Button>
          <Button
            color={opts?.destructive ? "red" : undefined}
            onClick={() => settle(true)}
            autoFocus
          >
            {opts?.confirmLabel ?? "Onayla"}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı");
  }
  return ctx;
}
