"use client";

import { ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button (deletes, cancels) */
  tone?: "default" | "danger";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * ConfirmProvider — mounted once in AppShell. Gives every page a Promise-based
 * confirm dialog that replaces the browser's native confirm():
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete this deal?", tone: "danger", confirmLabel: "Delete" })) { … }
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => settle(false)}
        size="sm"
        title={opts?.title}
        hideClose
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              {opts?.cancelLabel || "Cancel"}
            </Button>
            <Button variant={opts?.tone === "danger" ? "danger" : "primary"} onClick={() => settle(true)} autoFocus>
              {opts?.confirmLabel || "Confirm"}
            </Button>
          </>
        }
      >
        {opts?.message && <p className="text-text-2">{opts.message}</p>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Hook: returns `confirm(opts) => Promise<boolean>` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Outside the provider — fall back to the browser dialog so nothing breaks
    return async (o) => window.confirm(o.title);
  }
  return ctx;
}
