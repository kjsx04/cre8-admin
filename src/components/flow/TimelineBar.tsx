"use client";

import { Deal } from "@/lib/flow/types";
import { getCriticalDates, formatDate, countdownText } from "@/lib/flow/utils";
import { Card, cn } from "@/components/ui";

interface TimelineBarProps {
  deal: Deal;
}

export default function TimelineBar({ deal }: TimelineBarProps) {
  const dates = getCriticalDates(deal);

  if (dates.length === 0) {
    return (
      // Card primitive — hairline border, no shadow
      <Card padding="sm">
        <h3 className="text-sm font-semibold text-text mb-2">Timeline</h3>
        <p className="text-sm text-text-3">No dates set yet</p>
      </Card>
    );
  }

  return (
    <Card padding="sm">
      <h3 className="text-sm font-semibold text-text mb-4">Timeline</h3>

      {/* Vertical timeline with dots */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-4">
          {dates.map((cd, i) => {
            // Dot color based on urgency (green = on track, amber = soon, red = urgent/overdue)
            const dotColor =
              cd.urgency === "gray" ? "bg-border-strong" :
              cd.isPast ? "bg-border-strong" :
              cd.urgency === "red" ? "bg-danger" :
              cd.urgency === "yellow" ? "bg-warning-fg" :
              "bg-accent";

            return (
              <div key={i} className="flex items-start gap-3 relative">
                {/* Dot */}
                <div className={cn("w-[15px] h-[15px] rounded-full border-2 border-surface flex-shrink-0 mt-0.5 z-10", dotColor)} />

                {/* Label + date + countdown */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-sm font-medium", cd.isPast ? "text-text-3" : "text-text")}>
                      {cd.label}
                    </span>
                    <span
                      className={cn(
                        "text-xs flex-shrink-0 font-medium",
                        cd.isPast ? "text-text-3" :
                        cd.urgency === "red" ? "text-danger-fg" :
                        cd.urgency === "yellow" ? "text-warning-fg" :
                        "text-accent-strong"
                      )}
                    >
                      {countdownText(cd.daysAway)}
                    </span>
                  </div>
                  <span className="text-xs text-text-3">
                    {formatDate(cd.date.toISOString().substring(0, 10))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
