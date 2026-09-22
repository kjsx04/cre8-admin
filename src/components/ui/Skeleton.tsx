"use client";

import { cn } from "./cn";

/** Skeleton — grey placeholder block. Give it a shape via className (`h-4 w-32`, `h-40 w-full`). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("bg-surface-2 animate-pulse rounded-control", className)} />;
}

/**
 * TableSkeleton — N placeholder rows for a table that's still loading.
 * `columns` is an array of Tailwind width classes, one per column.
 */
export function TableSkeleton({ rows = 8, columns = ["w-48", "w-24", "w-32", "w-20", "w-16"] }: { rows?: number; columns?: string[] }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-5 h-11">
          {columns.map((w, c) => (
            <Skeleton key={c} className={cn("h-3.5", w)} />
          ))}
        </div>
      ))}
    </div>
  );
}
