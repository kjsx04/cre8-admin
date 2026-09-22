"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

interface PageContainerProps {
  /** default = forms and reading (max 1024px) · wide = boards and tables (max 1280px) · full = edge to edge */
  width?: "default" | "wide" | "full";
  className?: string;
  children: ReactNode;
}

const WIDTH = { default: "max-w-5xl mx-auto", wide: "max-w-7xl mx-auto", full: "" };

/** PageContainer — the one page padding + max-width. Every page starts with this. */
export function PageContainer({ width = "wide", className, children }: PageContainerProps) {
  return <div className={cn("px-6 py-6 md:px-8", WIDTH[width], className)}>{children}</div>;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot — the page's main buttons */
  actions?: ReactNode;
  /** Something under the title row (tabs, filters) */
  children?: ReactNode;
  className?: string;
}

/**
 * PageHeader — title, optional description, and the page's actions on the right.
 *   <PageHeader title="Listings" actions={<Button icon={<Plus size={18}/>}>New listing</Button>}>
 *     <Tabs … />
 *   </PageHeader>
 */
export function PageHeader({ title, description, actions, children, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text tracking-tight">{title}</h1>
          {description && <p className="text-sm text-text-2 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
