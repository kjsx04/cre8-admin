"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Deal } from "@/lib/flow/types";
import { formatCurrency, calcTakeHome, getMemberSplit, getNextCriticalDate } from "@/lib/flow/utils";
import { DealCardExtras } from "./DealCard";
import type { BoardColumn } from "./DealBoard";

/*
 * PhoneDealStages — the Flow board for phones (under 640px).
 *
 * Instead of side-scrolling kanban columns, every stage is listed top to
 * bottom at full width (Pre-Escrow, Escrow, Closing for sales; the five
 * lease stages for leases). Each deal shows only its name, price and
 * take-home. Tap a deal to show the rest (dates, payment checklist and an
 * "Open deal" button); tap it again to hide them.
 *
 * Tablets and computers never render this; they keep the board.
 */
interface PhoneDealStagesProps<K extends string> {
  deals: Deal[];                      // active deals of the selected type (Sale or Lease)
  brokerId: string;
  columns: BoardColumn<K>[];          // stage order
  getColumn: (deal: Deal) => K;       // which stage a deal is in
  onOpenDeal: (deal: Deal) => void;   // opens the full deal panel
}

export default function PhoneDealStages<K extends string>({
  deals,
  brokerId,
  columns,
  getColumn,
  onOpenDeal,
}: PhoneDealStagesProps<K>) {
  // Which deal cards are tapped open (several can be open at once)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Group deals by stage, most urgent date first (same order as the board)
  const grouped: Record<string, Deal[]> = {};
  for (const col of columns) grouped[col.key] = [];
  for (const deal of deals) (grouped[getColumn(deal)] ||= []).push(deal);
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => {
      const na = getNextCriticalDate(a);
      const nb = getNextCriticalDate(b);
      if (!na && !nb) return 0;
      if (!na) return 1;
      if (!nb) return -1;
      return na.daysAway - nb.daysAway;
    });
  }

  return (
    <div className="space-y-5">
      {columns.map((col) => {
        const colDeals = grouped[col.key] || [];
        return (
          <section key={col.key}>
            {/* Stage heading + count */}
            <div className="flex items-center justify-between mb-2 px-0.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-charcoal">{col.label}</h3>
              <span className="text-xs font-medium text-muted-gray bg-white border border-border-light rounded-btn px-2 py-0.5">
                {colDeals.length}
              </span>
            </div>

            {colDeals.length === 0 ? (
              <p className="text-xs text-muted-gray px-0.5">No deals</p>
            ) : (
              <div className="space-y-2">
                {colDeals.map((deal) => (
                  <PhoneDealCard
                    key={deal.id}
                    deal={deal}
                    brokerId={brokerId}
                    open={openIds.has(deal.id)}
                    onToggle={() => toggle(deal.id)}
                    onOpenDeal={() => onOpenDeal(deal)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* One deal: name, price, take-home. Tap to expand / collapse the details. */
function PhoneDealCard({
  deal,
  brokerId,
  open,
  onToggle,
  onOpenDeal,
}: {
  deal: Deal;
  brokerId: string;
  open: boolean;
  onToggle: () => void;
  onOpenDeal: () => void;
}) {
  const takeHome = calcTakeHome(
    deal.price,
    deal.commission_rate,
    getMemberSplit(deal.deal_members, brokerId),
    deal.additional_splits || []
  );

  return (
    <div className="bg-white border border-border-light rounded-card overflow-hidden">
      <div className="border-l-[3px] border-green">
        {/* Summary row — the whole row is the tap target */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full text-left px-4 py-3 active:bg-light-gray transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-[15px] text-charcoal truncate">{deal.deal_name}</h4>
            <ChevronDown
              size={18}
              strokeWidth={1.75}
              className={`shrink-0 text-muted-gray transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </div>
          <div className="flex items-baseline gap-5 mt-1.5">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted-gray block">Price</span>
              <span className="text-sm font-medium text-charcoal">{formatCurrency(deal.price)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted-gray block">Take-Home</span>
              <span className="text-sm font-bold text-green">{formatCurrency(takeHome)}</span>
            </div>
          </div>
        </button>

        {/* Details — only while tapped open */}
        {open && (
          <div className="px-4 pb-3 animate-fade-in">
            <DealCardExtras deal={deal} brokerId={brokerId} />
            <button
              type="button"
              onClick={onOpenDeal}
              className="mt-3 w-full h-10 rounded-btn border border-border-light text-sm font-medium text-charcoal active:bg-light-gray"
            >
              Open deal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
