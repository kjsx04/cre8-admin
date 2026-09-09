"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 *
 * Every position is unique: type 4 into the row that's #2 and it becomes #4,
 * the old #4 becomes #5, and so on. Press and hold a row to lift it out of the
 * list; the others close the gap and a green line shows where it will land.
 * Apply saves the order and asks the AI to rebalance this week and next.
 */
export default function PriorityPanel({ campaigns, userEmail, onClose, onApplied }: PriorityPanelProps) {
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialRef = useRef<string>("");

  // Campaigns per listing (chips under each row)
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

  /** Move a row from one index to another; everything in between shifts by one */
  const moveTo = useCallback((from: number, to: number) => {
    setRows((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  }, []);

  // ── Number boxes: controlled, so they always show the live position ──
  const [numDraft, setNumDraft] = useState<Record<string, string>>({});
  const commitNumber = (idx: number, id: string) => {
    const raw = numDraft[id];
    setNumDraft((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    if (raw == null || raw === "") return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    moveTo(idx, Math.min(rows.length, Math.max(1, n)) - 1);
  };

  // ── Press-and-hold drag with a floating card and an insertion line ──
  const rowEls = useRef(new Map<string, HTMLLIElement>());
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    fromIndex: number;
    insertIndex: number; // index among the OTHER rows where the card will land
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
  } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const computeInsertIndex = useCallback(
    (pointerY: number, excludeId: string) => {
      const others = rows.filter((r) => r.listing_id !== excludeId);
      for (let i = 0; i < others.length; i++) {
        const el = rowEls.current.get(others[i].listing_id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (pointerY < rect.top + rect.height / 2) return i;
      }
      return others.length;
    },
    [rows]
  );

  const startDrag = (e: React.PointerEvent<HTMLLIElement>, row: RankRow, idx: number) => {
    if (applying) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, button")) return; // typing / clicking, not dragging
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    // Hold for a beat before lifting — feels deliberate, avoids accidental drags
    holdTimer.current = window.setTimeout(() => {
      setDrag({
        id: row.listing_id,
        fromIndex: idx,
        insertIndex: idx,
        x: startX,
        y: startY,
        offsetX: startX - rect.left,
        offsetY: startY - rect.top,
        width: rect.width,
      });
    }, 120);
  };

  useEffect(() => {
    const cancelHold = () => {
      if (holdTimer.current) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      setDrag({ ...d, x: e.clientX, y: e.clientY, insertIndex: computeInsertIndex(e.clientY, d.id) });
    };
    const onUp = () => {
      cancelHold();
      const d = dragRef.current;
      if (!d) return;
      // Translate "index among the others" into a real index
      const to = d.insertIndex > d.fromIndex ? d.insertIndex : d.insertIndex;
      moveTo(d.fromIndex, Math.min(rows.length - 1, to));
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [computeInsertIndex, moveTo, rows.length]);

  // Rows as displayed: the dragged one is lifted out, the rest close the gap
  const visibleRows = drag ? rows.filter((r) => r.listing_id !== drag.id) : rows;
  const draggedRow = drag ? rows.find((r) => r.listing_id === drag.id) : null;

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

  /** One row — used for the list and for the floating card */
  const renderRow = (row: RankRow, idx: number, floating = false) => {
    const camps = byListing.get(row.listing_id) || [];
    const number = floating ? "" : String(idx + 1);
    return (
      <div
        className={`flex items-center gap-3 rounded-card border bg-white px-3 py-2 select-none ${
          floating ? "border-green shadow-xl" : "border-border-light"
        }`}
      >
        {/* Rank box */}
        <input
          type="number"
          min={1}
          max={rows.length}
          value={floating ? "" : numDraft[row.listing_id] ?? number}
          onChange={(e) => setNumDraft((d) => ({ ...d, [row.listing_id]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitNumber(idx, row.listing_id);
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={() => commitNumber(idx, row.listing_id)}
          disabled={applying || floating}
          className="w-12 shrink-0 text-center text-sm font-semibold text-charcoal border border-border-light rounded-btn py-1 focus:outline-none focus:ring-1 focus:ring-green [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          title="Type a number and press Enter"
        />
        <span className="text-border-medium" aria-hidden>⋮⋮</span>
        <div className="w-12 h-8 rounded overflow-hidden bg-border-light shrink-0">
          {row.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photo_url} alt="" className="w-full h-full object-cover" draggable={false} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-charcoal truncate">{row.listing_name}</div>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {camps.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 text-[10px] text-medium-gray" title={formatScheduleDate(c.scheduled_date)}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getTypeColor(c.email_label) }} />
                {c.email_label}
                {c.campaign_type === "recurring" && c.frequency && (
                  <span className="text-muted-gray">· {FREQUENCY_LABELS[c.frequency] || c.frequency}</span>
                )}
              </span>
            ))}
          </div>
        </div>
        {row.rank == null && !floating && (
          <span className="text-[10px] uppercase tracking-wide text-muted-gray shrink-0" title="Not ranked yet">new</span>
        )}
        {!floating && (
          <div className="flex flex-col shrink-0">
            <button type="button" onClick={() => moveTo(idx, idx - 1)} disabled={applying || idx === 0} className="p-0.5 text-muted-gray hover:text-charcoal disabled:opacity-20" title="Move up">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" onClick={() => moveTo(idx, idx + 1)} disabled={applying || idx === rows.length - 1} className="p-0.5 text-muted-gray hover:text-charcoal disabled:opacity-20" title="Move down">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>
    );
  };

  const InsertLine = () => (
    <li aria-hidden className="relative h-2 my-0.5">
      <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-0.5 bg-green rounded-full" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green" />
    </li>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={applying ? undefined : onClose} />

      <div className="relative bg-white w-full max-w-xl h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-light">
          <div>
            <h3 className="font-bebas text-2xl tracking-wide text-charcoal">Priorities</h3>
            <p className="text-xs text-muted-gray mt-0.5">
              #1 gets the best slots. Press and hold to drag, or type a number and press Enter.
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

          <ol ref={listRef} className={`space-y-1.5 ${drag ? "cursor-grabbing" : ""}`} style={{ touchAction: drag ? "none" : "pan-y" }}>
            {visibleRows.map((row, i) => {
              // Real index in `rows` for number/arrow handlers
              const realIdx = rows.findIndex((r) => r.listing_id === row.listing_id);
              return (
                <RowSlot key={row.listing_id} showLineBefore={!!drag && drag.insertIndex === i} InsertLine={InsertLine}>
                  <li
                    ref={(el) => {
                      if (el) rowEls.current.set(row.listing_id, el);
                      else rowEls.current.delete(row.listing_id);
                    }}
                    onPointerDown={(e) => startDrag(e, row, realIdx)}
                    onPointerUp={() => {
                      if (holdTimer.current) {
                        window.clearTimeout(holdTimer.current);
                        holdTimer.current = null;
                      }
                    }}
                    className={`transition-transform duration-150 ${applying ? "" : "cursor-grab"}`}
                  >
                    {renderRow(row, realIdx)}
                  </li>
                </RowSlot>
              );
            })}
            {drag && drag.insertIndex === visibleRows.length && <InsertLine />}
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

      {/* Floating card that follows the pointer while dragging */}
      {drag && draggedRow && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
            transform: "scale(1.03) rotate(-0.6deg)",
            transformOrigin: "center",
          }}
        >
          {renderRow(draggedRow, drag.fromIndex, true)}
        </div>
      )}
    </div>
  );
}

/** Wraps a row so an insertion line can appear right above it */
function RowSlot({
  showLineBefore,
  InsertLine,
  children,
}: {
  showLineBefore: boolean;
  InsertLine: () => JSX.Element;
  children: React.ReactNode;
}) {
  return (
    <>
      {showLineBefore && <InsertLine />}
      {children}
    </>
  );
}
