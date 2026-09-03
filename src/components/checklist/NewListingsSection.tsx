"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHECKLIST_ITEMS } from "@/lib/checklist/constants";
import { countChecked, type ListingChecklist } from "@/lib/checklist/types";
import ChecklistItemRow from "@/components/checklist/ChecklistItemRow";
import type { ListingItem } from "@/lib/admin-constants";

/* ============================================================
   New Listings section — pinned above the main dashboard table.

   One card per listing tagged New, with a progress bar and an
   expandable checklist. Manual items are checkable inline;
   when all 8 items are checked the card disappears and the
   listing returns to the main table.
   ============================================================ */
interface NewListingsSectionProps {
  checklists: ListingChecklist[];
  /** CMS listings keyed by Webflow id — for city/price display */
  listingsById: Map<string, ListingItem>;
  /** Toggle a manual item on one listing's checklist */
  onToggleItem: (listingId: string, key: string, value: boolean) => void;
  /** Manually complete: move the listing out of New without finishing the checklist */
  onComplete: (listingId: string) => void;
}

export default function NewListingsSection({
  checklists,
  listingsById,
  onToggleItem,
  onComplete,
}: NewListingsSectionProps) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Inline confirm state for the Complete Listing button (one card at a time)
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Only show checklists whose CMS listing still exists
  const visible = checklists.filter((c) => listingsById.has(c.listing_id));
  if (visible.length === 0) return null;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Collapsing/expanding resets any pending confirm
    setConfirmingId(null);
  };

  const total = CHECKLIST_ITEMS.length;

  return (
    <div className="mb-5">
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-2.5">
        {/* Green badge is now the section title itself */}
        <span className="bg-green text-black text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
          New Listings
        </span>
        <span className="text-xs text-[#777]">
          {visible.length} in progress
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map((cl) => {
          const item = listingsById.get(cl.listing_id);
          const fd = item?.fieldData || {};
          const done = countChecked(cl.items);
          const expanded = expandedIds.has(cl.listing_id);
          const name = fd.name || cl.listing_name || "Untitled listing";

          return (
            <div
              key={cl.listing_id}
              className="border border-[#E5E5E5] rounded-card bg-white overflow-hidden"
            >
              {/* Card header — click to expand/collapse; click name to open */}
              <div
                onClick={() => toggleExpanded(cl.listing_id)}
                className="w-full px-4 py-3 text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/listings/${cl.listing_id}/edit`);
                    }}
                    className="font-semibold text-[#1a1a1a] text-sm truncate text-left hover:text-[#4A8C1C] cursor-pointer"
                    title="Open listing"
                  >
                    {name}
                  </button>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-[#666]">
                      {done}/{total}
                    </span>
                    <span
                      className={`text-[#999] text-[10px] transition-transform ${expanded ? "rotate-180" : ""}`}
                    >
                      ▼
                    </span>
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green rounded-full transition-all duration-300"
                    style={{ width: `${(done / total) * 100}%` }}
                  />
                </div>
              </div>

              {/* Expanded checklist */}
              {expanded && (
                <div className="px-2 pb-2.5 border-t border-[#F0F0F0]">
                  {CHECKLIST_ITEMS.map((def) => (
                    <ChecklistItemRow
                      key={def.key}
                      item={def}
                      checked={cl.items[def.key] === true}
                      onToggle={
                        def.auto
                          ? undefined
                          : () =>
                              onToggleItem(
                                cl.listing_id,
                                def.key,
                                !cl.items[def.key]
                              )
                      }
                    />
                  ))}

                  {/* Complete Listing — manual move out of New (inline confirm) */}
                  <div className="flex justify-end mt-1.5 pt-2 mx-2 border-t border-[#F0F0F0]">
                    {confirmingId === cl.listing_id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(null);
                          onComplete(cl.listing_id);
                        }}
                        className="text-xs font-semibold text-[#CC3333] hover:text-[#B02020] transition-colors cursor-pointer"
                      >
                        Confirm — {total - done} unchecked
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(cl.listing_id)}
                        className="text-xs font-semibold text-[#4A8C1C] hover:text-[#3A7010] transition-colors cursor-pointer"
                      >
                        Complete Listing
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
