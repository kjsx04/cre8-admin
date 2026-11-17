"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy } from "lucide-react";
import { IconButton } from "@/components/ui";
import type { ContactView } from "@/lib/demand/view";

/** Name in the broker or in-house column. Hovering keeps a card open so phone and email can be copied. */
export default function PersonHover({ contact }: { contact: ContactView | null }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  function place() {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 240;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom;
    const top = below < 160 ? Math.max(8, rect.top - 148) : rect.bottom + 4;
    setBox({ top, left });
  }

  function show() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1200);
    } catch {
      setCopied(null);
    }
  }

  if (!contact?.name) return <span className="text-sm text-text">—</span>;

  return (
    <>
      <span
        ref={anchor}
        tabIndex={0}
        className="text-sm text-text truncate block outline-none"
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={(event) => {
          if (pop.current?.contains(event.relatedTarget as Node)) return;
          scheduleClose();
        }}
      >
        {contact.name}
      </span>
      {open && box && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={pop}
            role="tooltip"
            className="fixed z-50 w-60 bg-surface border border-border rounded-card shadow-popover p-3"
            style={{ top: box.top, left: box.left }}
            onMouseEnter={show}
            onMouseLeave={scheduleClose}
          >
            <p className="text-sm font-medium text-text">{contact.name}</p>
            {contact.firmName && <p className="text-xs text-text-2 mt-0.5">{contact.firmName}</p>}
            <CopyLine label="Copy phone" value={contact.phone} copied={copied === "phone"} onCopy={() => contact.phone && copy("phone", contact.phone)} />
            <CopyLine label="Copy email" value={contact.email} copied={copied === "email"} onCopy={() => contact.email && copy("email", contact.email)} />
          </div>,
          document.body
        )}
    </>
  );
}

function CopyLine({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-1 mt-2 min-w-0">
      <span className="text-sm text-text truncate flex-1">{value || "—"}</span>
      {value &&
        (copied ? (
          <span className="text-xs text-text-3 shrink-0">Copied</span>
        ) : (
          <IconButton label={label} size="sm" icon={<Copy size={14} strokeWidth={1.75} />} onClick={onCopy} />
        ))}
    </div>
  );
}
