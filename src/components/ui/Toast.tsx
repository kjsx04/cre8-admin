"use client";

import { ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "./cn";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  description?: string;
}

interface ToastApi {
  success: (message: string, opts?: { description?: string }) => void;
  error: (message: string, opts?: { description?: string }) => void;
  info: (message: string, opts?: { description?: string }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * ToastProvider — mounted once in AppShell. Renders the bottom-right stack.
 * Anywhere below it: `const toast = useToast(); toast.success("Saved")`.
 * Replaces every native alert().
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, opts?: { description?: string }) => {
      const id = nextId.current++;
      setItems((list) => [...list, { id, kind, message, description: opts?.description }]);
      // Errors stay a little longer so they can be read
      window.setTimeout(() => dismiss(id), kind === "error" ? AUTO_DISMISS_MS * 2 : AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Stack */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICON: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={18} strokeWidth={1.75} className="text-accent-strong" />,
  error: <XCircle size={18} strokeWidth={1.75} className="text-danger" />,
  info: <Info size={18} strokeWidth={1.75} className="text-info-fg" />,
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex items-start gap-3 bg-surface border border-border rounded-modal shadow-popover px-4 py-3 animate-slide-up"
      )}
    >
      <span className="mt-0.5 shrink-0">{ICON[item.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{item.message}</p>
        {item.description && <p className="text-xs text-text-2 mt-0.5 break-words">{item.description}</p>}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-text-3 hover:text-text -mr-1 shrink-0">
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Hook: `const toast = useToast(); toast.success("Listing saved")` */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Outside the provider (shouldn't happen) — fall back to console so nothing crashes
    return {
      success: (m) => console.log("[toast]", m),
      error: (m) => console.error("[toast]", m),
      info: (m) => console.info("[toast]", m),
    };
  }
  return ctx;
}
