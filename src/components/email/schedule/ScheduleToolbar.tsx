"use client";

import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

export type ScheduleView = "week" | "month";

interface ScheduleToolbarProps {
  label: string;
  view: ScheduleView;
  onViewChange: (view: ScheduleView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Planner only: ask the AI to rebalance the weeks on screen */
  onOptimize?: () => void;
  optimizing?: boolean;
  optimizeNote?: string | null;
}

/**
 * ‹ › Today, the period label, and the Week/Month toggle.
 *
 * The toggle sits here rather than in the page header because it controls the
 * calendar directly below it. Everything here uses the shared Button, so the
 * calendar reads as one control surface instead of a row of one-off styles.
 */
export default function ScheduleToolbar({
  label,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onOptimize,
  optimizing,
  optimizeNote,
}: ScheduleToolbarProps) {
  return (
    /* Three equal columns so the period stays centred on the page no matter how
       wide the controls on either side get. */
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-3">
      <div className="flex items-center">
        <Button variant="secondary" size="sm" onClick={onToday}>
          Today
        </Button>
      </div>

      {/* The arrows flank the period they move */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={onPrev} aria-label="Previous" className="px-2">
          <ChevronLeft size={16} strokeWidth={1.75} />
        </Button>
        <h2 className="font-bebas text-2xl tracking-wide text-text text-center min-w-[13ch]">{label}</h2>
        <Button variant="secondary" size="sm" onClick={onNext} aria-label="Next" className="px-2">
          <ChevronRight size={16} strokeWidth={1.75} />
        </Button>
      </div>

      <div className="flex items-center justify-end gap-2">
        {optimizeNote && <span className="text-xs text-text-3 truncate max-w-[160px]">{optimizeNote}</span>}

        {/* One control, two states — not two buttons that happen to be adjacent */}
        <div className="flex items-center h-control-sm rounded-control bg-surface-2 p-0.5" role="group" aria-label="Calendar view">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              aria-pressed={view === v}
              className={`px-3 h-full rounded-[4px] text-sm font-medium transition-colors ${
                view === v ? "bg-surface text-text shadow-sm" : "text-text-2 hover:text-text"
              }`}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>

        {/* Re-optimize acts on the two weeks the planner shows, so it has no
            meaning in month view. The slot is held open either way so the
            Week/Month toggle doesn't jump when you switch. */}
        <div className="min-w-[124px] flex justify-end">
          {onOptimize && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOptimize}
              loading={optimizing}
              icon={<Sparkles size={16} strokeWidth={1.75} />}
              title="Ask the AI to rebalance the weeks on screen, under the per-day cap"
            >
              {optimizing ? "Rebalancing" : "Re-optimize"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
