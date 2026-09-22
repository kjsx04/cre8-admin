"use client";

import { HTMLAttributes, ReactNode, forwardRef } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding: sm 16px · md 20px · lg 24px · none (for tables / images) */
  padding?: "none" | "sm" | "md" | "lg";
  /** Border darkens on hover — for clickable cards */
  interactive?: boolean;
}

const PADDING = { none: "", sm: "p-4", md: "p-5", lg: "p-6" };

/**
 * Card — white surface with a hairline border. Never a shadow.
 *   <Card><CardHeader title="Commission" actions={<Button size="sm">Edit</Button>} />…</Card>
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "md", interactive, className, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-border rounded-card",
        PADDING[padding],
        interactive && "transition-colors duration-150 hover:border-border-strong cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot (buttons, badges) */
  actions?: ReactNode;
  className?: string;
}

/** CardHeader — title row at the top of a Card */
export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-4", className)}>
      <div className="min-w-0">
        <h3 className="text-md font-semibold text-text leading-6">{title}</h3>
        {description && <p className="text-sm text-text-2 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
