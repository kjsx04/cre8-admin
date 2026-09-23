"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { getTypeColor } from "@/lib/email/utils";
import { FREQUENCY_LABELS, RECURRING_STRIPE } from "@/lib/email/constants";
import BrokerAvatarStack from "./BrokerAvatarStack";
import { useAudienceCounts, formatCount, audienceForCampaign } from "@/lib/email/audience-client";

interface SendCardProps {
  item: ScheduleItem;
  onClick: (campaign: Campaign) => void;
  /** This is the email that was just placed */
  placed?: boolean;
  /** The AI moved this one to make room */
  moved?: boolean;
}

/**
 * One send on the planner.
 *   confirmed → solid card (a Resend broadcast exists)
 *   projected → dashed card (future recurring occurrence, or not yet synced)
 *   sent      → muted card with a check
 */
export default function SendCard({ item, onClick, placed, moved }: SendCardProps) {
  const { campaign: c, state, time, isRecurring, frequency } = item;
  const color = getTypeColor(c.email_label);
  const isSent = state === "sent";
  const isProjected = state === "projected";
  // Audience size chip ("860") — one shared fetch for every card on the page
  const audience = useAudienceCounts();
  const count = audienceForCampaign(audience, c.segment_id);

  return (
    <button
      type="button"
      onClick={() => onClick(c)}
      className={`w-full text-left rounded-card bg-white p-2 border transition-colors hover:border-border-medium ${
        isProjected ? "border-dashed border-border-medium" : "border-border-light"
      } ${isSent ? "opacity-60" : ""} ${
        // Just placed: solid ring. Just moved: soft ring. Both fade out on their own.
        placed ? "ring-2 ring-green ring-offset-1 animate-slide-up" : moved ? "ring-2 ring-green/40 animate-slide-up" : ""
      }`}
    >
      {/* Time + state */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-charcoal">{time}</span>
        {isProjected && <span className="text-[10px] italic text-muted-gray">projected</span>}
        {isSent && <span className="text-[10px] font-medium text-green-dark">✓ sent</span>}
      </div>

      {/* Group email: 2×2 mosaic of the first listings + count */}
      {c.campaign_kind === "group" && !isSent && (
        <div className="mt-1.5 relative aspect-[16/10] rounded overflow-hidden bg-light-gray grid grid-cols-2 grid-rows-2 gap-0.5">
          {(c.group_listings || []).slice(0, 4).map((g) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={g.listing_id} src={g.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          ))}
          <span className="absolute bottom-1 right-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/70 text-white">
            {(c.group_listings || []).length} listings
          </span>
        </div>
      )}

      {/* Listing photo (skipped on sent cards to keep past days compact) */}
      {c.campaign_kind !== "group" && c.photo_url && !isSent && (
        <div className="mt-1.5 aspect-[16/10] rounded overflow-hidden bg-light-gray">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      {/* Label + priority */}
      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
        <span
          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white"
          style={{ backgroundColor: color, backgroundImage: isRecurring ? RECURRING_STRIPE : undefined }}
        >
          {c.email_label || "Group"}
        </span>
        {/* Priority chip: Top, or the custom slot number */}
        {c.priority === "high" && (
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            Top
          </span>
        )}
        {c.priority === "custom" && c.priority_rank && (
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            #{c.priority_rank}
          </span>
        )}
      </div>

      {/* Listing */}
      <p className="mt-1 text-xs font-medium text-charcoal leading-snug line-clamp-2">{c.listing_name}</p>

      {/* Brokers + cadence */}
      <div className="mt-1.5 flex items-center justify-between">
        <BrokerAvatarStack brokerIds={c.broker_ids || []} primaryId={c.broker_id} />
        <span className="flex items-center gap-1.5">
          {isRecurring && frequency && (
            <span className="text-[10px] text-muted-gray" title="Recurring">
              ↻ {FREQUENCY_LABELS[frequency] || frequency}
            </span>
          )}
          {count && (
            <span
              className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded bg-light-gray text-medium-gray"
              title={`${count.name} · ${formatCount(count.subscribed)} recipients`}
            >
              {formatCount(count.subscribed)}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
