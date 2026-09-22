"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

interface SectionProps {
  title: ReactNode;
  /** Numbered step circle before the title (composer-style flows) */
  step?: number;
  /** Small grey note after the title */
  description?: ReactNode;
  /** Right-aligned slot */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Section — heading row + content, used inside cards, panels and forms.
 *   <Section title="Owner" description="From the listing agreement">…</Section>
 *   <Section step={3} title="Heading">…</Section>
 */
export default function Section({ title, step, description, actions, className, children }: SectionProps) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {step !== undefined && (
            <span className="w-6 h-6 rounded-full bg-accent-soft text-accent-strong text-xs font-semibold flex items-center justify-center shrink-0">
              {step}
            </span>
          )}
          <h2 className="text-sm font-semibold text-text truncate">{title}</h2>
          {description && <span className="text-xs text-text-3 truncate">· {description}</span>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
