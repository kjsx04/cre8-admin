"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { DateKey, weekKeys, isWeekend, dayParts } from "@/lib/email/schedule-dates";
import { MAX_SENDS_PER_DAY } from "@/lib/email/constants";
import SendCard from "./SendCard";

interface WeekPlannerProps {
  weekStart: DateKey; // a Monday
  itemsByDay: Map<DateKey, ScheduleItem[]>;
  today: DateKey;
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
export default function WeekPlanner({ weekStart, itemsByDay, today, onSelect }: WeekPlannerProps) {
  const keys = weekKeys(weekStart);

  return (
    <div className="bg-white rounded-card border border-border-light">
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_0.6fr_0.6fr] divide-y lg:divide-y-0 lg:divide-x divide-border-light">
        {keys.map((key, i) => (
          <DayColumn
            key={key}
            dayKey={key}
            items={itemsByDay.get(key) ?? []}
            isToday={key === today}
            isFirst={i === 0}
            isLast={i === keys.length - 1}
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
  onSelect,
}: {
  dayKey: DateKey;
  items: ScheduleItem[];
  isToday: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: (campaign: Campaign) => void;
}) {
  const weekend = isWeekend(dayKey);
  const { weekday, dayNum } = dayParts(dayKey);
  const count = items.length;
  const over = count > MAX_SENDS_PER_DAY;

  return (
    <div
      className={`flex flex-col lg:min-h-[480px] ${weekend ? "bg-subtle-gray" : ""} ${isToday ? "bg-[#f7fdf0]" : ""} ${
        weekend && count === 0 ? "hidden lg:flex" : ""
      }`}
    >
      {/* Day header — sticky within the marketing content scroll area */}
      <div
        className={`lg:sticky lg:top-0 z-10 flex items-center justify-between px-2.5 py-2 border-b border-border-light ${
          isToday ? "bg-[#f0fce8]" : weekend ? "bg-subtle-gray" : "bg-white"
        } ${isFirst ? "lg:rounded-tl-card" : ""} ${isLast ? "lg:rounded-tr-card" : ""}`}
      >
        <div className="flex items-baseline gap-1.5">
          <span className={`font-bebas text-2xl leading-none ${isToday ? "text-green-dark" : weekend ? "text-muted-gray" : "text-charcoal"}`}>
            {dayNum}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-gray">{weekday}</span>
        </div>
        {(count > 0 || !weekend) && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              over ? "bg-amber-100 text-amber-700" : "bg-light-gray text-medium-gray"
            }`}
            title={over ? `Over the ${MAX_SENDS_PER_DAY}-per-day cap` : `${count} send${count === 1 ? "" : "s"}`}
          >
            {count}
          </span>
        )}
      </div>

      {/* Sends */}
      <div className="p-2 lg:flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
        {items.map((it) => (
          <SendCard key={it.key} item={it} onClick={onSelect} />
        ))}
        {count === 0 && !weekend && (
          <p className="text-[11px] text-muted-gray/70 text-center pt-6 col-span-full">No sends</p>
        )}
      </div>
    </div>
  );
}
