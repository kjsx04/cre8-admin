"use client";

import { Deal } from "@/lib/flow/types";
import {
  formatCurrency,
  calcTakeHome,
  getNextCriticalDate,
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

export default function DealCard({ deal, onClick, draggable, onDragStart, onDragEnd }: DealCardProps) {
  // Pass additional_splits so take-home accounts for referral fees etc.
  const takeHome = calcTakeHome(
    deal.price,
    deal.commission_rate,
    deal.broker_split,
    deal.additional_splits || []
  );
  const nextDate = getNextCriticalDate(deal);

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

        {/* Bottom — next critical date countdown */}
        {nextDate && deal.status !== "closed" && deal.status !== "cancelled" && (
          <div className="flex items-center gap-2 pt-3 border-t border-border-light">
            {/* Urgency dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0
              ${nextDate.urgency === "red" ? "bg-red-500" :
                nextDate.urgency === "yellow" ? "bg-amber-500" :
                nextDate.urgency === "gray" ? "bg-border-medium" :
                "bg-green"}`}
            />
            <span className="text-xs text-medium-gray">{nextDate.label}</span>
            <span className={`text-xs font-medium ml-auto
              ${nextDate.urgency === "red" ? "text-red-600" :
                nextDate.urgency === "yellow" ? "text-amber-600" :
                nextDate.urgency === "gray" ? "text-muted-gray" :
                "text-green"}`}
            >
              {countdownText(nextDate.daysAway)}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
