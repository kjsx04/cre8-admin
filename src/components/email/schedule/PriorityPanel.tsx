"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Campaign } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate } from "@/lib/email/utils";
import { FREQUENCY_LABELS } from "@/lib/email/constants";

interface PriorityPanelProps {
  campaigns: Campaign[];
  userEmail: string;
  onClose: () => void;
  /** Called after Apply so the page can refetch */
  onApplied: () => Promise<void> | void;
}

interface RankRow {
  listing_id: string;
  listing_name: string;
  photo_url: string | null;
  rank: number | null; // null = not ranked yet (new to the schedule)
}

/**
 * Priorities — one ranked list of every listing on the schedule.
 * Drag a row, or type a number and press Enter, and everything renumbers.
 * Apply saves the order and asks the AI to rebalance this week and next.
 */
export default function PriorityPanel({ campaigns, userEmail, onClose, onApplied }: PriorityPanelProps) {
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialRef = useRef<string>("");

  // Campaigns per listing (for the chips under each row)
  const byListing = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    for (const c of campaigns) {
      if (c.status !== "scheduled" && c.status !== "active") continue;
      const list = map.get(c.listing_id) || [];
      list.push(c);
      map.set(c.listing_id, list);
    }
    return map;
  }, [campaigns]);

  // Load the current order
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/priorities", { headers: { "x-user-email": userEmail } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't load priorities");
        const list: RankRow[] = data.listings || [];
        setRows(list);
        initialRef.current = JSON.stringify(list.map((r) => r.listing_id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load priorities");
      } finally {
        setLoading(false);
      }
    })();
  }, [userEmail]);

  const dirty = JSON.stringify(rows.map((r) => r.listing_id)) !== initialRef.current;

  /** Move a row to a new index (0-based) */
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  };

  // ── Drag and drop (native, no library) ──
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // ── Number input ──
  const commitNumber = (idx: number, value: string) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    moveTo(idx, Math.min(rows.length, Math.max(1, n)) - 1);
  };

  async function apply() {
    setApplying(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/email/priorities", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({
          order: rows.map((r) => ({ listing_id: r.listing_id, listing_name: r.listing_name })),
          optimize: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save priorities");
      const moved = (data.rebalance || []).reduce((n: number, w: { moved?: unknown[] }) => n + (w.moved?.length || 0), 0);
      setNote(moved === 0 ? "Saved. Schedule already balanced." : `Saved. AI moved ${moved} send${moved === 1 ? "" : "s"}.`);
      initialRef.current = JSON.stringify(rows.map((r) => r.listing_id));
      setRows((prev) => prev.map((r, i) => ({ ...r, rank: i + 1 })));
      await onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save priorities");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={applying ? undefined : onClose} />

      <div className="relative bg-white w-full max-w-xl h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-light">
          <div>
            <h3 className="font-bebas text-2xl tracking-wide text-charcoal">Priorities</h3>
            <p className="text-xs text-muted-gray mt-0.5">
              #1 gets the best slots. Drag a row, or type a number and press Enter.
            </p>
          </div>
          <button onClick={onClose} disabled={applying} className="text-muted-gray hover:text-charcoal text-lg disabled:opacity-40">
            &times;
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-gray py-8 text-center">Nothing on the schedule yet.</p>
          )}

          <ol className="space-y-1.5">
            {rows.map((row, idx) => {
              const camps = byListing.get(row.listing_id) || [];
              const isOver = dragOver === idx;
              return (
                <li
                  key={row.listing_id}
                  draggable={!applying}
                  onDragStart={(e) => {
                    dragFrom.current = idx;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOver !== idx) setDragOver(idx);
                  }}
                  onDragLeave={() => setDragOver((d) => (d === idx ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom.current != null) moveTo(dragFrom.current, idx);
                    dragFrom.current = null;
                    setDragOver(null);
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                    setDragOver(null);
                  }}
                  className={`flex items-center gap-3 rounded-card border bg-white px-3 py-2 transition-colors ${
                    isOver ? "border-green bg-[#f7fdf0]" : "border-border-light"
                  } ${applying ? "" : "cursor-grab active:cursor-grabbing"}`}
                >
                  {/* Rank number — editable */}
                  <input
                    type="number"
                    min={1}
                    max={rows.length}
                    defaultValue={idx + 1}
                    key={`${row.listing_id}-${idx}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitNumber(idx, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => commitNumber(idx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={applying}
                    className="w-12 shrink-0 text-center text-sm font-semibold text-charcoal border border-border-light rounded-btn py-1 focus:outline-none focus:ring-1 focus:ring-green [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    title="Type a number and press Enter"
                  />

                  {/* Drag handle */}
                  <span className="text-border-medium select-none" aria-hidden>
                    ⋮⋮
                  </span>

                  {/* Thumb + name */}
                  <div className="w-12 h-8 rounded overflow-hidden bg-border-light shrink-0">
                    {row.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-charcoal truncate">{row.listing_name}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {camps.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 text-[10px] text-medium-gray"
                          title={formatScheduleDate(c.scheduled_date)}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getTypeColor(c.email_label) }} />
                          {c.email_label}
                          {c.campaign_type === "recurring" && c.frequency && (
                            <span className="text-muted-gray">· {FREQUENCY_LABELS[c.frequency] || c.frequency}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {row.rank == null && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-gray shrink-0" title="Not ranked yet">new</span>
                  )}

                  {/* Up / down for keyboard & touch */}
                  <div className="flex flex-col shrink-0">
                    <button type="button" onClick={() => moveTo(idx, idx - 1)} disabled={applying || idx === 0} className="p-0.5 text-muted-gray hover:text-charcoal disabled:opacity-20" title="Move up">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button type="button" onClick={() => moveTo(idx, idx + 1)} disabled={applying || idx === rows.length - 1} className="p-0.5 text-muted-gray hover:text-charcoal disabled:opacity-20" title="Move down">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border-light">
          <span className={`text-xs ${error ? "text-red-500" : "text-muted-gray"}`}>
            {error || note || (dirty ? "Apply saves the order and lets the AI rebalance this week and next" : "Drag or type a number to reorder")}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={applying} className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal disabled:opacity-40">
              Close
            </button>
            <button
              onClick={apply}
              disabled={applying || loading || rows.length === 0}
              className="px-5 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? "Rebalancing…" : "Apply & Rebalance"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
