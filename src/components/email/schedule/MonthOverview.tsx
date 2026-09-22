"use client";

import { ScheduleItem } from "@/lib/email/occurrences";
import { DateKey, monthGridKeys, isWeekend, sameMonth, keyToCivil } from "@/lib/email/schedule-dates";
import { getTypeColor } from "@/lib/email/utils";
import { Badge } from "@/components/ui";

interface MonthOverviewProps {
  anchor: DateKey; // any day in the month to show
  itemsByDay: Map<DateKey, ScheduleItem[]>;
  today: DateKey;
  maxPerDay: number; // the cap from Settings — days above it get the amber chip
  onSelectDay: (key: DateKey) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Density view: each day shows a send count and up to four label-colored dots.
 * Click any day to open that week in the planner.
 */
export default function MonthOverview({ anchor, itemsByDay, today, maxPerDay, onSelectDay }: MonthOverviewProps) {
  const keys = monthGridKeys(anchor);

  return (
    <div className="bg-surface rounded-card border border-border overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-xs text-text-3 text-center py-2">
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
          const dayNum = keyToCivil(key).getUTCDate();

          return (
            // Each day is a clickable cell (opens that week) — stays a raw button to keep the grid tight
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              title={count > 0 ? `${count} send${count === 1 ? "" : "s"} — open this week` : "Open this week"}
              className={`min-h-[88px] p-1.5 text-left border-b border-r border-border hover:bg-surface-2 transition-colors [&:nth-child(7n)]:border-r-0 ${
                !inMonth ? "bg-canvas/60" : weekend ? "bg-canvas" : ""
              }`}
            >
              {/* Date number — today gets the green (status) dot */}
              {isToday ? (
                <span className="inline-flex w-6 h-6 rounded-full bg-accent text-black text-xs font-semibold items-center justify-center">
                  {dayNum}
                </span>
              ) : (
                <span className={`text-xs ${inMonth ? "text-text-2" : "text-text-3/50"}`}>{dayNum}</span>
              )}

              {count > 0 && (
                <>
                  {/* Count chip — amber past the per-day cap */}
                  <div className="mt-1">
                    <Badge tone={over ? "warning" : "neutral"} size="sm">
                      {count} send{count === 1 ? "" : "s"}
                    </Badge>
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
                    {count > 4 && <span className="text-label text-text-3">+{count - 4}</span>}
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
