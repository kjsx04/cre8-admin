"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { FREQUENCY_LABELS } from "@/lib/email/constants";
import { getTypeColor } from "@/lib/email/utils";

/**
 * One send, as a single line. The same component in the week planner and the
 * month grid, so the two views cannot drift apart.
 *
 * The week used to draw a bordered card per send carrying the time, a recipient
 * count, the listing, a broker photo, the cadence and up to two badges. Next to
 * the month's quiet rows it read as clutter, and the thing you actually scan a
 * week for — which property goes out when — was the smallest text on it.
 *
 * Everything that was dropped is still one hover away in the tooltip, and all
 * of it is in the detail panel a click away.
 *
 *   week  — the column is narrow but tall, so the name wraps to two lines
 *   month — the cell is short, so the name is clipped to one
 */
interface SendLineProps {
  item: ScheduleItem;
  onSelect: (campaign: Campaign) => void;
  variant?: "week" | "month";
  /** This is the email that was just placed */
  placed?: boolean;
  /** The AI moved this one to make room */
  moved?: boolean;
}

export default function SendLine({ item, onSelect, variant = "month", placed, moved }: SendLineProps) {
  const { campaign: c, state, time, isRecurring, frequency } = item;
  const isSent = state === "sent";
  const isProjected = state === "projected";
  const isMissed = state === "missed";
  const isWeek = variant === "week";

  // "9:00 AM" → "9:00a" so the listing name gets as much of the line as possible
  const shortTime = time.replace(/\s?([AP])M$/i, (_, ap: string) => ap.toLowerCase());

  // What was on the card, now on hover
  const detail = [
    time,
    c.listing_name,
    c.broker_name ? `from ${c.broker_name}` : "",
    isRecurring && frequency ? FREQUENCY_LABELS[frequency] || frequency : "",
    c.campaign_kind === "group" ? `${(c.group_listings || []).length} listings` : "",
    c.priority === "high" ? "Top of the list" : c.priority === "custom" && c.priority_rank ? `#${c.priority_rank}` : "",
    isMissed ? "did not send" : isProjected ? "projected" : isSent ? "sent" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onSelect(c)}
      title={detail}
      className={`w-full flex items-start gap-1.5 text-left rounded-[4px] px-1 hover:bg-surface-2 transition-colors ${
        isWeek ? "py-1" : "py-0.5"
      } ${isSent ? "opacity-50" : ""} ${isMissed ? "text-danger-fg" : ""} ${
        // Just placed: solid ring. Just moved: soft ring. Both fade out on their own.
        placed ? "ring-2 ring-accent animate-slide-up" : moved ? "ring-2 ring-accent/40 animate-slide-up" : ""
      }`}
    >
      <StateDot state={state} label={c.email_label} week={isWeek} />
      <span className={`tabular-nums text-text-3 shrink-0 ${isWeek ? "text-xs" : "text-label"}`}>{shortTime}</span>
      <span className={`${isWeek ? "text-xs text-text line-clamp-2" : "text-label text-text truncate"}`}>
        {c.listing_name}
      </span>
    </button>
  );
}

/**
 * The state of one send, at a glance.
 *
 *   filled  — it went out
 *   hollow  — queued, still to come
 *   grey    — a projected recurrence, nothing queued yet
 *   red + slash — its time passed and nothing was sent
 *
 * The last one is the point of this: a send that quietly disappeared used to be
 * indistinguishable from one that was still waiting.
 */
function StateDot({ state, label, week }: { state: ScheduleItem["state"]; label?: string | null; week: boolean }) {
  const size = week ? "w-2.5 h-2.5" : "w-2 h-2";
  // Nudge down so the dot sits on the first line of a wrapped name
  const align = week ? "mt-[3px]" : "mt-[3px]";

  if (state === "missed") {
    return (
      <span title="Did not send" className={`relative inline-flex ${size} ${align} shrink-0`}>
        <span className="absolute inset-0 rounded-full border-[1.5px] border-danger" />
        <span className="absolute left-1/2 top-1/2 w-[1.5px] h-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-danger" />
      </span>
    );
  }

  const color = getTypeColor(label || "");
  return (
    <span
      title={state === "sent" ? "Sent" : state === "projected" ? "Projected" : "Scheduled"}
      className={`${size} ${align} rounded-full shrink-0`}
      style={
        state === "sent"
          ? { backgroundColor: color }
          : { border: `1.5px solid ${state === "projected" ? "#9A9AA0" : color}`, backgroundColor: "transparent" }
      }
    />
  );
}
