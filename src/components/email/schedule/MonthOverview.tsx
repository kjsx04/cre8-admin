"use client";

import { ScheduleItem } from "@/lib/email/occurrences";
import { DateKey, monthGridKeys, isWeekend, sameMonth, keyToCivil } from "@/lib/email/schedule-dates";
import { MAX_SENDS_PER_DAY } from "@/lib/email/constants";
import { getTypeColor } from "@/lib/email/utils";

interface MonthOverviewProps {
  anchor: DateKey; // any day in the month to show
  itemsByDay: Map<DateKey, ScheduleItem[]>;
  today: DateKey;
  onSelectDay: (key: DateKey) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Density view: each day shows a send count and up to four label-colored dots.
 * Click any day to open that week in the planner.
 */
export default function MonthOverview({ anchor, itemsByDay, today, onSelectDay }: MonthOverviewProps) {
  const keys = monthGridKeys(anchor);

  return (
    <div className="bg-white rounded-card border border-border-light overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border-light">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wider text-muted-gray text-center py-2">
            {d}
          </div>
        ))}
      </div>

      {/* 6 × 7 days */}
      <div className="grid grid-cols-7">
        {keys.map((key) => {
          const items = itemsByDay.get(key) ?? [];
          const count = items.length;
          const over = count > MAX_SENDS_PER_DAY;
          const inMonth = sameMonth(key, anchor);
          const weekend = isWeekend(key);
          const isToday = key === today;
          const dayNum = keyToCivil(key).getUTCDate();

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              title={count > 0 ? `${count} send${count === 1 ? "" : "s"} — open this week` : "Open this week"}
              className={`min-h-[88px] p-1.5 text-left border-b border-r border-border-light hover:bg-light-gray transition-colors [&:nth-child(7n)]:border-r-0 ${
                !inMonth ? "bg-subtle-gray/60" : weekend ? "bg-subtle-gray" : ""
              }`}
            >
              {/* Date number */}
              {isToday ? (
                <span className="inline-flex w-6 h-6 rounded-full bg-green text-black text-xs font-semibold items-center justify-center">
                  {dayNum}
                </span>
              ) : (
                <span className={`text-xs ${inMonth ? "text-medium-gray" : "text-muted-gray/50"}`}>{dayNum}</span>
              )}

              {count > 0 && (
                <>
                  <div
                    className={`mt-1 inline-block text-[10px] font-semibold px-1.5 rounded-full ${
                      over ? "bg-amber-100 text-amber-700" : "bg-light-gray text-medium-gray"
                    }`}
                  >
                    {count} send{count === 1 ? "" : "s"}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    {items.slice(0, 4).map((it) => {
                      const color = getTypeColor(it.campaign.email_label);
                      return (
                        <span
                          key={it.key}
                          className={`w-1.5 h-1.5 rounded-full ${it.state === "sent" ? "opacity-50" : ""}`}
                          style={
                            it.state === "projected"
                              ? { border: `1.5px solid ${color}`, backgroundColor: "transparent" }
                              : { backgroundColor: color }
                          }
                        />
                      );
                    })}
                    {count > 4 && <span className="text-[9px] text-muted-gray">+{count - 4}</span>}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
