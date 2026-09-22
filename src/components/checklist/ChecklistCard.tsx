"use client";

import { useEffect, useRef, useState } from "react";
import { CHECKLIST_ITEMS } from "@/lib/checklist/constants";
import { countChecked, type ChecklistItems } from "@/lib/checklist/types";
import ChecklistItemRow from "@/components/checklist/ChecklistItemRow";
import FileUploadZone from "@/components/FileUploadZone";
import { Badge, Button, Card, Spinner } from "@/components/ui";

/* ============================================================
   New Listing Checklist card — rendered at the top of the
   listing form when the listing is tagged New.

   Shows all 8 items (manual toggles + auto read-only rows) and
   the upload slot for the executed listing agreement.
   ============================================================ */
interface ChecklistCardProps {
  items: ChecklistItems;
  /** Toggle a manual item */
  onToggleItem: (key: string, value: boolean) => void;
  /** Existing SharePoint URL of the executed listing agreement */
  listingAgreementUrl: string | null;
  /** Locally selected LA file (before/while uploading) */
  laFile: File | null;
  /** Called when the user selects a listing agreement PDF */
  onLaFileSelect: (file: File) => void;
  /** LA upload state */
  laUploadState: "idle" | "uploading" | "error";
  /** True when the listing hasn't been saved yet (no CMS id) */
  laDisabled: boolean;
  /** Manually complete: move the listing out of New without finishing the checklist */
  onComplete: () => void;
}

export default function ChecklistCard({
  items,
  onToggleItem,
  listingAgreementUrl,
  laFile,
  onLaFileSelect,
  laUploadState,
  laDisabled,
  onComplete,
}: ChecklistCardProps) {
  const done = countChecked(items);
  const total = CHECKLIST_ITEMS.length;
  const complete = done === total;

  // Inline confirm for the Complete Listing button — resets after 4s
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const handleCompleteClick = () => {
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirming(false);
      onComplete();
      return;
    }
    setConfirming(true);
    confirmTimer.current = setTimeout(() => setConfirming(false), 4000);
  };

  return (
    // Card primitive — green border marks this listing as "New" (status)
    <Card padding="none" className="mb-6 border-accent">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border bg-surface-2 rounded-t-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Badge tone="accent">New</Badge>
          <h2 className="text-sm font-semibold text-text">New listing checklist</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Complete Listing — manual move out of New (inline confirm) */}
          {!laDisabled && (
            <Button
              variant={confirming ? "danger" : "secondary"}
              size="sm"
              onClick={handleCompleteClick}
            >
              {confirming
                ? `Confirm — ${total - done} unchecked`
                : "Complete listing"}
            </Button>
          )}
          {/* Progress count — green once every item is checked */}
          <Badge tone={complete ? "success" : "neutral"}>
            {done}/{total}
          </Badge>
        </div>
      </div>

      <div className="px-3 py-3">
        {/* Checklist rows */}
        {CHECKLIST_ITEMS.map((item) => (
          <ChecklistItemRow
            key={item.key}
            item={item}
            checked={items[item.key] === true}
            onToggle={
              item.auto
                ? undefined
                : () => onToggleItem(item.key, !items[item.key])
            }
          />
        ))}

        {/* Listing agreement upload slot */}
        <div className="mt-3 mx-2 pt-4 border-t border-border">
          {laDisabled ? (
            <p className="text-xs text-text-3">
              Save the listing first to upload the executed listing agreement.
            </p>
          ) : (
            <>
              <FileUploadZone
                label="Executed Listing Agreement"
                file={laFile}
                onFileSelect={onLaFileSelect}
                existingUrl={listingAgreementUrl || undefined}
              />
              {laUploadState === "uploading" && (
                <p className="text-xs text-text-2 mt-1.5 flex items-center gap-1.5">
                  <Spinner size="sm" className="w-3 h-3" />
                  Uploading to SharePoint...
                </p>
              )}
              {laUploadState === "error" && (
                <p className="text-xs text-danger-fg mt-1.5">
                  Upload failed — click the zone to try again.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
