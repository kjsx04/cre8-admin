"use client";

import { Check, RefreshCw } from "lucide-react";
import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { getTypeColor } from "@/lib/email/utils";
import { FREQUENCY_LABELS, RECURRING_STRIPE } from "@/lib/email/constants";
import { Badge } from "@/components/ui";
import BrokerAvatarStack from "./BrokerAvatarStack";
import { useAudienceCounts, formatCount } from "@/lib/email/audience-client";

interface SendCardProps {
  item: ScheduleItem;
  onClick: (campaign: Campaign) => void;
}

/**
 * One send on the planner.
 *   confirmed → solid card (a Resend broadcast exists)
 *   projected → dashed card (future recurring occurrence, or not yet synced)
 *   sent      → muted card with a check
 */
export default function SendCard({ item, onClick }: SendCardProps) {
  const { campaign: c, state, time, isRecurring, frequency } = item;
  const color = getTypeColor(c.email_label);
  const isSent = state === "sent";
  const isProjected = state === "projected";
  // Audience size chip ("860") — one shared fetch for every card on the page
  const audience = useAudienceCounts();
  const count = audience[c.segment_id || "all"];

  return (
    // Stays a real <button> — the whole card opens the detail panel
    <button
      type="button"
      onClick={() => onClick(c)}
      className={`w-full text-left rounded-card bg-surface p-2 border transition-colors hover:border-border-strong ${
        isProjected ? "border-dashed border-border-strong" : "border-border"
      } ${isSent ? "opacity-60" : ""}`}
    >
      {/* Time + state */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text">{time}</span>
        {isProjected && <span className="text-label text-text-3">projected</span>}
        {isSent && (
          <span className="inline-flex items-center gap-0.5 text-label font-medium text-accent-strong">
            <Check size={12} strokeWidth={2} /> sent
          </span>
        )}
      </div>

      {/* Group email: 2×2 mosaic of the first listings + count */}
      {c.campaign_kind === "group" && !isSent && (
        <div className="mt-1.5 relative aspect-[16/10] rounded overflow-hidden bg-surface-2 grid grid-cols-2 grid-rows-2 gap-0.5">
          {(c.group_listings || []).slice(0, 4).map((g) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={g.listing_id} src={g.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          ))}
          <span className="absolute bottom-1 right-1 text-label font-semibold px-1.5 py-0.5 rounded bg-black/70 text-white">
            {(c.group_listings || []).length} listings
          </span>
        </div>
      )}

      {/* Listing photo (skipped on sent cards to keep past days compact) */}
      {c.campaign_kind !== "group" && c.photo_url && !isSent && (
        <div className="mt-1.5 aspect-[16/10] rounded overflow-hidden bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      {/* Label + priority — label color is campaign-type data (TYPE_COLORS), so it stays inline */}
      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
        <span
          className="text-label font-semibold px-1.5 py-0.5 rounded text-white"
          style={{ backgroundColor: color, backgroundImage: isRecurring ? RECURRING_STRIPE : undefined }}
        >
          {c.email_label || "Group"}
        </span>
        {c.priority === "high" && (
          <Badge tone="warning" size="sm">Highest</Badge>
        )}
      </div>

      {/* Listing */}
      <p className="mt-1 text-xs font-medium text-text leading-snug line-clamp-2">{c.listing_name}</p>

      {/* Brokers + cadence */}
      <div className="mt-1.5 flex items-center justify-between">
        <BrokerAvatarStack brokerIds={c.broker_ids || []} primaryId={c.broker_id} />
        <span className="flex items-center gap-1.5">
          {isRecurring && frequency && (
            <span className="inline-flex items-center gap-0.5 text-label text-text-3" title="Recurring">
              <RefreshCw size={12} strokeWidth={1.75} /> {FREQUENCY_LABELS[frequency] || frequency}
            </span>
          )}
          {count && (
            <Badge size="sm" className="tabular-nums" title={`${count.name} · ${formatCount(count.subscribed)} recipients`}>
              {formatCount(count.subscribed)}
            </Badge>
          )}
        </span>
      </div>
    </button>
  );
}
