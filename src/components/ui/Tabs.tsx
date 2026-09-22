"use client";

import { ReactNode } from "react";
import { cn, FOCUS_RING } from "./cn";

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Optional count shown after the label */
  count?: number;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Tabs — segmented control (grey track, white raised pill for the active item).
 * Used for status filters, view switches, and Single/Multiple style choices.
 *   <Tabs items={[{value:"all",label:"All",count:12},…]} value={tab} onChange={setTab} />
 */
export default function Tabs<T extends string>({ items, value, onChange, size = "md", className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn("inline-flex items-center gap-0.5 bg-surface-2 rounded-control p-0.5", className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors duration-150 whitespace-nowrap",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active ? "bg-surface text-text shadow-sm" : "text-text-2 hover:text-text",
              "disabled:opacity-40 disabled:pointer-events-none",
              FOCUS_RING
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span className={cn("text-xs tabular-nums", active ? "text-text-3" : "text-text-3/80")}>{it.count.toLocaleString("en-US")}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
