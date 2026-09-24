"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem, ScheduleState } from "@/lib/email/occurrences";
import { FREQUENCY_LABELS } from "@/lib/email/constants";
import { Users, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui";
import { EMAIL_SENDERS, BROKER_HEADSHOTS } from "@/lib/email/constants";
import { useAudience, formatCount, audienceForCampaign } from "@/lib/email/audience-client";

interface SendCardProps {
  item: ScheduleItem;
  onClick: (campaign: Campaign) => void;
  /** This is the email that was just placed */
  placed?: boolean;
  /** The AI moved this one to make room */
  moved?: boolean;
}

/**
 * One send on the planner — time, listing name, who it's from, how often.
 *
 * No photo and no email heading. At planner width both pushed the listing name
 * down, and a long heading ran to three lines and dominated the card. The week
 * should read as a schedule, so each card carries only what tells one send apart
 * from another at a glance.
 *
 *   confirmed → solid card (a Resend broadcast exists)
 *   projected → dashed card (future recurring occurrence, or not yet synced)
 *   sent      → muted card with a check
 */
export default function SendCard({ item, onClick, placed, moved }: SendCardProps) {
  const { campaign: c, state, time, isRecurring, frequency } = item;
  const isSent = state === "sent";
  const isProjected = state === "projected";
  const isMissed = state === "missed";
  // Audience size chip ("860") — one shared fetch for every card on the page
  const audience = useAudience();
  const count = audienceForCampaign(audience.map, c.segment_id, audience.overlaps);

  return (
    <button
      type="button"
      onClick={() => onClick(c)}
      className={`w-full text-left rounded-card bg-surface p-2 border transition-colors hover:border-border-strong ${
        isMissed ? "border-danger/50" : isProjected ? "border-dashed border-border-strong" : "border-border"
      } ${isSent ? "opacity-60" : ""} ${
        // Just placed: solid ring. Just moved: soft ring. Both fade out on their own.
        placed ? "ring-2 ring-accent ring-offset-1 animate-slide-up" : moved ? "ring-2 ring-accent/40 animate-slide-up" : ""
      }`}
    >
      {/* When it goes out and how many people get it.
          The count used to sit beside the cadence, where "Weekly 3" read as
          three weeks rather than three recipients. Up here next to the time,
          with a person icon, it can only mean a headcount.

          Nothing in this row may wrap: at planner width "11:00 AM" was breaking
          across two lines, which read as two different times. */}
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <SendDot state={state} />
          <span className="text-xs font-semibold text-text whitespace-nowrap">{time}</span>
          {count && (
            <span
              className="flex items-center gap-0.5 text-label tabular-nums text-text-3 whitespace-nowrap"
              title={`${count.name} · ${formatCount(count.subscribed)} recipients`}
            >
              <Users size={11} strokeWidth={1.75} aria-hidden />
              {formatCount(count.subscribed)}
            </span>
          )}
        </span>
        <span className="shrink-0">
          {isProjected && <Badge tone="neutral" size="sm">projected</Badge>}
          {isSent && <Badge tone="success" size="sm">sent</Badge>}
          {isMissed && <Badge tone="danger" size="sm">didn&apos;t send</Badge>}
        </span>
      </div>

      {/* Listing */}
      <p className="mt-1.5 text-sm font-medium text-text leading-snug line-clamp-2 break-words">{c.listing_name}</p>

      {/* Only what changes where this send sits: how many listings, and its priority.
          The email heading is not shown — a long one ran to three lines and buried
          the listing name, which is what you actually scan the week for. */}
      {(c.campaign_kind === "group" || c.priority === "high" || (c.priority === "custom" && c.priority_rank)) && (
        <div className="mt-1 flex items-center gap-1 flex-wrap">
          {c.campaign_kind === "group" && (
            <Badge tone="neutral" size="sm">{(c.group_listings || []).length} listings</Badge>
          )}
          {c.priority === "high" && <Badge tone="warning" size="sm">Top</Badge>}
          {c.priority === "custom" && c.priority_rank && (
            <Badge tone="warning" size="sm">#{c.priority_rank}</Badge>
          )}
        </div>
      )}

      {/* Footer: how often it repeats, and who it comes from.
          The avatar sits here rather than beside the time — up there it competed
          with the headcount for a narrow row and pushed the time onto two lines.
          Only the sender is shown; the other brokers are on the email itself,
          but the From address is what a reader sees first. */}
      <div className="mt-1.5 flex items-end justify-between gap-2 min-h-[20px]">
        {isRecurring && frequency ? (
          <span className="flex items-center gap-1 text-label text-text-3 whitespace-nowrap" title="Repeats">
            <RefreshCw size={11} strokeWidth={1.75} aria-hidden />
            {FREQUENCY_LABELS[frequency] || frequency}
          </span>
        ) : (
          <span />
        )}
        <SenderAvatar brokerId={c.broker_id} name={c.broker_name} />
      </div>
    </button>
  );
}

/**
 * The state of one send, at a glance.
 *
 *   hollow green  — queued, still to come
 *   solid green   — it went out
 *   hollow grey   — a projected recurrence, nothing queued yet
 *   red + slash   — its time passed and nothing was sent
 *
 * The last one is the point of this: a send that quietly disappeared used to be
 * indistinguishable from one that was still waiting.
 */
function SendDot({ state }: { state: ScheduleState }) {
  const label =
    state === "sent" ? "Sent" : state === "missed" ? "Did not send" : state === "projected" ? "Projected" : "Scheduled";

  if (state === "missed") {
    return (
      <span title={label} aria-label={label} className="relative inline-flex w-2.5 h-2.5 shrink-0">
        <span className="absolute inset-0 rounded-full border-[1.5px] border-danger" />
        <span className="absolute left-1/2 top-1/2 w-[1.5px] h-[12px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-danger" />
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
        state === "sent"
          ? "bg-accent"
          : state === "projected"
          ? "border-[1.5px] border-text-3"
          : "border-[1.5px] border-accent"
      }`}
    />
  );
}

/** The one broker the email is sent from — the From address, not everyone on the card. */
function SenderAvatar({ brokerId, name }: { brokerId?: string | null; name?: string | null }) {
  const sender = EMAIL_SENDERS.find((b) => b.id === brokerId);
  const label = sender?.name || name || "Sender";
  const src = brokerId ? BROKER_HEADSHOTS[brokerId] : "";
  return (
    <span
      title={`From ${label}`}
      className="w-5 h-5 rounded-full overflow-hidden bg-ink text-white text-[8px] font-semibold flex items-center justify-center shrink-0"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="w-full h-full object-cover" />
      ) : (
        label.split(" ").map((p) => p[0]).join("").slice(0, 2)
      )}
    </span>
  );
}
