/**
 * cn() — joins class names, skipping anything falsy.
 * Lets components write: cn("base", isActive && "bg-surface-2", className)
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Shared keyboard-focus ring. Used by every interactive primitive. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface";
