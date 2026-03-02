"use client";

import { PriorityLevel } from "@/lib/email/types";

interface PriorityBadgeProps {
  priority: PriorityLevel;
}

/** Small badge showing campaign priority — star for featured, "NEW" for new listings */
export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (priority === 1) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700">
        JL
      </span>
    );
  }
  if (priority === 2) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700">
        JS
      </span>
    );
  }
  if (priority === 3) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-100 text-yellow-700">
        &#9733;
      </span>
    );
  }
  if (priority === 4) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700">
        NEW
      </span>
    );
  }
  // Priority 5 (Standard) — no badge
  return null;
}
