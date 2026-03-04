"use client";

import { useState } from "react";
import { Deal, DealFormData, DealDate, Broker } from "@/lib/flow/types";
import { formatCurrency, formatDate, STATUS_LABELS, STATUS_COLORS } from "@/lib/flow/utils";
import TimelineBar from "./TimelineBar";
import CommissionCalc from "./CommissionCalc";
import DealForm from "./DealForm";
import ConfirmModal from "./ConfirmModal";

interface DealDetailProps {
  deal: Deal;
  brokerId?: string;
  allBrokers?: Pick<Broker, "id" | "name" | "email">[];
  onUpdate: (id: string, data: Partial<Deal> | DealFormData, dealDates?: DealDate[]) => Promise<void>;
  onClose: () => void;
}

export default function DealDetail({ deal, brokerId, allBrokers, onUpdate, onClose }: DealDetailProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [notes, setNotes] = useState(deal.notes || "");
  const [notesSaving, setNotesSaving] = useState(false);

  // Save edited deal (with deal_dates)
  const handleSave = async (data: DealFormData, dealDates?: DealDate[]) => {
    setSaving(true);
    await onUpdate(deal.id, data, dealDates);
    setSaving(false);
    setEditing(false);
  };

  // Close deal
  const handleCloseDeal = async (closeDate?: string) => {
    await onUpdate(deal.id, {
      status: "closed",
      actual_close_date: closeDate || new Date().toISOString().substring(0, 10),
    } as Partial<Deal>);
    setShowCloseModal(false);
  };

  // Cancel deal
  const handleCancelDeal = async (reason?: string) => {
    await onUpdate(deal.id, {
      status: "cancelled",
      cancel_reason: reason || null,
    } as Partial<Deal>);
    setShowCancelModal(false);
  };

  // Auto-save notes on blur
  const handleNotesBlur = async () => {
    if (notes !== (deal.notes || "")) {
      setNotesSaving(true);
      await onUpdate(deal.id, { notes } as Partial<Deal>);
      setNotesSaving(false);
    }
  };

  const isActive = deal.status !== "closed" && deal.status !== "cancelled";

  return (
    <>
      {/* Slide-over panel */}
      <div className="fixed inset-0 z-40 flex justify-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/20" onClick={onClose} />

        {/* Panel */}
        <div className="relative bg-light-gray w-full max-w-lg overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-[#E0E0E0] px-6 py-5 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bebas text-2xl tracking-wide text-[#1A1A1A] truncate">
                  {deal.deal_name}
                </h2>
                {deal.property_address && (
                  <p className="text-sm text-[rgba(0,0,0,0.45)] truncate">{deal.property_address}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${STATUS_COLORS[deal.status]}`}>
                  {STATUS_LABELS[deal.status]}
                </span>
                <button
                  onClick={onClose}
                  className="text-muted-gray hover:text-charcoal transition-colors p-1"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            {isActive && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-xs font-medium border border-[#E0E0E0] text-[#1A1A1A] rounded-btn
                             hover:border-[#999] transition-colors duration-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="px-3 py-1.5 text-xs font-medium bg-green text-black uppercase tracking-wide rounded-btn
                             hover:bg-green/90 transition-colors duration-200"
                >
                  Close Deal
                </button>
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="px-3 py-1.5 text-xs font-medium border border-red-400/50 text-red-400 rounded-btn
                             hover:bg-red-400/10 transition-colors duration-200"
                >
                  Cancel Deal
                </button>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-4">
            {/* Commission breakdown */}
            <CommissionCalc deal={deal} />

            {/* Timeline */}
            <TimelineBar deal={deal} />

            {/* Deal info */}
            <div className="bg-white border border-border-light rounded-card p-4">
              <h3 className="font-dm font-semibold text-sm text-charcoal mb-3">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-medium-gray">Type</span>
                  <span className="font-medium capitalize">{deal.deal_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-medium-gray">Effective Date</span>
                  <span className="font-medium">{formatDate(deal.effective_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-medium-gray">Escrow Open</span>
                  <span className="font-medium">{formatDate(deal.escrow_open_date)}</span>
                </div>

                {/* Dynamic dates from deal_dates */}
                {deal.deal_dates && deal.deal_dates.length > 0 ? (
                  deal.deal_dates
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((dd) => (
                      <div key={dd.id} className="flex justify-between">
                        <span className="text-medium-gray">{dd.label}</span>
                        <span className="font-medium">
                          {formatDate(dd.date)}
                          {dd.offset_days && (
                            <span className="text-xs text-muted-gray ml-1">
                              ({dd.offset_days}d)
                            </span>
                          )}
                        </span>
                      </div>
                    ))
                ) : (
                  /* Legacy fallback — show old fixed fields */
                  <>
                    {deal.feasibility_days && (
                      <div className="flex justify-between">
                        <span className="text-medium-gray">Feasibility Period</span>
                        <span className="font-medium">{deal.feasibility_days} days</span>
                      </div>
                    )}
                    {deal.inside_close_days && (
                      <div className="flex justify-between">
                        <span className="text-medium-gray">Inside Close Period</span>
                        <span className="font-medium">{deal.inside_close_days} days</span>
                      </div>
                    )}
                    {deal.outside_close_days && (
                      <div className="flex justify-between">
                        <span className="text-medium-gray">Outside Close Period</span>
                        <span className="font-medium">{deal.outside_close_days} days</span>
                      </div>
                    )}
                  </>
                )}

                {deal.actual_close_date && (
                  <div className="flex justify-between">
                    <span className="text-medium-gray">Actual Close Date</span>
                    <span className="font-medium">{formatDate(deal.actual_close_date)}</span>
                  </div>
                )}
                {deal.cancel_reason && (
                  <div className="flex justify-between">
                    <span className="text-medium-gray">Cancel Reason</span>
                    <span className="font-medium">{deal.cancel_reason}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-medium-gray">Price</span>
                  <span className="font-medium">{formatCurrency(deal.price)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white border border-border-light rounded-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-dm font-semibold text-sm text-charcoal">Notes</h3>
                {notesSaving && <span className="text-xs text-muted-gray">Saving...</span>}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                rows={4}
                className="w-full border border-border-light rounded-btn px-3 py-2 text-sm resize-none"
                placeholder="Add notes about this deal..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Edit form modal */}
      {editing && (
        <DealForm
          deal={deal}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
          mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          brokerId={brokerId}
          allBrokers={allBrokers}
        />
      )}

      {/* Close deal confirmation */}
      {showCloseModal && (
        <ConfirmModal
          title="Close Deal"
          message={`Mark "${deal.deal_name}" as closed?`}
          confirmLabel="Close Deal"
          confirmColor="green"
          showDateInput
          onConfirm={handleCloseDeal}
          onCancel={() => setShowCloseModal(false)}
        />
      )}

      {/* Cancel deal confirmation */}
      {showCancelModal && (
        <ConfirmModal
          title="Cancel Deal"
          message={`Cancel "${deal.deal_name}"? This can be undone by editing the deal status.`}
          confirmLabel="Cancel Deal"
          confirmColor="red"
          showTextInput
          textInputLabel="Reason for cancellation"
          onConfirm={handleCancelDeal}
          onCancel={() => setShowCancelModal(false)}
        />
      )}
    </>
  );
}
