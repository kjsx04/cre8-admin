"use client";

import { type BucketCount } from "@/lib/email/analytics";

interface BarChartProps {
  data: BucketCount[];
  /** Turns a bucket number into its axis label ("9a", "Mon") */
  labelFor: (bucket: number) => string;
  /** Only label every Nth bar, so 24 hours don't turn into mush */
  labelEvery?: number;
  /** Singular noun for the tooltip: "click", "send" */
  unit?: string;
  emptyMessage?: string;
}

/**
 * A plain column chart in CSS.
 *
 * No charting library: there are at most 24 bars and one series, and a 40KB
 * dependency to draw rectangles would be the largest thing on the page.
 */
export default function BarChart({ data, labelFor, labelEvery = 1, unit = "click", emptyMessage }: BarChartProps) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);

  if (max === 0) {
    return <p className="text-sm text-text-3 py-6 text-center">{emptyMessage || "Nothing to show yet."}</p>;
  }

  return (
    <div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d) => (
          <div key={d.bucket} className="flex-1 min-w-0 flex flex-col justify-end h-full">
            <div
              className="w-full rounded-t-[3px] bg-accent-strong"
              /* Height is a data value, not a design token — it has to be inline.
                 A bar with any data keeps 2px so a single click stays visible. */
              style={{ height: d.count > 0 ? `${Math.max(2, (d.count / max) * 100)}%` : "0%" }}
              title={`${labelFor(d.bucket)} · ${d.count} ${unit}${d.count === 1 ? "" : "s"}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1.5">
        {data.map((d) => (
          <div key={d.bucket} className="flex-1 min-w-0 text-center text-xs text-text-3 truncate">
            {d.bucket % labelEvery === 0 ? labelFor(d.bucket) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
