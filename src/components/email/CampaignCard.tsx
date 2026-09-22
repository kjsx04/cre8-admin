"use client";

import { Campaign, CampaignStatus } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate, calculatePriority } from "@/lib/email/utils";
import { STATUS_LABELS } from "@/lib/email/constants";
import { Badge, Tone } from "@/components/ui";
import PriorityBadge from "./PriorityBadge";

interface CampaignCardProps {
  campaign: Campaign;
  onClick: (campaign: Campaign) => void;
}

/** Campaign status → Badge tone (shared with CampaignDetail) */
export const STATUS_TONE: Record<CampaignStatus, Tone> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  paused: "warning",
  completed: "neutral",
  cancelled: "danger",
};

/** Single campaign row — color-coded type, status badge, next send date, priority, listing name */
export default function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  const color = getTypeColor(campaign.email_label);
  const priority = calculatePriority(campaign.email_label);
  const displayDate = campaign.campaign_type === "recurring"
    ? campaign.next_send_date
    : campaign.scheduled_date;

  return (
    // Clickable card — a real button so keyboard users can open it
    <button
      type="button"
      onClick={() => onClick(campaign)}
      className="w-full text-left bg-surface border border-border rounded-card p-4 hover:border-border-strong transition-colors duration-150"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: type indicator + content */}
        <div className="flex items-start gap-3 min-w-0">
          {/* Color bar — dashed for recurring, solid for one-time (campaign-type color is data) */}
          <div
            className="w-1 h-12 rounded-full shrink-0 mt-0.5"
            style={
              campaign.campaign_type === "recurring"
                ? { backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)` }
                : { backgroundColor: color }
            }
          />
          <div className="min-w-0">
            {/* Label + priority */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold" style={{ color }}>
                {campaign.email_label || "Group"}
              </span>
              <PriorityBadge priority={priority} />
              {campaign.campaign_type === "recurring" && (
                <Badge size="sm">{campaign.frequency}</Badge>
              )}
            </div>

            {/* Listing name */}
            <p className="text-sm font-medium text-text truncate">
              {campaign.listing_name}
            </p>

            {/* Scheduled date */}
            <p className="text-xs text-text-3 mt-1">
              {displayDate ? formatScheduleDate(displayDate) : "Not scheduled"}
            </p>
          </div>
        </div>

        {/* Right: status badge */}
        <Badge tone={STATUS_TONE[campaign.status] || "neutral"} className="shrink-0">
          {STATUS_LABELS[campaign.status] || campaign.status}
        </Badge>
      </div>
    </button>
  );
}
