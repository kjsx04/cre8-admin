"use client";

import { ReactNode } from "react";
import { Campaign } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate } from "@/lib/email/utils";
import { STATUS_LABELS } from "@/lib/email/constants";
import { Badge, type Tone } from "@/components/ui";

interface CampaignCardProps {
  campaign: Campaign;
  onClick: (campaign: Campaign) => void;
  /** Buttons rendered inside the card, to the right */
  actions?: ReactNode;
}

/** Campaign status → shared badge tones, so these pills match the rest of the app */
const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  paused: "warning",
  completed: "neutral",
  cancelled: "danger",
};

/**
 * One saved campaign — type stripe, label, listing, next send, status.
 *
 * The card is a div rather than a button so its actions can live inside it:
 * a button cannot legally contain another button. The content area is its own
 * button, so clicking the card still opens the campaign.
 */
export default function CampaignCard({ campaign, onClick, actions }: CampaignCardProps) {
  const color = getTypeColor(campaign.email_label);
  const displayDate =
    campaign.campaign_type === "recurring" ? campaign.next_send_date : campaign.scheduled_date;

  return (
    <div className="flex items-center gap-3 bg-surface border border-border rounded-card p-4 hover:border-border-strong transition-colors duration-150">
      <button onClick={() => onClick(campaign)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
        {/* Type stripe — dashed for recurring, solid for one-time */}
        <span
          className="w-1 h-12 rounded-pill shrink-0 mt-0.5"
          style={
            campaign.campaign_type === "recurring"
              ? {
                  backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)`,
                }
              : { backgroundColor: color }
          }
        />
        <span className="min-w-0 block">
          <span className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
              {campaign.email_label || "Group"}
            </span>
            {campaign.campaign_type === "recurring" && (
              <Badge tone="neutral" size="sm">
                {campaign.frequency}
              </Badge>
            )}
          </span>

          <span className="block text-sm font-medium text-text truncate">{campaign.listing_name}</span>

          <span className="block text-xs text-text-3 mt-1">
            {displayDate ? formatScheduleDate(displayDate) : "Not scheduled"}
          </span>
        </span>
      </button>

      <Badge tone={STATUS_TONE[campaign.status] || "neutral"} className="shrink-0">
        {STATUS_LABELS[campaign.status] || campaign.status}
      </Badge>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
