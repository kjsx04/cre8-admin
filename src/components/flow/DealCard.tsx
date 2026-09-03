"use client";

import { Deal } from "@/lib/flow/types";
import {
  formatCurrency,
  formatDate,
  calcTakeHome,
  getMemberSplit,
  getCriticalDates,
  countdownText,
  daysBetween,
  getLeaseStage,
  isLeasePaymentPhase,
  leasePaymentLabel,
} from "@/lib/flow/utils";

// Small check/circle/dash indicator for the lease payment checklist
function ChecklistDot({ state }: { state: "done" | "pending" | "na" }) {
  if (state === "done") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="3" className="flex-shrink-0">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (state === "na") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" className="flex-shrink-0">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#BBB" strokeWidth="2" className="flex-shrink-0">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

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

  // Invoiced lease deals get a stripped-down card: just the payment due dates + amounts
  const isInvoiced =
    deal.deal_type === "lease" &&
    getLeaseStage(deal) === "invoiced" &&
    (deal.lease_payments || []).length > 0;

  // Lease payment checklist — shows once the lease is signed (payment phase)
  const showPaymentChecklist =
    !isInvoiced &&
    deal.deal_type === "lease" &&
    isLeasePaymentPhase(deal) &&
    (deal.lease_payments || []).length > 0;
  const sortedPayments =
    showPaymentChecklist || isInvoiced
      ? [...(deal.lease_payments || [])].sort((a, b) => a.sort_order - b.sort_order)
      : [];

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

        {/* Invoiced lease card — just the payment due dates with amounts */}
        {isInvoiced && (
          <div className="space-y-2">
            {sortedPayments.map((lp, i) => {
              const amount = takeHome * (lp.percent / 100);
              // Countdown + urgency for unpaid payments with a resolved date
              let daysAway: number | null = null;
              if (!lp.received && lp.payment_date) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                daysAway = daysBetween(today, new Date(lp.payment_date + "T00:00:00"));
              }
              const urgencyColor =
                lp.received ? "text-green" :
                daysAway === null ? "text-muted-gray" :
                daysAway <= 3 ? "text-red-600" :
                daysAway <= 30 ? "text-amber-600" : "text-green";
              return (
                <div key={lp.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChecklistDot state={lp.received ? "done" : "pending"} />
                    <span className="text-xs text-medium-gray whitespace-nowrap">
                      {leasePaymentLabel(i, sortedPayments.length)}
                    </span>
                    <span className="text-xs font-bold text-charcoal">{formatCurrency(amount)}</span>
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ${urgencyColor}`}>
                    {lp.received
                      ? "Paid"
                      : lp.payment_date
                      ? `${formatDate(lp.payment_date)} · ${countdownText(daysAway!)}`
                      : "Date TBD"}
                  </span>
                </div>
              );
            })}
            {/* W9 line only when it still needs action */}
            {deal.w9_status === "pending" && (
              <div className="flex items-center gap-2">
                <ChecklistDot state="pending" />
                <span className="text-xs text-medium-gray">W9 / Invoice from Outside Broker</span>
              </div>
            )}
          </div>
        )}

        {/* Middle — price + take-home */}
        {!isInvoiced && (
        <div className="flex items-baseline gap-4 mb-3">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted-gray block">Price</span>
            <span className="text-sm font-medium text-charcoal">{formatCurrency(deal.price)}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted-gray block">Take-Home</span>
            <span className="text-sm font-bold text-green">{formatCurrency(takeHome)}</span>
          </div>
        </div>
        )}

        {/* Bottom — all timeline dates with countdowns, or placeholder if none */}
        {!isInvoiced && isActive && (
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

        {/* Lease commission checklist — payment received + W9 status once the lease is signed */}
        {isActive && showPaymentChecklist && (
          <div className="pt-3 mt-3 border-t border-border-light space-y-1.5">
            {sortedPayments.map((lp, i) => (
              <div key={lp.id}>
                <div className="flex items-center gap-2">
                  <ChecklistDot state={lp.received ? "done" : "pending"} />
                  <span className={`text-xs ${lp.received ? "text-charcoal" : "text-medium-gray"}`}>
                    {leasePaymentLabel(i, sortedPayments.length)} Paid
                  </span>
                </div>
                {/* W9 row sits between the 1st and 2nd payments, matching the flow order */}
                {i === 0 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <ChecklistDot state={deal.w9_status === "received" ? "done" : deal.w9_status === "na" ? "na" : "pending"} />
                    <span className={`text-xs ${deal.w9_status === "received" ? "text-charcoal" : "text-medium-gray"}`}>
                      W9 / Invoice from Outside Broker{deal.w9_status === "na" ? " (N/A)" : ""}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
