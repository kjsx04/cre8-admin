"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Campaign } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate } from "@/lib/email/utils";
import { FREQUENCY_LABELS } from "@/lib/email/constants";
import { Badge, Button, EmptyState, IconButton, Input, LoadingBlock, SlideOver } from "@/components/ui";

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

  // The panel can't be closed while the AI is rebalancing
  const safeClose = () => {
    if (!applying) onClose();
  };

  /** One row — used for the list and for the floating card */
  const renderRow = (row: RankRow, idx: number, floating = false) => {
    const camps = byListing.get(row.listing_id) || [];
    const number = floating ? "" : String(idx + 1);
    return (
      <div
        className={`flex items-center gap-3 rounded-card border bg-surface px-3 py-2 select-none ${
          floating ? "border-accent shadow-popover" : "border-border"
        }`}
      >
        {/* Rank box — shared Input, spinner arrows hidden */}
        <div className="w-12 shrink-0">
          <Input
            small
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
            className="text-center font-semibold px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            title="Type a number and press Enter"
          />
        </div>
        <GripVertical size={16} strokeWidth={1.75} className="text-border-strong shrink-0" aria-hidden />
        <div className="w-12 h-8 rounded overflow-hidden bg-surface-2 shrink-0">
          {row.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photo_url} alt="" className="w-full h-full object-cover" draggable={false} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text truncate">{row.listing_name}</div>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {camps.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 text-xs text-text-2" title={formatScheduleDate(c.scheduled_date)}>
                {/* Campaign-type color is data */}
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getTypeColor(c.email_label) }} />
                {c.email_label || "Group"}
                {c.campaign_type === "recurring" && c.frequency && (
                  <span className="text-text-3">· {FREQUENCY_LABELS[c.frequency] || c.frequency}</span>
                )}
              </span>
            ))}
          </div>
        </div>
        {row.rank == null && !floating && (
          <Badge size="sm" title="Not ranked yet">New</Badge>
        )}
        {!floating && (
          <div className="flex items-center gap-0.5 shrink-0">
            <IconButton size="sm" label="Move up" icon={<ArrowUp size={16} strokeWidth={1.75} />} onClick={() => moveTo(idx, idx - 1)} disabled={applying || idx === 0} />
            <IconButton size="sm" label="Move down" icon={<ArrowDown size={16} strokeWidth={1.75} />} onClick={() => moveTo(idx, idx + 1)} disabled={applying || idx === rows.length - 1} />
          </div>
        )}
      </div>
    );
  };

  // Green insertion line — shows where the lifted row will land (selection indicator)
  const InsertLine = () => (
    <li aria-hidden className="relative h-2 my-0.5">
      <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-0.5 bg-accent rounded-full" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent" />
    </li>
  );

  return (
    <>
      {/* Shared SlideOver primitive — status note on the left of the footer, actions on the right */}
      <SlideOver
        open
        onClose={safeClose}
        width="md"
        title="Priorities"
        description="#1 gets the best slots. Press and hold to drag, or type a number and press Enter."
        footer={
          <div className="flex items-center justify-between gap-4 w-full">
            <span className={`text-xs min-w-0 ${error ? "text-danger-fg" : "text-text-3"}`}>
              {error || note || (dirty ? "Apply saves the order and lets the AI rebalance this week and next" : "Drag or type a number to reorder")}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" onClick={onClose} disabled={applying}>
                Close
              </Button>
              <Button onClick={apply} loading={applying} disabled={loading || rows.length === 0}>
                {applying ? "Rebalancing…" : "Apply and rebalance"}
              </Button>
            </div>
          </div>
        }
      >
        {loading && <LoadingBlock />}
        {!loading && rows.length === 0 && <EmptyState compact title="Nothing on the schedule yet" />}

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
      </SlideOver>

      {/* Floating card that follows the pointer while dragging (above the slide-over layer) */}
      {drag && draggedRow && (
        <div
          className="fixed z-[60] pointer-events-none"
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
    </>
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
