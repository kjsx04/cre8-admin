"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChoiceButton } from "@/components/email/composer/composer-ui";

type CalendarToolsMenuProps = {
  staleCount: number;
  syncing: boolean;
  onOpenSettings: () => void;
  onOpenPriorities: () => void;
  onSyncAll: () => Promise<void>;
};

/**
 * Calendar header: Settings + Priorities + Sync all templates in one control.
 * Trigger is an inset chip (same language as composer choices). No green flash.
 */
export default function CalendarToolsMenu({
  staleCount,
  syncing,
  onOpenSettings,
  onOpenPriorities,
  onSyncAll,
}: CalendarToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !confirmOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (open && rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        if (!syncing) setConfirmOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, confirmOpen, syncing]);

  const closeMenu = () => setOpen(false);

  const requestSyncAll = () => {
    closeMenu();
    if (staleCount === 0) return;
    if (staleCount >= 2) {
      setConfirmOpen(true);
      return;
    }
    void onSyncAll();
  };

  const runSync = async () => {
    await onSyncAll();
    setConfirmOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <ChoiceButton
        selected={open}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Settings"
        className="gap-2"
      >
        <HamburgerIcon />
        <span>Settings</span>
      </ChoiceButton>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-card bg-white py-1 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06),0_10px_28px_rgba(0,0,0,0.08)]"
        >
          <MenuItem
            onClick={() => {
              closeMenu();
              onOpenSettings();
            }}
          >
            Scheduler settings
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              onOpenPriorities();
            }}
          >
            Priorities
          </MenuItem>
          <div className="my-1 h-px bg-black/[0.06]" />
          <MenuItem onClick={requestSyncAll} disabled={syncing}>
            {syncing ? "Syncing templates…" : "Sync all templates"}
          </MenuItem>
          {staleCount === 0 && (
            <p className="px-3 pb-2 text-[11px] leading-snug text-muted-gray">
              Eligible campaigns already use the current template.
            </p>
          )}
          {staleCount > 0 && (
            <p className="px-3 pb-2 text-[11px] leading-snug text-muted-gray">
              {staleCount === 1 ? "1 campaign is" : `${staleCount} campaigns are`} behind the current layout.
            </p>
          )}
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => {
              if (!syncing) setConfirmOpen(false);
            }}
          />
          <div className="relative w-full max-w-md rounded-card bg-white p-6 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.12)] mx-4">
            <h3 className="text-lg font-medium text-charcoal">Sync all templates</h3>
            <p className="mt-2 text-sm text-charcoal">
              Sync {staleCount} {staleCount === 1 ? "campaign" : "campaigns"} to current template?
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-gray">
              Applies today&apos;s layout chrome. Frozen listing snapshots and campaign copy stay.
              Scheduled and active pending Resend sends are replaced. Sent mail is not changed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={syncing}
                className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runSync}
                disabled={syncing || staleCount === 0}
                className="px-4 py-1.5 bg-charcoal text-white text-sm font-medium rounded-btn hover:bg-black disabled:opacity-50"
              >
                {syncing ? "Syncing…" : staleCount === 1 ? "Sync campaign" : `Sync ${staleCount} campaigns`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center px-3 py-2 text-left text-sm text-charcoal hover:bg-light-gray disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function HamburgerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 4.25h11M2.5 8h11M2.5 11.75h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
