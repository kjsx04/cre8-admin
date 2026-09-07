"use client";

import { useEffect, useRef } from "react";
import { CmsChip, joinHighlight } from "@/lib/email/utils";
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
          <div key={row.id} className="flex items-center gap-1.5 bg-light-gray rounded-btn px-2 py-1.5">
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
              className="w-[36%] bg-transparent text-sm text-charcoal placeholder:text-border-medium focus:outline-none"
            />
            <span className="text-border-medium text-sm select-none">:</span>
            <input
              onFocus={binding.onFocus}
              onBlur={binding.onBlur}
              value={row.value}
              onChange={(e) => onUpdate(row.id, { value: e.target.value })}
              placeholder="Value"
              className="flex-1 min-w-0 bg-transparent text-sm text-charcoal placeholder:text-border-medium focus:outline-none"
            />
            {/* Reorder + remove */}
            <button
              type="button"
              onClick={() => onMove(row.id, "up")}
              disabled={i === 0}
              className="p-1 text-muted-gray hover:text-charcoal disabled:opacity-20"
              title="Move up"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              type="button"
              onClick={() => onMove(row.id, "down")}
              disabled={i === rows.length - 1}
              className="p-1 text-muted-gray hover:text-charcoal disabled:opacity-20"
              title="Move down"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              className="p-1 text-muted-gray hover:text-red-500 text-base leading-none"
              title="Remove"
            >
              &times;
            </button>
          </div>
        );
      })}

      {/* Add: from listing chips + custom */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {availableChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => addFromChip(chip)}
            className="px-2.5 py-1 rounded-full text-xs bg-light-gray text-charcoal hover:bg-charcoal hover:text-white transition-colors"
          >
            + {chip.label}
          </button>
        ))}
        <button
          type="button"
          onClick={addCustom}
          className="px-2.5 py-1 rounded-full text-xs font-medium text-green hover:bg-green/10 transition-colors"
        >
          + Custom
        </button>
      </div>
    </div>
  );
}
