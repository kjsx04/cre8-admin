"use client";

import { Deal } from "@/lib/flow/types";
import {
  formatCurrency,
  calcTakeHome,
  getMemberSplit,
  getCriticalDates,
  countdownText,
} from "@/lib/flow/utils";

interface DealCardProps {
  deal: Deal;
  brokerId?: string;
  onClick: () => void;
  // Optional drag-and-drop props (used by Kanban board, ignored in list view)
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export default function DealCard({ deal, brokerId, onClick, draggable, onDragStart, onDragEnd }: DealCardProps) {
  // Take-home = price × rate × 70% after house × member split − additional splits
  const memberSplit = getMemberSplit(deal.deal_members, brokerId || "");
  const takeHome = calcTakeHome(
    deal.price,
    deal.commission_rate,
    memberSplit,
    deal.additional_splits || []
  );
  // All timeline dates for this deal
  const allDates = getCriticalDates(deal);
  const isActive = deal.status !== "closed" && deal.status !== "cancelled";

  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`w-full text-left bg-white border border-border-light rounded-card overflow-hidden
                 hover:border-border-medium transition-colors duration-200
                 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {/* Inner wrapper with green accent bar on the left */}
      <div className="border-l-[3px] border-green p-4">
        {/* Top row — deal name */}
        <div className="mb-3">
          <h3 className="font-dm font-semibold text-[15px] text-charcoal truncate">{deal.deal_name}</h3>
        </div>

        {/* Middle — price + take-home */}
        <div className="flex items-baseline gap-4 mb-3">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted-gray block">Price</span>
            <span className="text-sm font-medium text-charcoal">{formatCurrency(deal.price)}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted-gray block">Take-Home</span>
            <span className="text-sm font-bold text-green">{formatCurrency(takeHome)}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted-gray block">Type</span>
            <span className="text-sm font-medium text-charcoal capitalize">{deal.deal_type}</span>
          </div>
        </div>

        {/* Bottom — all timeline dates with countdowns, or placeholder if none */}
        {isActive && (
          <div className="pt-3 border-t border-border-light">
            {allDates.length > 0 ? (
              <div className="space-y-1.5">
                {allDates.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                      ${d.urgency === "red" ? "bg-red-500" :
                        d.urgency === "yellow" ? "bg-amber-500" :
                        d.urgency === "gray" ? "bg-border-medium" :
                        "bg-green"}`}
                    />
                    <span className="text-xs text-medium-gray truncate">{d.label}</span>
                    <span className={`text-xs font-medium ml-auto flex-shrink-0
                      ${d.urgency === "red" ? "text-red-600" :
                        d.urgency === "yellow" ? "text-amber-600" :
                        d.urgency === "gray" ? "text-muted-gray" :
                        "text-green"}`}
                    >
                      {countdownText(d.daysAway)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-gray italic">No dates yet — enter when deal progresses</p>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
