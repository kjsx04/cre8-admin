"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Plus, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Button, IconButton, Input, Select, cn, FOCUS_RING, useConfirm, useToast } from "@/components/ui";
import type { ContactView } from "@/lib/demand/view";
import type { ContactType } from "@/lib/demand/types";

interface Draft {
  id: string;
  contactType: ContactType;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  saved: boolean;
}

function draftFrom(contact: ContactView): Draft {
  return {
    id: contact.id,
    contactType: contact.contactType,
    name: contact.name || "",
    company: contact.firmName || "",
    title: contact.title || "",
    email: contact.email || "",
    phone: contact.phone || "",
    saved: true,
  };
}

function blankDraft(): Draft {
  return { id: `new-${Date.now()}`, contactType: "broker", name: "", company: "", title: "", email: "", phone: "", saved: false };
}

/**
 * Contacts for one tenant. The popover lists every contact and edits them in place.
 * Saves go to the tenant's contacts, keyed by tenant id.
 */
export default function ContactPopover({
  contacts,
  tenantName,
  tenantId,
  onSaved,
  onDeleted,
  onChanged,
}: {
  contacts: ContactView[];
  tenantName: string;
  tenantId: string;
  onSaved?: (contact: ContactView) => void;
  onDeleted?: (id: string) => void;
  /** Optional refresh for callers that still reload. The open popover does not reset from that reload. */
  onChanged?: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const holding = useRef(false);
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  useEffect(() => {
    if (!open) return;
    setRows((contactsRef.current || []).map(draftFrom));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 360;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom;
      const top = below < 360 ? Math.max(8, rect.top - 420) : rect.bottom + 6;
      setBox({ top, left });
    };
    place();
    const onDown = (event: MouseEvent) => {
      if (holding.current) return;
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (holding.current) return;
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
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

  function patch(id: string, next: Partial<Draft>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  function payload(row: Draft) {
    return {
      contactType: row.contactType,
      name: row.name,
      company: row.company || null,
      title: row.title || null,
      email: row.email || null,
      phone: row.phone || null,
    };
  }

  async function save(row: Draft) {
    if (!row.name.trim()) {
      toast.error("Add a name");
      return;
    }
    setSavingId(row.id);
    try {
      const creating = row.id.startsWith("new-");
      const res = await apiFetch(creating ? `/api/demand/tenants/${tenantId}/contacts` : `/api/demand/tenants/${tenantId}/contacts/${row.id}`, {
        method: creating ? "POST" : "PATCH",
        body: JSON.stringify(payload(row)),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not save the contact");
      const saved = draftFrom(body as ContactView);
      setRows((current) => current.map((item) => (item.id === row.id ? saved : item)));
      toast.success("Saved");
      onSaved?.(body as ContactView);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the contact");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(row: Draft) {
    holding.current = true;
    const ok = await confirm({
      title: `Delete ${row.name || "this contact"}?`,
      message: "This removes the contact from the tenant.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    holding.current = false;
    if (!ok) return;
    if (row.id.startsWith("new-")) {
      setRows((current) => current.filter((item) => item.id !== row.id));
      return;
    }
    const res = await apiFetch(`/api/demand/tenants/${tenantId}/contacts/${row.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error || "Could not delete the contact");
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    toast.success("Deleted");
    onDeleted?.(row.id);
    onChanged?.();
  }

  const ordered = rows.slice().sort((a, b) => {
    const type = (a.contactType === "broker" ? 0 : 1) - (b.contactType === "broker" ? 0 : 1);
    return type || a.name.localeCompare(b.name);
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
            className="fixed z-50 w-[22rem] max-h-[70vh] overflow-y-auto bg-surface border border-border rounded-modal shadow-popover p-3"
            style={{ top: box.top, left: box.left }}
          >
            {ordered.length === 0 && <p className="text-sm text-text-2">No contacts on file.</p>}
            {ordered.map((row, index) => (
              <ContactEditor
                key={row.id}
                row={row}
                first={index === 0}
                saving={savingId === row.id}
                copiedEmail={copied === `${row.id}:email`}
                copiedPhone={copied === `${row.id}:phone`}
                onChange={(next) => patch(row.id, next)}
                onSave={() => save(row)}
                onDelete={() => remove(row)}
                onCopyEmail={() => row.email && copy(`${row.id}:email`, row.email)}
                onCopyPhone={() => row.phone && copy(`${row.id}:phone`, row.phone)}
              />
            ))}
            <Button variant="secondary" size="sm" className="mt-3" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => setRows((current) => [...current, blankDraft()])}>
              Add contact
            </Button>
          </div>,
          document.body
        )}
    </>
  );
}

function ContactEditor({
  row,
  first,
  saving,
  copiedEmail,
  copiedPhone,
  onChange,
  onSave,
  onDelete,
  onCopyEmail,
  onCopyPhone,
}: {
  row: Draft;
  first: boolean;
  saving: boolean;
  copiedEmail: boolean;
  copiedPhone: boolean;
  onChange: (next: Partial<Draft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onCopyEmail: () => void;
  onCopyPhone: () => void;
}) {
  return (
    <div className={first ? "" : "mt-3 pt-3 border-t border-border"}>
      <div className="grid grid-cols-2 gap-2">
        <Select small aria-label="Contact type" value={row.contactType} onChange={(e) => onChange({ contactType: e.target.value === "in_house" ? "in_house" : "broker" })}>
          <option value="broker">Broker</option>
          <option value="in_house">In-house</option>
        </Select>
        <Input small aria-label="Name" placeholder="Name" value={row.name} onChange={(e) => onChange({ name: e.target.value })} />
        <Input small aria-label="Company" placeholder="Company" value={row.company} onChange={(e) => onChange({ company: e.target.value })} />
        <Input small aria-label="Title" placeholder="Title" value={row.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <CopyField label="Copy email" placeholder="Email" value={row.email} copied={copiedEmail} onChange={(email) => onChange({ email })} onCopy={onCopyEmail} />
      <CopyField label="Copy phone" placeholder="Phone" value={row.phone} copied={copiedPhone} onChange={(phone) => onChange({ phone })} onCopy={onCopyPhone} />
      <div className="flex items-center gap-2 mt-2">
        <Button size="sm" variant="secondary" loading={saving} onClick={onSave}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function CopyField({
  label,
  placeholder,
  value,
  copied,
  onChange,
  onCopy,
}: {
  label: string;
  placeholder: string;
  value: string;
  copied: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-1 mt-2">
      <Input small aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value &&
        (copied ? (
          <span className="text-xs text-text-3 w-12 shrink-0 text-center">Copied</span>
        ) : (
          <IconButton label={label} size="sm" icon={<Copy size={14} strokeWidth={1.75} />} onClick={onCopy} />
        ))}
    </div>
  );
}
