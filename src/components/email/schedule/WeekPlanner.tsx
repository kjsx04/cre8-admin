"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { DateKey, weekKeys, isWeekend, dayParts } from "@/lib/email/schedule-dates";
import { Badge, EmptyState } from "@/components/ui";
import SendCard from "./SendCard";

interface WeekPlannerProps {
  weekStart: DateKey; // a Monday
  itemsByDay: Map<DateKey, ScheduleItem[]>;
  today: DateKey;
  maxPerDay: number; // the cap from Settings — days above it get the amber chip
  onSelect: (campaign: Campaign) => void;
}

/**
 * Seven day columns, Monday first. Weekdays get full width; weekends are narrow
 * and muted because the AI never schedules them. Day headers stick to the top
 * of the page's scroll container. A day's count chip turns amber past the AI's
 * per-day cap so overload is obvious.
 *
 * NOTE: no overflow-hidden on the wrapper — it would break the sticky headers.
 */
export default function WeekPlanner({ weekStart, itemsByDay, today, maxPerDay, onSelect }: WeekPlannerProps) {
  const keys = weekKeys(weekStart);

  return (
    <div className="bg-surface rounded-card border border-border">
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_0.6fr_0.6fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
        {keys.map((key, i) => (
          <DayColumn
            key={key}
            dayKey={key}
            items={itemsByDay.get(key) ?? []}
            isToday={key === today}
            isFirst={i === 0}
            isLast={i === keys.length - 1}
            maxPerDay={maxPerDay}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  dayKey,
  items,
  isToday,
  isFirst,
  isLast,
  maxPerDay,
  onSelect,
}: {
  dayKey: DateKey;
  items: ScheduleItem[];
  isToday: boolean;
  isFirst: boolean;
  isLast: boolean;
  maxPerDay: number;
  onSelect: (campaign: Campaign) => void;
}) {
  const weekend = isWeekend(dayKey);
  const { weekday, dayNum } = dayParts(dayKey);
  const count = items.length;
  const over = count > maxPerDay;

  return (
    <div
      className={`flex flex-col lg:min-h-[480px] ${weekend ? "bg-canvas" : ""} ${isToday ? "bg-accent-soft/40" : ""} ${
        weekend && count === 0 ? "hidden lg:flex" : ""
      }`}
    >
      {/* Day header — sticky within the marketing content scroll area. Today is tinted green (status). */}
      <div
        className={`lg:sticky lg:top-0 z-10 flex items-center justify-between px-2.5 py-2 border-b border-border ${
          isToday ? "bg-accent-soft" : weekend ? "bg-canvas" : "bg-surface"
        } ${isFirst ? "lg:rounded-tl-card" : ""} ${isLast ? "lg:rounded-tr-card" : ""}`}
      >
        <div className="flex items-baseline gap-1.5">
          <span className={`text-lg font-semibold leading-none ${isToday ? "text-accent-strong" : weekend ? "text-text-3" : "text-text"}`}>
            {dayNum}
          </span>
          <span className="text-xs text-text-3">{weekday}</span>
        </div>
        {(count > 0 || !weekend) && (
          // Count chip — amber past the per-day cap
          <Badge
            tone={over ? "warning" : "neutral"}
            size="sm"
            title={over ? `Over the ${maxPerDay}-per-day cap` : `${count} send${count === 1 ? "" : "s"}`}
          >
            {count}
          </Badge>
        )}
      </div>

      {/* Sends */}
      <div className="p-2 lg:flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
        {items.map((it) => (
          <SendCard key={it.key} item={it} onClick={onSelect} />
        ))}
        {count === 0 && !weekend && (
          <EmptyState compact title="No sends" className="col-span-full" />
        )}
      </div>
    </div>
  );
}
