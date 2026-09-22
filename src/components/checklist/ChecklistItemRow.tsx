"use client";

import { Check } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import type { ChecklistItemDef } from "@/lib/checklist/constants";

/* ============================================================
   Single checklist row — shared by the ListingForm checklist
   card and the dashboard New Listings section.

   Manual items are clickable checkboxes; auto items are
   read-only with an "auto" tag + hint.
   ============================================================ */
interface ChecklistItemRowProps {
  item: ChecklistItemDef;
  checked: boolean;
  /** Called for manual items when clicked (ignored for auto items) */
  onToggle?: () => void;
  /** Disable interaction (e.g. while a patch is in flight) */
  disabled?: boolean;
}

export default function ChecklistItemRow({
  item,
  checked,
  onToggle,
  disabled,
}: ChecklistItemRowProps) {
  const interactive = !item.auto && !!onToggle && !disabled;

  return (
    <button
      type="button"
      onClick={interactive ? onToggle : undefined}
      disabled={!interactive}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-control text-left transition-colors",
        interactive ? "hover:bg-surface-2 cursor-pointer" : "cursor-default"
      )}
    >
      {/* Checkbox — green fill = done (green is status) */}
      <span
        className={cn(
          "w-[18px] h-[18px] rounded-sm border flex items-center justify-center shrink-0",
          checked ? "bg-accent border-accent text-black" : "border-border-strong bg-surface"
        )}
      >
        {checked && <Check size={12} strokeWidth={2.5} />}
      </span>

      {/* Label */}
      <span
        className={cn("text-sm flex-1 min-w-0", checked ? "text-text-3 line-through" : "text-text")}
      >
        {item.label}
      </span>

      {/* Auto tag + hint */}
      {item.auto && (
        <Badge tone="neutral" size="sm" title={item.autoHint}>
          Auto
        </Badge>
      )}
    </button>
  );
}
