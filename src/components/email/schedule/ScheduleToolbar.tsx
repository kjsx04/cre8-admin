"use client";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button, IconButton } from "@/components/ui";

interface ScheduleToolbarProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Week view only: ask the AI to rebalance this week */
  onOptimize?: () => void;
  optimizing?: boolean;
  optimizeNote?: string | null;
}

/** ‹ › Today + the period label, with the week optimizer on the right */
export default function ScheduleToolbar({ label, onPrev, onNext, onToday, onOptimize, optimizing, optimizeNote }: ScheduleToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        <IconButton size="sm" variant="secondary" label="Previous" icon={<ChevronLeft size={18} strokeWidth={1.75} />} onClick={onPrev} />
        <IconButton size="sm" variant="secondary" label="Next" icon={<ChevronRight size={18} strokeWidth={1.75} />} onClick={onNext} />
        <Button size="sm" variant="secondary" onClick={onToday} className="ml-1">
          Today
        </Button>
      </div>
      <h2 className="text-lg font-semibold text-text">{label}</h2>
      <div className="w-[220px] flex items-center justify-end gap-2">
        {optimizeNote && <span className="text-xs text-text-3 truncate">{optimizeNote}</span>}
        {onOptimize && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onOptimize}
            loading={optimizing}
            icon={<RefreshCw size={16} strokeWidth={1.75} />}
            title="Ask the AI to rebalance this week under the per-day cap"
          >
            {optimizing ? "Rebalancing…" : "Re-optimize week"}
          </Button>
        )}
      </div>
    </div>
  );
}
