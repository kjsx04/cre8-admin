"use client";

import { useEffect, useRef, useState } from "react";
import { CHECKLIST_ITEMS } from "@/lib/checklist/constants";
import { countChecked, type ChecklistItems } from "@/lib/checklist/types";
import ChecklistItemRow from "@/components/checklist/ChecklistItemRow";
import FileUploadZone from "@/components/FileUploadZone";

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
    <div className="mb-6 border border-green rounded-card bg-white">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA] rounded-t-card flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="bg-green text-black text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
            New
          </span>
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider">
            New Listing Checklist
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Complete Listing — manual move out of New (inline confirm) */}
          {!laDisabled && (
            <button
              type="button"
              onClick={handleCompleteClick}
              className={`text-xs font-semibold transition-colors cursor-pointer ${
                confirming
                  ? "text-[#CC3333] hover:text-[#B02020]"
                  : "text-[#4A8C1C] hover:text-[#3A7010]"
              }`}
            >
              {confirming
                ? `Confirm — ${total - done} unchecked`
                : "Complete Listing"}
            </button>
          )}
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded ${
              complete
                ? "bg-[#E8F5D4] text-[#4A8C1C]"
                : "bg-[#F0F0F0] text-[#666]"
            }`}
          >
            {done}/{total}
          </span>
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
        <div className="mt-3 mx-2 pt-4 border-t border-[#F0F0F0]">
          {laDisabled ? (
            <p className="text-xs text-[#999]">
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
                <p className="text-xs text-[#B8860B] mt-1.5 flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-[#E5E5E5] border-t-[#B8860B] rounded-full animate-spin inline-block" />
                  Uploading to SharePoint...
                </p>
              )}
              {laUploadState === "error" && (
                <p className="text-xs text-[#CC3333] mt-1.5">
                  Upload failed — click the zone to try again.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
