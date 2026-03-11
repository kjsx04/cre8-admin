"use client";

import { useState } from "react";
import { DealDiffItem, StageSuggestion, DealStatus } from "@/lib/flow/types";

interface DealUpdateReviewProps {
  /** The diff items to review */
  diffItems: DealDiffItem[];
  /** Optional stage move suggestion */
  stageSuggestion: StageSuggestion | null;
  /** Document file name */
  fileName: string;
  /** Document type detected by AI */
  documentType: string;
  /** Whether approval is in progress */
  approving: boolean;
  /** Called when user approves selected changes */
  onApprove: (items: DealDiffItem[], newStatus?: DealStatus) => void;
  /** Called when user cancels the review */
  onCancel: () => void;
}

export default function DealUpdateReview({
  diffItems: initialItems,
  stageSuggestion,
  fileName,
  documentType,
  approving,
  onApprove,
  onCancel,
}: DealUpdateReviewProps) {
  // Local state for the diff items — user can toggle accepted + edit values
  const [items, setItems] = useState<DealDiffItem[]>(initialItems);
  // Whether the user accepted the stage move suggestion
  const [acceptStageMove, setAcceptStageMove] = useState(true);

  // Toggle a single item's accepted state
  const toggleItem = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, accepted: !item.accepted } : item
      )
    );
  };

  // Toggle all items on/off
  const toggleAll = (accepted: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, accepted })));
  };

  // Enter edit mode for an item's proposed value
  const startEdit = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, edited: true, editedValue: item.editedValue ?? String(item.rawProposed ?? "") } : item
      )
    );
  };

  // Update the edited value
  const updateEdit = (index: number, value: string) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, editedValue: value } : item
      )
    );
  };

  // How many items are accepted
  const acceptedCount = items.filter((i) => i.accepted).length;

  // Doc type badge label
  const docLabel =
    documentType === "psa" ? "PSA" : documentType === "loi" ? "LOI" : "Document";
  const docBadgeColor =
    documentType === "psa"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : documentType === "loi"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white border border-border-light rounded-card p-4">
        <div className="flex items-center gap-3 mb-1">
          {/* Document icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="2" className="flex-shrink-0">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-charcoal truncate">{fileName}</p>
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${docBadgeColor}`}>
            {docLabel}
          </span>
        </div>
        <p className="text-xs text-medium-gray ml-8">
          {items.length} change{items.length !== 1 ? "s" : ""} detected — review below
        </p>
      </div>

      {/* Select/deselect all */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium text-charcoal">
          {acceptedCount} of {items.length} selected
        </p>
        <button
          type="button"
          onClick={() => toggleAll(acceptedCount < items.length)}
          className="text-xs text-green hover:underline"
        >
          {acceptedCount < items.length ? "Select All" : "Deselect All"}
        </button>
      </div>

      {/* Diff items list */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.field}
            className={`bg-white border rounded-card p-3 transition-all duration-200 ${
              item.accepted
                ? "border-green/30 bg-green/[0.02]"
                : "border-border-light opacity-60"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => toggleItem(index)}
                className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  item.accepted
                    ? "bg-green border-green"
                    : "border-[#ccc] hover:border-[#999]"
                }`}
              >
                {item.accepted && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>

              {/* Field content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-charcoal mb-1.5">{item.label}</p>

                <div className="flex items-center gap-2 text-sm">
                  {/* Current value */}
                  <span className={`text-medium-gray ${item.accepted ? "line-through" : ""}`}>
                    {item.currentValue}
                  </span>

                  {/* Arrow */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" className="flex-shrink-0">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>

                  {/* Proposed value — click to edit */}
                  {item.edited ? (
                    <input
                      type="text"
                      value={item.editedValue ?? ""}
                      onChange={(e) => updateEdit(index, e.target.value)}
                      autoFocus
                      className="text-sm font-medium text-green bg-green/5 border border-green/30 rounded px-1.5 py-0.5
                                 focus:outline-none focus:ring-1 focus:ring-green/50 min-w-[80px]"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          // Cancel edit — revert to original
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === index ? { ...it, edited: false, editedValue: undefined } : it
                            )
                          );
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(index)}
                      className="text-sm font-medium text-green hover:underline text-left"
                      title="Click to edit"
                    >
                      {item.proposedValue}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stage move suggestion */}
      {stageSuggestion && (
        <div className="bg-blue-50 border border-blue-200 rounded-card p-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setAcceptStageMove(!acceptStageMove)}
              className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                acceptStageMove
                  ? "bg-blue-600 border-blue-600"
                  : "border-blue-300 hover:border-blue-400"
              }`}
            >
              {acceptStageMove && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <div>
              <p className="text-sm font-medium text-blue-800">{stageSuggestion.message}</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Uncheck to apply changes without moving the deal.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={approving}
          className="text-sm text-medium-gray hover:text-charcoal transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onApprove(
              items,
              acceptStageMove && stageSuggestion ? stageSuggestion.newStatus : undefined
            )
          }
          disabled={acceptedCount === 0 || approving}
          className="px-4 py-2 text-sm font-semibold bg-green text-black uppercase tracking-wide rounded-btn
                     hover:bg-green/90 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-2"
        >
          {approving && (
            <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
          )}
          {approving
            ? "Updating..."
            : `Approve ${acceptedCount} Change${acceptedCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
