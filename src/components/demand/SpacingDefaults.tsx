"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { IconButton, Input, useToast } from "@/components/ui";

export interface SpacingRow {
  category: string;
  spacingMiles: number | null;
}

/**
 * Category default spacing, opened from the Demand gear menu.
 * Each field saves on blur and only writes spacing_miles.
 */
export default function SpacingDefaults({
  onClose,
  onSaved,
  initial,
}: {
  onClose: () => void;
  onSaved: () => void;
  /** Skip the fetch when the rows are already in hand. */
  initial?: SpacingRow[];
}) {
  const toast = useToast();
  const [rows, setRows] = useState<SpacingRow[] | null>(initial ?? null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    apiFetch("/api/demand/reference")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Could not load");
        return body as SpacingRow[];
      })
      .then((body) => {
        if (!cancelled) setRows(body);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load");
      });
    return () => {
      cancelled = true;
    };
  }, [toast, initial]);

  async function save(category: string, spacingMiles: number | null): Promise<boolean> {
    const res = await apiFetch("/api/demand/reference", {
      method: "PATCH",
      body: JSON.stringify({ category, spacingMiles }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error || "Could not save");
      return false;
    }
    setRows((current) => current?.map((row) => (row.category === category ? { ...row, spacingMiles } : row)) ?? current);
    onSaved();
    return true;
  }

  return (
    <div className="absolute right-[5px] top-12 z-30 w-72 max-h-[70%] bg-surface border border-border rounded-card shadow-popover flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <p className="text-sm font-medium text-text">Defaults</p>
        <IconButton label="Close" size="sm" icon={<X size={14} strokeWidth={1.75} />} onClick={onClose} />
      </div>
      <div className="overflow-y-auto py-1">
        {(rows || []).map((row) => (
          <SpacingLine key={row.category} row={row} onSave={(miles) => save(row.category, miles)} />
        ))}
      </div>
    </div>
  );
}

function SpacingLine({ row, onSave }: { row: SpacingRow; onSave: (miles: number | null) => Promise<boolean> }) {
  const [text, setText] = useState(row.spacingMiles == null ? "" : String(row.spacingMiles));
  useEffect(() => {
    setText(row.spacingMiles == null ? "" : String(row.spacingMiles));
  }, [row.spacingMiles]);

  return (
    <label className="flex items-center gap-2 px-3 py-1">
      <span className="flex-1 min-w-0 text-sm text-text truncate">{row.category}</span>
      <div className="w-16 shrink-0">
      <Input
        small
        type="text"
        inputMode="decimal"
        aria-label={`${row.category} miles`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const trimmed = text.trim();
          const next = trimmed === "" ? null : Number(trimmed);
          if (next != null && !Number.isFinite(next)) {
            setText(row.spacingMiles == null ? "" : String(row.spacingMiles));
            return;
          }
          if (next === row.spacingMiles) return;
          void onSave(next).then((ok) => {
            if (!ok) setText(row.spacingMiles == null ? "" : String(row.spacingMiles));
          });
        }}
      />
      </div>
      <span className="text-xs text-text-3 w-4 shrink-0">mi</span>
    </label>
  );
}
