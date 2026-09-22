"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

interface EmptyStateProps {
  /** A lucide icon element, size 20 */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a Button — the next thing to do */
  action?: ReactNode;
  /** Tighter padding for small areas (cards, panels) */
  compact?: boolean;
  className?: string;
}

/**
 * EmptyState — what a list shows when there's nothing in it.
 *   <EmptyState icon={<Inbox size={20} />} title="No deals yet" description="…" action={<Button>New deal</Button>} />
 */
export default function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6", compact ? "py-8" : "py-16", className)}>
      {icon && (
        <div className="w-10 h-10 rounded-full bg-surface-2 text-text-3 flex items-center justify-center mb-3">{icon}</div>
      )}
      <p className="text-base font-medium text-text">{title}</p>
      {description && <p className="text-sm text-text-2 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
