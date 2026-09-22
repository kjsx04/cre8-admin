"use client";

import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";
import IconButton from "./IconButton";
import { useLayerBehavior } from "./Modal";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Small text under the title (a status, an address) */
  description?: ReactNode;
  /** Right side of the header, before the × (badges, an edit button) */
  headerActions?: ReactNode;
  /** md 576px · lg 672px · xl 896px */
  width?: "md" | "lg" | "xl";
  /** Sticky button row at the bottom */
  footer?: ReactNode;
  /** Remove the default body padding (for full-bleed content) */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

const WIDTH = { md: "max-w-xl", lg: "max-w-2xl", xl: "max-w-4xl" };

/**
 * SlideOver — detail panel sliding in from the right. Replaces every hand-built
 * "fixed inset-0 flex justify-end" panel.
 *   <SlideOver open={!!deal} onClose={close} title={deal.name} description={deal.address} footer={…}>…</SlideOver>
 */
export default function SlideOver({ open, onClose, title, description, headerActions, width = "md", footer, flush, className, children }: SlideOverProps) {
  useLayerBehavior(open, onClose);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      {/* Panel */}
      <div className={cn("relative w-full h-full bg-surface shadow-modal flex flex-col animate-slide-in-right", WIDTH[width], className)}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            {title && <h2 className="text-md font-semibold text-text truncate">{title}</h2>}
            {description && <div className="text-sm text-text-2 mt-0.5">{description}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0 -mr-2">
            {headerActions}
            <IconButton label="Close" icon={<X size={18} strokeWidth={1.75} />} onClick={onClose} size="sm" />
          </div>
        </div>

        {/* Body */}
        <div className={cn("flex-1 min-h-0 overflow-y-auto", !flush && "px-6 py-5")}>{children}</div>

        {/* Footer */}
        {footer && <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0 bg-surface">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
