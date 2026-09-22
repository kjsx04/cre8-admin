"use client";

import { cn } from "./cn";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = { sm: "w-4 h-4 border-2", md: "w-6 h-6 border-2", lg: "w-10 h-10 border-[3px]" };

/**
 * Spinner — the only loading spinner in the app. Neutral grey, not green
 * (green means "success", and loading isn't success).
 */
export default function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block rounded-full border-border border-t-ink animate-spin shrink-0", SIZE[size], className)}
    />
  );
}

/** Full-area centered spinner with an optional message under it */
export function LoadingBlock({ message, className }: { message?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}>
      <Spinner size="lg" />
      {message && <p className="text-sm text-text-2">{message}</p>}
    </div>
  );
}
