"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button, cn } from "@/components/ui";

export interface PickerOption {
  id: string;
  name: string;
  /** Shown to the right — usually the delivered count, so you can see which rows have data */
  note?: string;
}

interface CampaignPickerProps {
  options: PickerOption[];
  /** null = every campaign combined */
  value: string | null;
  onChange: (id: string | null) => void;
}

/**
 * Scope selector for the dashboard. Defaults to All campaigns.
 *
 * A menu rather than a <select> because each row carries a second line of
 * context (how much data that campaign actually has), which a native select
 * cannot show — and picking a campaign with no data is the one mistake that
 * makes the whole page look broken.
 */
export default function CampaignPicker({ options, value, onChange }: CampaignPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="max-w-[260px]"
      >
        <span className="truncate">{selected ? selected.name : "All campaigns"}</span>
        <ChevronDown size={16} strokeWidth={1.75} className="ml-1.5 shrink-0 text-text-3" />
      </Button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1 w-[300px] max-h-[320px] overflow-y-auto bg-surface border border-border rounded-card py-1"
        >
          <Row
            label="All campaigns"
            note={`${options.length} total`}
            selected={value === null}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          />
          <div className="my-1 border-t border-border" />
          {options.map((o) => (
            <Row
              key={o.id}
              label={o.name}
              note={o.note}
              selected={value === o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  note,
  selected,
  onClick,
}: {
  label: string;
  note?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150",
        selected ? "bg-accent-soft text-text" : "text-text-2 hover:bg-surface-2 hover:text-text"
      )}
    >
      <Check size={16} strokeWidth={1.75} className={cn("shrink-0", selected ? "text-accent-strong" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {note && <span className="shrink-0 text-xs text-text-3 tabular-nums">{note}</span>}
    </button>
  );
}
