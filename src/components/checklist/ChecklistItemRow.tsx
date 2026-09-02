"use client";

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
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-btn text-left transition-colors
        ${interactive ? "hover:bg-[#F5F5F5] cursor-pointer" : "cursor-default"}`}
    >
      {/* Checkbox */}
      <span
        className={`w-[18px] h-[18px] rounded-sm border-[1.5px] flex items-center justify-center flex-shrink-0 text-[11px]
          ${checked ? "bg-green border-green text-black" : "border-[#CCC] bg-white"}`}
      >
        {checked && "✓"}
      </span>

      {/* Label */}
      <span
        className={`text-[13px] flex-1 min-w-0 ${
          checked ? "text-[#999] line-through" : "text-[#333]"
        }`}
      >
        {item.label}
      </span>

      {/* Auto tag + hint */}
      {item.auto && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wide text-[#999] bg-[#F0F0F0]
                     px-1.5 py-0.5 rounded flex-shrink-0"
          title={item.autoHint}
        >
          auto
        </span>
      )}
    </button>
  );
}
