"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { CHECKLIST_ITEMS } from "@/lib/checklist/constants";
import { countChecked, type ListingChecklist } from "@/lib/checklist/types";
import ChecklistItemRow from "@/components/checklist/ChecklistItemRow";
import type { ListingItem } from "@/lib/admin-constants";
import { Badge, Button, Card, cn } from "@/components/ui";

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
    <div className="mb-6">
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-3">
        {/* Green badge marks these as "new" (status) */}
        <Badge tone="accent">New listings</Badge>
        <span className="text-xs text-text-3">
          {visible.length} in progress
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((cl) => {
          const item = listingsById.get(cl.listing_id);
          const fd = item?.fieldData || {};
          const done = countChecked(cl.items);
          const expanded = expandedIds.has(cl.listing_id);
          const name = fd.name || cl.listing_name || "Untitled listing";

          return (
            // Card primitive — no padding so the header row sits flush
            <Card key={cl.listing_id} padding="none" className="overflow-hidden">
              {/* Card header — click to expand/collapse; click name to open */}
              <div
                onClick={() => toggleExpanded(cl.listing_id)}
                className="w-full px-4 py-3 text-left hover:bg-surface-2/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/listings/${cl.listing_id}/edit`);
                    }}
                    className="font-semibold text-text text-sm truncate text-left hover:text-accent-strong cursor-pointer"
                    title="Open listing"
                  >
                    {name}
                  </button>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-text-2 tabular-nums">
                      {done}/{total}
                    </span>
                    <ChevronDown
                      size={16}
                      strokeWidth={1.75}
                      className={cn("text-text-3 transition-transform", expanded && "rotate-180")}
                    />
                  </span>
                </div>

                {/* Progress bar — green fill = progress (status) */}
                <div className="mt-2 h-1.5 bg-surface-2 rounded-pill overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-pill transition-all duration-300"
                    style={{ width: `${(done / total) * 100}%` }}
                  />
                </div>
              </div>

              {/* Expanded checklist */}
              {expanded && (
                <div className="px-2 pb-2.5 border-t border-border">
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
                  <div className="flex justify-end mt-1.5 pt-2 mx-2 border-t border-border">
                    {confirmingId === cl.listing_id ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setConfirmingId(null);
                          onComplete(cl.listing_id);
                        }}
                      >
                        Confirm — {total - done} unchecked
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingId(cl.listing_id)}
                      >
                        Complete listing
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
