"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { CmsChip, joinHighlight } from "@/lib/email/utils";
import { Button, IconButton } from "@/components/ui";
import { HighlightRow } from "./useCampaignDraft";
import { FieldProps } from "./fieldProps";

interface DetailsEditorProps {
  rows: HighlightRow[];
  chips: CmsChip[];
  onUpdate: (id: number, patch: Partial<Pick<HighlightRow, "title" | "value">>) => void;
  onMove: (id: number, direction: "up" | "down") => void;
  onRemove: (id: number) => void;
  /** Add a row; returns the new row id so we can focus it */
  onAdd: (title?: string, value?: string) => number;
  fieldProps: FieldProps;
}

// The two inputs in a row are borderless and sit on a grey strip — the one custom input in the composer
const INLINE_INPUT = "bg-transparent text-sm text-text placeholder:text-text-3 focus:outline-none";

/**
 * Section 4 — Details.
 * One row per item: Title | Value, reorder, remove. Chips add listing fields
 * that aren't in the list yet. Stored as "Title: Value" strings (see joinHighlight).
 */
export default function DetailsEditor({ rows, chips, onUpdate, onMove, onRemove, onAdd, fieldProps }: DetailsEditorProps) {
  // Focus the title of a row we just added
  const focusRowIdRef = useRef<number | null>(null);
  const titleRefs = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    if (focusRowIdRef.current == null) return;
    const el = titleRefs.current.get(focusRowIdRef.current);
    if (el) {
      el.focus();
      focusRowIdRef.current = null;
    }
  }, [rows]);

  const present = new Set(rows.map((r) => joinHighlight(r.title, r.value)));
  const availableChips = chips.filter((c) => !present.has(c.value));

  function addFromChip(chip: CmsChip) {
    const idx = chip.value.indexOf(":");
    const title = idx > 0 ? chip.value.slice(0, idx).trim() : "";
    const value = idx > 0 ? chip.value.slice(idx + 1).trim() : chip.value;
    onAdd(title, value);
  }

  function addCustom() {
    focusRowIdRef.current = onAdd("", "");
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const binding = fieldProps(`highlight-${i}`);
        return (
          <div key={row.id} className="flex items-center gap-1.5 bg-surface-2 rounded-control pl-3 pr-1 py-1">
            <input
              ref={(el) => {
                binding.ref(el);
                if (el) titleRefs.current.set(row.id, el);
                else titleRefs.current.delete(row.id);
              }}
              onFocus={binding.onFocus}
              onBlur={binding.onBlur}
              value={row.title}
              onChange={(e) => onUpdate(row.id, { title: e.target.value })}
              placeholder="Title"
              className={`w-[36%] ${INLINE_INPUT}`}
            />
            <span className="text-text-3 text-sm select-none">:</span>
            <input
              onFocus={binding.onFocus}
              onBlur={binding.onBlur}
              value={row.value}
              onChange={(e) => onUpdate(row.id, { value: e.target.value })}
              placeholder="Value"
              className={`flex-1 min-w-0 ${INLINE_INPUT}`}
            />
            {/* Reorder + remove */}
            <IconButton size="sm" label="Move up" icon={<ArrowUp size={16} strokeWidth={1.75} />} onClick={() => onMove(row.id, "up")} disabled={i === 0} />
            <IconButton size="sm" label="Move down" icon={<ArrowDown size={16} strokeWidth={1.75} />} onClick={() => onMove(row.id, "down")} disabled={i === rows.length - 1} />
            <IconButton size="sm" label="Remove" icon={<X size={16} strokeWidth={1.75} />} onClick={() => onRemove(row.id)} className="hover:text-danger-fg" />
          </div>
        );
      })}

      {/* Add: from listing chips + custom */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {availableChips.map((chip) => (
          <Button key={chip.key} size="sm" variant="secondary" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => addFromChip(chip)}>
            {chip.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus size={14} strokeWidth={1.75} />} onClick={addCustom}>
          Custom
        </Button>
      </div>
    </div>
  );
}
