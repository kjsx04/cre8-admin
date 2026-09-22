"use client";

import { PriorityLevel } from "@/lib/email/types";
import { Badge } from "@/components/ui";

interface PriorityBadgeProps {
  priority: PriorityLevel;
}

/**
 * PriorityBadge — small tag for a campaign's priority level.
 *   1 Just Listed · 2 Just Sold · 3 Featured · 4 New · 5 Standard (no badge)
 */
export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (priority === 1) return <Badge tone="info" size="sm" title="Just Listed">JL</Badge>;
  if (priority === 2) return <Badge tone="danger" size="sm" title="Just Sold">JS</Badge>;
  if (priority === 3) return <Badge tone="warning" size="sm" title="Featured">★</Badge>;
  if (priority === 4) return <Badge tone="success" size="sm" title="New listing">New</Badge>;
  return null;
}
