"use client";

import { Campaign } from "@/lib/email/types";
import { ScheduleItem } from "@/lib/email/occurrences";
import { DateKey, dayParts } from "@/lib/email/schedule-dates";
import SendLine from "./SendLine";
import { Badge } from "@/components/ui";

/*
 * PhoneAgenda — the email calendar for phones (under 640px).
 *
 * The two-week grid doesn't fit on a phone, so this is a plain list:
 * only days that have sends, only today and later, today first.
 * Each send is the same SendLine the calendar uses (dot, time, listing),
 * and tapping it opens the same campaign panel.
 *
 * Tablets and computers keep the week / month calendar.
 */
interface PhoneAgendaProps {
  dayKeys: DateKey[];                          // the days in view (the two-week window)
  itemsByDay: Map<DateKey, ScheduleItem[]>;    // sends grouped by day
  today: DateKey;
  maxPerDay: number;                           // per-day cap from Settings (amber count when over)
  onSelect: (campaign: Campaign) => void;
  placedId?: string | null;
  movedIds?: Set<string>;
}

export default function PhoneAgenda({ dayKeys, itemsByDay, today, maxPerDay, onSelect, placedId, movedIds }: PhoneAgendaProps) {
  // Hide past days and days with nothing going out
  const days = dayKeys.filter((k) => k >= today && (itemsByDay.get(k)?.length ?? 0) > 0);

  if (days.length === 0) {
    return (
      <div className="bg-surface rounded-card border border-border py-10 text-center text-sm text-text-3">
        No upcoming sends in these two weeks
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-border divide-y divide-border overflow-hidden">
      {days.map((key) => {
        const items = itemsByDay.get(key) ?? [];
        const { weekday, dayNum, monthShort } = dayParts(key);
        const isToday = key === today;
        const over = items.length > maxPerDay;
        return (
          <section key={key} className={isToday ? "bg-accent-soft" : ""}>
            {/* Day heading: "25 WED Nov  · Today" with the send count on the right */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <div className="flex items-baseline gap-1.5">
                <span className={`font-bebas text-2xl leading-none ${isToday ? "text-accent-strong" : "text-text"}`}>{dayNum}</span>
                <span className="text-label uppercase tracking-wider text-text-3">
                  {weekday} {monthShort}
                </span>
                {isToday && <Badge tone="success" size="sm">Today</Badge>}
              </div>
              <Badge tone={over ? "warning" : "neutral"} size="sm">
                {items.length}
              </Badge>
            </div>

            {/* Sends — bigger rows than the desktop grid so they're easy to tap */}
            <div className="px-1.5 pb-1.5">
              {items.map((it) => (
                <SendLine
                  key={it.key}
                  item={it}
                  onSelect={onSelect}
                  variant="week"
                  placed={it.campaign.id === placedId}
                  moved={!!movedIds?.has(it.campaign.id)}
                  comfy
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
