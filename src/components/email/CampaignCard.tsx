"use client";

import { Campaign } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate, calculatePriority } from "@/lib/email/utils";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/email/constants";
import PriorityBadge from "./PriorityBadge";

interface CampaignCardProps {
  campaign: Campaign;
  onClick: (campaign: Campaign) => void;
}

/** Single campaign row — color-coded type, status badge, next send date, priority, listing name */
export default function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  const color = getTypeColor(campaign.email_label);
  const priority = calculatePriority(campaign.email_label);
  const displayDate = campaign.campaign_type === "recurring"
    ? campaign.next_send_date
    : campaign.scheduled_date;

  return (
    <button
      onClick={() => onClick(campaign)}
      className="w-full text-left bg-white border border-border-light rounded-card p-4 hover:border-border-medium transition-colors duration-150"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: type indicator + content */}
        <div className="flex items-start gap-3 min-w-0">
          {/* Color bar — dashed for recurring, solid for one-time */}
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
              <span
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color }}
              >
                {campaign.email_label}
              </span>
              <PriorityBadge priority={priority} />
              {campaign.campaign_type === "recurring" && (
                <span className="text-[10px] text-muted-gray bg-light-gray px-1.5 py-0.5 rounded font-medium">
                  {campaign.frequency}
                </span>
              )}
            </div>

            {/* Listing name */}
            <p className="text-sm font-medium text-charcoal truncate">
              {campaign.listing_name}
            </p>

            {/* Scheduled date */}
            <p className="text-xs text-muted-gray mt-1">
              {displayDate ? formatScheduleDate(displayDate) : "Not scheduled"}
            </p>
          </div>
        </div>

        {/* Right: status badge */}
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded shrink-0"
          style={{
            color: STATUS_COLORS[campaign.status] || "#999",
            backgroundColor: `${STATUS_COLORS[campaign.status] || "#999"}15`,
          }}
        >
          {STATUS_LABELS[campaign.status] || campaign.status}
        </span>
      </div>
    </button>
  );
}
