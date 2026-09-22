"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

// Badge = tinted background + darker text of the same hue
const BADGE_TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-2",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  accent: "bg-accent-soft text-accent-strong",
};

// StatusDot = solid 8px circle
const DOT_TONE: Record<Tone, string> = {
  neutral: "bg-text-3",
  success: "bg-accent",
  warning: "bg-warning-fg",
  danger: "bg-danger",
  info: "bg-info-fg",
  accent: "bg-accent",
};

interface BadgeProps {
  tone?: Tone;
  size?: "sm" | "md";
  /** Optional lucide icon (size 12) on the left */
  icon?: ReactNode;
  className?: string;
  title?: string;
  children: ReactNode;
}

/**
 * Badge — small pill for statuses and labels.
 *   <Badge tone="success">Live</Badge>   <Badge tone="warning" size="sm">3</Badge>
 */
export function Badge({ tone = "neutral", size = "md", icon, className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill font-medium whitespace-nowrap",
        size === "sm" ? "h-4 px-1.5 text-label normal-case tracking-normal" : "h-5 px-2 text-xs",
        BADGE_TONE[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

interface StatusDotProps {
  tone?: Tone;
  /** Text to the right of the dot */
  label?: ReactNode;
  className?: string;
  title?: string;
}

/** StatusDot — 8px colored dot with optional label. `<StatusDot tone="success" label="Live" />` */
export function StatusDot({ tone = "neutral", label, className, title }: StatusDotProps) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 text-sm text-text-2", className)}>
      <span className={cn("w-2 h-2 rounded-full shrink-0", DOT_TONE[tone])} />
      {label}
    </span>
  );
}
