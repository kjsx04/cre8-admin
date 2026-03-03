"use client";

import { Deal } from "@/lib/flow/types";
import { getCriticalDates, formatDate, countdownText } from "@/lib/flow/utils";

interface TimelineBarProps {
  deal: Deal;
}

export default function TimelineBar({ deal }: TimelineBarProps) {
  const dates = getCriticalDates(deal);

  if (dates.length === 0) {
    return (
      <div className="bg-white border border-border-light rounded-card p-4">
        <h3 className="font-bebas text-base tracking-wide uppercase text-charcoal mb-2">Timeline</h3>
        <p className="text-sm text-muted-gray">No dates set yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light rounded-card p-4">
      <h3 className="font-bebas text-base tracking-wide uppercase text-charcoal mb-4">Timeline</h3>

      {/* Vertical timeline with dots */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border-light" />

        <div className="space-y-4">
          {dates.map((cd, i) => {
            // Dot color based on urgency
            const dotColor =
              cd.urgency === "gray" ? "bg-border-medium" :
              cd.isPast ? "bg-border-medium" :
              cd.urgency === "red" ? "bg-red-500" :
              cd.urgency === "yellow" ? "bg-amber-500" :
              "bg-green";

            return (
              <div key={i} className="flex items-start gap-3 relative">
                {/* Dot */}
                <div className={`w-[15px] h-[15px] rounded-full border-2 border-white ${dotColor} flex-shrink-0 mt-0.5 z-10`} />

                {/* Label + date + countdown */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-medium ${cd.isPast ? "text-muted-gray" : "text-charcoal"}`}>
                      {cd.label}
                    </span>
                    <span className={`text-xs flex-shrink-0 font-medium
                      ${cd.isPast ? "text-muted-gray" :
                        cd.urgency === "red" ? "text-red-600" :
                        cd.urgency === "yellow" ? "text-amber-600" :
                        "text-green"}`
                    }>
                      {countdownText(cd.daysAway)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-gray">
                    {formatDate(cd.date.toISOString().substring(0, 10))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
