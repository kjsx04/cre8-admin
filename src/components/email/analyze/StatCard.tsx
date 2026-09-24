"use client";

import { ReactNode } from "react";
import { cn } from "@/components/ui";

export interface StatCardProps {
  label: string;
  /** The headline number, already formatted */
  value: ReactNode;
  /** One short line under the number — the denominator, the raw figure, the caveat */
  hint?: ReactNode;
  /** Full explanation on hover, for anything that needed a judgement call */
  title?: string;
  /** Greyed out when there isn't enough data to mean anything */
  muted?: boolean;
}

/**
 * One number on the dashboard.
 *
 * Deliberately plain: no colour coding, no arrows, no "up 12%". There is one
 * blast of real data, so any trend indicator would be invented. The hint line
 * carries the denominator, because a rate without its base is a rumour.
 */
export function StatCard({ label, value, hint, title, muted }: StatCardProps) {
  return (
    <div
      className="bg-surface border border-border rounded-card p-4 min-w-0"
      title={title}
    >
      <p className="text-xs font-medium text-text-3 truncate">{label}</p>
      <p className={cn("mt-1.5 text-xl font-semibold tabular-nums tracking-tight", muted ? "text-text-3" : "text-text")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-text-3 leading-4">{hint}</p>}
    </div>
  );
}

/** Responsive row of StatCards — 2 up on a phone, 4 on a desktop. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>;
}
