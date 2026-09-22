"use client";

import { useState } from "react";
import { ArrowRight, Check, FileText } from "lucide-react";
import { DealDiffItem, StageSuggestion, DealStatus } from "@/lib/flow/types";
import { Badge, Button, Card, Tone, cn } from "@/components/ui";

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

// Small square check control used for each diff row + the stage suggestion (selected = ink)
function CheckBox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
        checked ? "bg-ink border-ink" : "border-border-strong hover:border-text-3"
      )}
    >
      {checked && <Check size={10} strokeWidth={3} className="text-white" />}
    </button>
  );
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

  // Doc type badge label + tone (PSA = info, LOI = warning, other = neutral)
  const docLabel =
    documentType === "psa" ? "PSA" : documentType === "loi" ? "LOI" : "Document";
  const docTone: Tone =
    documentType === "psa" ? "info" : documentType === "loi" ? "warning" : "neutral";

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card padding="sm">
        <div className="flex items-center gap-3 mb-1">
          {/* Document icon */}
          <FileText size={20} strokeWidth={1.75} className="flex-shrink-0 text-text-2" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text truncate">{fileName}</p>
          </div>
          <Badge tone={docTone}>{docLabel}</Badge>
        </div>
        <p className="text-xs text-text-2 ml-8">
          {items.length} change{items.length !== 1 ? "s" : ""} detected — review below
        </p>
      </Card>

      {/* Select/deselect all */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium text-text">
          {acceptedCount} of {items.length} selected
        </p>
        <Button variant="ghost" size="sm" onClick={() => toggleAll(acceptedCount < items.length)}>
          {acceptedCount < items.length ? "Select all" : "Deselect all"}
        </Button>
      </div>

      {/* Diff items list */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.field}
            className={cn(
              "bg-surface border rounded-card p-4 transition-all duration-150",
              // Accepted rows get the green (selected) tint; unselected rows fade
              item.accepted ? "border-accent/40 bg-accent-soft/40" : "border-border opacity-60"
            )}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <CheckBox checked={item.accepted} onClick={() => toggleItem(index)} />

              {/* Field content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text mb-1.5">{item.label}</p>

                <div className="flex items-center gap-2 text-sm">
                  {/* Current value */}
                  <span className={cn("text-text-2", item.accepted && "line-through")}>
                    {item.currentValue}
                  </span>

                  {/* Arrow */}
                  <ArrowRight size={14} strokeWidth={2} className="flex-shrink-0 text-text-3" />

                  {/* Proposed value — click to edit */}
                  {item.edited ? (
                    <input
                      type="text"
                      value={item.editedValue ?? ""}
                      onChange={(e) => updateEdit(index, e.target.value)}
                      autoFocus
                      className="text-sm font-medium text-accent-strong bg-accent-soft border border-accent/40 rounded-control px-1.5 py-0.5
                                 focus:outline-none focus:ring-1 focus:ring-accent/50 min-w-[80px]"
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
                      className="text-sm font-medium text-accent-strong hover:underline text-left"
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
        <div className="bg-info-bg border border-info-fg/20 rounded-card p-4">
          <div className="flex items-start gap-3">
            <CheckBox checked={acceptStageMove} onClick={() => setAcceptStageMove(!acceptStageMove)} />
            <div>
              <p className="text-sm font-medium text-info-fg">{stageSuggestion.message}</p>
              <p className="text-xs text-info-fg/80 mt-0.5">
                Uncheck to apply changes without moving the deal.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={approving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={approving}
          onClick={() =>
            onApprove(
              items,
              acceptStageMove && stageSuggestion ? stageSuggestion.newStatus : undefined
            )
          }
          disabled={acceptedCount === 0 || approving}
        >
          {approving
            ? "Updating..."
            : `Approve ${acceptedCount} change${acceptedCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
