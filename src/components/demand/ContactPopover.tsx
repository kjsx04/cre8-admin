"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Users } from "lucide-react";
import { IconButton, cn, FOCUS_RING } from "@/components/ui";
import type { ContactView } from "@/lib/demand/view";

/**
 * One icon on the tenant row. The popover lists every contact, brokers first.
 */
export default function ContactPopover({ contacts, tenantName }: { contacts: ContactView[]; tenantName: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 320;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom;
      const top = below < 280 ? Math.max(8, rect.top - 300) : rect.bottom + 6;
      setBox({ top, left });
    };
    place();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1200);
    } catch {
      setCopied(null);
    }
  }

  const ordered = (contacts || []).slice().sort((a, b) => {
    const type = (a.contactType === "broker" ? 0 : 1) - (b.contactType === "broker" ? 0 : 1);
    if (type) return type;
    return Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name);
  });

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Contacts for ${tenantName}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex items-center justify-center w-control-sm h-control-sm rounded-control text-text-2 hover:bg-surface-2 hover:text-text",
          FOCUS_RING
        )}
      >
        <Users size={16} strokeWidth={1.75} />
      </button>
      {open && box && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={`${tenantName} contacts`}
            className="fixed z-50 w-80 max-h-80 overflow-y-auto bg-surface border border-border rounded-modal shadow-popover p-3"
            style={{ top: box.top, left: box.left }}
          >
            {ordered.length === 0 && <p className="text-sm text-text-2">No contacts on file.</p>}
            {ordered.map((contact, index) => {
              const previous = ordered[index - 1];
              const company = contact.contactType === "broker" ? contact.firmName : tenantName;
              const showKind = !previous || previous.contactType !== contact.contactType;
              return (
                <div key={contact.id} className={index > 0 ? "mt-3 pt-3 border-t border-border" : ""}>
                  {showKind && (
                    <p className="text-xs text-text-3 mb-1">{contact.contactType === "broker" ? "Broker" : "In-house"}</p>
                  )}
                  <p className="text-sm font-medium text-text">
                    {contact.name || "Contact"}
                    {contact.isPrimary && <span className="text-text-3 font-normal"> · Primary</span>}
                  </p>
                  <p className="text-sm text-text-2">
                    {[company, contact.title].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <CopyLine label="Copy email" value={contact.email} copied={copied === `${contact.id}:email`} onCopy={() => contact.email && copy(`${contact.id}:email`, contact.email)} />
                  <CopyLine label="Copy phone" value={contact.phone} copied={copied === `${contact.id}:phone`} onCopy={() => contact.phone && copy(`${contact.id}:phone`, contact.phone)} />
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

function CopyLine({ label, value, copied, onCopy }: { label: string; value: string | null; copied: boolean; onCopy: () => void }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1 mt-1 min-w-0">
      {copied ? (
        <span className="text-xs text-text-3 w-7 shrink-0">Copied</span>
      ) : (
        <IconButton label={label} size="sm" icon={<Copy size={14} strokeWidth={1.75} />} onClick={onCopy} />
      )}
      <span className="text-sm text-text truncate">{value}</span>
    </div>
  );
}
