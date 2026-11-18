"use client";

import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FitCheck } from "@/lib/demand/types";

type Placement = "side" | "below";

/**
 * Hover card for one tenant against the selected listing.
 * Passing checks stay in the normal text color. A hard miss is struck through.
 * A soft miss is only muted. An unknown is labeled Unknown.
 */
export default function FitHover({
  space,
  checks,
  placement = "side",
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  space?: string;
  checks?: FitCheck[] | null;
  placement?: Placement;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const enabled = Boolean(space && checks && checks.length);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div
      {...rest}
      ref={anchor}
      className={className}
      onMouseEnter={(event) => {
        rest.onMouseEnter?.(event);
        if (enabled) setOpen(true);
      }}
      onMouseLeave={(event) => {
        rest.onMouseLeave?.(event);
        setOpen(false);
      }}
      onFocus={(event) => {
        rest.onFocus?.(event);
        if (enabled) setOpen(true);
      }}
      onBlur={(event) => {
        rest.onBlur?.(event);
        if (anchor.current?.contains(event.relatedTarget as Node)) return;
        setOpen(false);
      }}
    >
      {children}
      {open && enabled && anchor.current && (
        <FitCard anchor={anchor.current} space={space as string} checks={checks as FitCheck[]} placement={placement} />
      )}
    </div>
  );
}

function FitCard({
  anchor,
  space,
  checks,
  placement,
}: {
  anchor: HTMLElement;
  space: string;
  checks: FitCheck[];
  placement: Placement;
}) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    setBox(place(rect, placement));
  }, [anchor, placement, space, checks]);
  if (!box || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 w-[22rem] bg-surface border border-border rounded-card shadow-popover px-3 py-2"
      style={{ top: box.top, left: box.left }}
    >
      <p className="text-xs font-medium text-text">{space}</p>
      <ul className="mt-1.5 space-y-0.5">
        {checks.map((check) => (
          <li key={check.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 text-xs leading-4">
            <span className="text-text-3 whitespace-nowrap">{check.label}</span>
            <span className={detailClass(check)}>
              <span className="sr-only">{statusWord(check.status)}. </span>
              {check.requirement}
              <span className="text-text-3"> · </span>
              {check.value}
              {markUnknown(check) ? <span className="text-text-3"> · Unknown</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>,
    document.body
  );
}

function detailClass(check: FitCheck): string {
  if (check.status === "fail") return "text-text-3 line-through decoration-text-3";
  if (check.status === "soft") return "text-text-3";
  if (check.status === "unknown") return "text-text-2";
  return "text-text";
}

function statusWord(status: FitCheck["status"]): string {
  if (status === "fail") return "Does not fit";
  if (status === "soft") return "Partial";
  if (status === "unknown") return "Unknown";
  return "Fits";
}

function markUnknown(check: FitCheck): boolean {
  if (check.status !== "unknown") return false;
  return !/unknown/i.test(`${check.requirement} ${check.value}`);
}

function place(rect: DOMRect, placement: Placement): { top: number; left: number } {
  const margin = 8;
  const width = 352;
  const height = 220;
  if (placement === "side") {
    let left = rect.right + margin;
    if (left + width > window.innerWidth - margin) left = rect.left - width - margin;
    if (left < margin) left = Math.max(margin, window.innerWidth - width - margin);
    let top = rect.top;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - height - margin);
    return { top, left };
  }
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 4);
  return { top, left };
}
