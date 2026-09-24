"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { DateKey, weekKeys, isWeekend, dayParts, PLANNER_DAYS, rangeLabel } from "@/lib/email/schedule-dates";
import SendLine from "./SendLine";
import { Badge } from "@/components/ui";

interface WeekPlannerProps {
  /** The email that was just placed — gets a ring */
  placedId?: string | null;
  /** Emails the AI shuffled to make room — brief flash */
  movedIds?: Set<string>;
  weekStart: DateKey; // a Monday
  /** How many days to show. Defaults to two weeks. */
  days?: number;
  itemsByDay: Map<DateKey, ScheduleItem[]>;
  today: DateKey;
  maxPerDay: number; // the cap from Settings — days above it get the amber chip
  onSelect: (campaign: Campaign) => void;
}

/**
 * Two weeks of day columns, Sunday first, one week per row.
 *
 * A single week meant next week was always a click away, which is the week you
 * are usually deciding about. Weekdays get full width; weekends are narrow and
 * muted because the AI never schedules them. Day headers stick to the top of
 * the page's scroll container, and a day's count chip turns amber past the AI's
 * per-day cap so overload is obvious.
 *
 * Each send is a SendLine — the same row the month grid draws. The week used to
 * use bordered cards carrying a photo, a headcount, the cadence and badges, and
 * next to the month it read as clutter.
 *
 * NOTE: no overflow-hidden on the wrapper — it would break the sticky headers.
 */
export default function WeekPlanner({
  weekStart,
  days = PLANNER_DAYS,
  itemsByDay,
  today,
  maxPerDay,
  onSelect,
  placedId,
  movedIds,
}: WeekPlannerProps) {
  // One row per week, so Monday always sits under Monday
  const weeks: DateKey[][] = [];
  for (let offset = 0; offset < days; offset += 7) {
    weeks.push(weekKeys(addDaysLocal(weekStart, offset)).slice(0, Math.min(7, days - offset)));
  }

  return (
    <div className="bg-surface rounded-card border border-border divide-y divide-border">
      {weeks.map((keys, row) => (
        <div key={keys[0]}>
          {/* Which week this row is — only worth saying when there's more than one */}
          {weeks.length > 1 && (
            <div className="px-2.5 py-1 bg-surface-2/60 border-b border-border">
              {/* Just the dates. "This week" would be wrong the moment you page forward. */}
              <span className="text-label uppercase tracking-wider text-text-3">
                {rangeLabel(keys[0], keys[keys.length - 1])}
              </span>
            </div>
          )}
          <div className="flex flex-col lg:grid lg:grid-cols-[0.6fr_1fr_1fr_1fr_1fr_1fr_0.6fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
            {keys.map((key, i) => (
              <DayColumn
                key={key}
                dayKey={key}
                items={itemsByDay.get(key) ?? []}
                isToday={key === today}
                isPast={key < today}
                isFirst={i === 0}
                isLast={i === keys.length - 1}
                roundTop={row === 0}
                maxPerDay={maxPerDay}
                onSelect={onSelect}
                placedId={placedId}
                movedIds={movedIds}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


/**
 * One background class, chosen deliberately.
 *
 * Tailwind resolves competing classes by their order in the generated
 * stylesheet, not by the order they appear here — so emitting `bg-a bg-b` and
 * hoping the second wins does not work. Weekends are the darkest because the
 * scheduler never places a send there, whether or not the day has passed.
 */
function dayBg(weekend: boolean, isToday: boolean, isPast: boolean): string {
  if (weekend) return "bg-weekend-gray";   // closed to scheduling, always
  if (isToday) return "bg-accent-soft";
  if (isPast) return "bg-surface-2";       // gone
  return "";                               // open — leave it clean
}

function headerBg(weekend: boolean, isToday: boolean, isPast: boolean): string {
  if (weekend) return "bg-weekend-gray";
  if (isToday) return "bg-accent-soft";
  if (isPast) return "bg-surface-2";
  return "bg-surface";
}

/** Local copy so the component doesn't need the whole date module */
function addDaysLocal(key: DateKey, n: number): DateKey {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function DayColumn({
  dayKey,
  items,
  isToday,
  isPast,
  isFirst,
  isLast,
  roundTop,
  maxPerDay,
  onSelect,
  placedId,
  movedIds,
}: {
  dayKey: DateKey;
  items: ScheduleItem[];
  isToday: boolean;
  isPast: boolean;
  isFirst: boolean;
  isLast: boolean;
  roundTop: boolean;
  maxPerDay: number;
  onSelect: (campaign: Campaign) => void;
  placedId?: string | null;
  movedIds?: Set<string>;
}) {
  const weekend = isWeekend(dayKey);
  const { weekday, dayNum } = dayParts(dayKey);
  const count = items.length;
  const over = count > maxPerDay;

  return (
    <div
      className={`flex flex-col lg:min-h-[260px] ${dayBg(weekend, isToday, isPast)} ${
        weekend && count === 0 ? "hidden lg:flex" : ""
      }`}
    >
      {/* Day header — sticky within the marketing content scroll area */}
      <div
        className={`lg:sticky lg:top-0 z-10 flex items-center justify-between px-2.5 py-2 border-b ${
          isToday ? "border-b-accent" : "border-border"
        } ${headerBg(weekend, isToday, isPast)} ${roundTop && isFirst ? "lg:rounded-tl-card" : ""} ${
          roundTop && isLast ? "lg:rounded-tr-card" : ""
        }`}
      >
        <div className="flex items-baseline gap-1.5 min-w-0">
          {/* A past date is struck through: nothing new can be scheduled there */}
          <span
            className={`font-bebas text-2xl leading-none ${
              isToday ? "text-accent-strong" : isPast ? "text-text-3 line-through" : weekend ? "text-text-3" : "text-text"
            }`}
          >
            {dayNum}
          </span>
          <span className="text-label uppercase tracking-wider text-text-3">{weekday}</span>
          {isToday && <Badge tone="success" size="sm">Today</Badge>}
        </div>
        {(count > 0 || !weekend) && (
          <Badge
            tone={over ? "warning" : "neutral"}
            size="sm"
            title={over ? `Over the ${maxPerDay}-per-day cap` : `${count} send${count === 1 ? "" : "s"}`}
          >
            {count}
          </Badge>
        )}
      </div>

      {/* Sends — the same line the month grid uses, so the two views match */}
      <div className="p-1.5 lg:flex-1 space-y-0.5">
        {items.map((it) => (
          <SendLine
            key={it.key}
            item={it}
            onSelect={onSelect}
            variant="week"
            placed={it.campaign.id === placedId}
            moved={!!movedIds?.has(it.campaign.id)}
          />
        ))}
        {count === 0 && !weekend && (
          <p className="text-xs text-text-3 text-center pt-6">
            {isPast ? "Past" : "No sends"}
          </p>
        )}
      </div>
    </div>
  );
}
