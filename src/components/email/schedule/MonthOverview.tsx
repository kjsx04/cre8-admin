"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { DateKey, monthGridKeys, isWeekend, sameMonth, keyToCivil } from "@/lib/email/schedule-dates";
import { getTypeColor } from "@/lib/email/utils";
import { Badge } from "@/components/ui";

interface MonthOverviewProps {
  anchor: DateKey; // any day in the month to show
  itemsByDay: Map<DateKey, ScheduleItem[]>;
  today: DateKey;
  maxPerDay: number; // the cap from Settings — days over it get an amber count
  /** Open a campaign from its line */
  onSelect: (campaign: Campaign) => void;
  /** Open a day in the planner */
  onSelectDay: (key: DateKey) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The month at a glance: every send on its day, as one line each.
 *
 * It used to show only a count and a row of colored dots, which told you a day
 * was busy but not what was on it. Now each line is the send time and the
 * listing name, truncated to one line so a heavy day still fits its cell.
 *
 * Click a line to open that campaign; click the day number to open that week
 * in the planner. Today is tinted green; past days are shaded and their date is
 * struck through, because nothing new can be scheduled there — sends that
 * already went out on those days still show.
 */
export default function MonthOverview({
  anchor,
  itemsByDay,
  today,
  maxPerDay,
  onSelect,
  onSelectDay,
}: MonthOverviewProps) {
  const keys = monthGridKeys(anchor);

  return (
    <div className="bg-surface rounded-card border border-border overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-label uppercase tracking-wider text-text-3 text-center py-2">
            {d}
          </div>
        ))}
      </div>

      {/* 6 × 7 days */}
      <div className="grid grid-cols-7">
        {keys.map((key) => {
          const items = itemsByDay.get(key) ?? [];
          const count = items.length;
          const over = count > maxPerDay;
          const inMonth = sameMonth(key, anchor);
          const weekend = isWeekend(key);
          const isToday = key === today;
          const isPast = key < today;
          const dayNum = keyToCivil(key).getUTCDate();

          return (
            <div
              key={key}
              className={`min-h-[104px] p-1.5 border-b border-r border-border [&:nth-child(7n)]:border-r-0 ${cellBg(weekend, isToday, isPast)}`}
            >
              {/* Date number opens that week; the count sits beside it */}
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onSelectDay(key)}
                  title="Open this week in the planner"
                  className="shrink-0"
                >
                  {isToday ? (
                    <span className="inline-flex w-6 h-6 rounded-pill bg-accent text-ink text-xs font-semibold items-center justify-center">
                      {dayNum}
                    </span>
                  ) : (
                    <span
                      className={`text-xs hover:text-text ${
                        isPast ? "text-text-3 line-through" : inMonth ? "text-text-2" : "text-text-3/60"
                      }`}
                    >
                      {dayNum}
                    </span>
                  )}
                </button>
                {over && (
                  <Badge tone="warning" size="sm" title={`Over the ${maxPerDay}-per-day cap`}>
                    {count}
                  </Badge>
                )}
              </div>

              {/* One line per send */}
              {count > 0 && (
                <div className="mt-1 space-y-0.5">
                  {items.map((it) => (
                    <SendLine key={it.key} item={it} onSelect={onSelect} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One background class per cell — listing several lets stylesheet order pick the
 * winner rather than this function. Weekends are darkest: nothing is ever
 * scheduled there, past or future.
 */
function cellBg(weekend: boolean, isToday: boolean, isPast: boolean): string {
  if (weekend) return "bg-weekend-gray";   // closed to scheduling, always
  if (isToday) return "bg-accent-soft";
  if (isPast) return "bg-surface-2";       // gone
  return "";                               // open — leave it clean
}

/** "9:00 AM Marketplace at Blossom Rock" on one line, clipped to the cell */
function SendLine({ item, onSelect }: { item: ScheduleItem; onSelect: (c: Campaign) => void }) {
  const { campaign: c, state, time } = item;
  const color = getTypeColor(c.email_label);
  const isSent = state === "sent";
  const isProjected = state === "projected";

  // "9:00 AM" → "9:00a" so the name gets as much of the line as possible
  const shortTime = time.replace(/\s?([AP])M$/i, (_, ap: string) => ap.toLowerCase());

  return (
    <button
      type="button"
      onClick={() => onSelect(c)}
      title={`${time} · ${c.listing_name}${isProjected ? " (projected)" : isSent ? " (sent)" : ""}`}
      className={`w-full flex items-center gap-1 text-left rounded-[4px] px-1 py-0.5 hover:bg-surface-2 transition-colors ${
        isSent ? "opacity-50" : ""
      }`}
    >
      {/* Label colour, so a glance still groups Just Listed against Price Reduced */}
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={
          isProjected
            ? { border: `1.5px solid ${color}`, backgroundColor: "transparent" }
            : { backgroundColor: color }
        }
      />
      <span className="text-label tabular-nums text-text-3 shrink-0">{shortTime}</span>
      <span className="text-label text-text truncate">{c.listing_name}</span>
    </button>
  );
}
