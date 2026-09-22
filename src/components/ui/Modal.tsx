"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";
import IconButton from "./IconButton";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** sm 420px · md 560px · lg 760px */
  size?: "sm" | "md" | "lg";
  /** Buttons row at the bottom, right-aligned */
  footer?: ReactNode;
  /** Hide the × button (when the dialog must be answered) */
  hideClose?: boolean;
  className?: string;
  children?: ReactNode;
}

const SIZE = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]" };

// Stack of open layers (Modal / SlideOver). Only the top one reacts to Escape,
// so a Modal opened from inside a SlideOver closes alone.
const layerStack: symbol[] = [];

/**
 * useLayerBehavior — shared by Modal and SlideOver:
 * Escape closes the TOP layer only, and the page behind stops scrolling while any layer is open.
 */
export function useLayerBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const id = Symbol("layer");
    layerStack.push(id);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && layerStack[layerStack.length - 1] === id) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      const i = layerStack.indexOf(id);
      if (i >= 0) layerStack.splice(i, 1);
      // Restore page scroll only when the last layer closes
      if (layerStack.length === 0) document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}

/**
 * Modal — centered dialog. The only overlay style in the app.
 *   <Modal open={open} onClose={close} title="Delete listing?" footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Delete</Button></>}>
 *     <p>This can't be undone.</p>
 *   </Modal>
 */
export default function Modal({ open, onClose, title, description, size = "md", footer, hideClose, className, children }: ModalProps) {
  useLayerBehavior(open, onClose);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      {/* Panel */}
      <div className={cn("relative w-full bg-surface rounded-modal shadow-modal animate-scale-in flex flex-col max-h-[calc(100vh-2rem)]", SIZE[size], className)}>
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
            <div className="min-w-0">
              {title && <h2 className="text-md font-semibold text-text">{title}</h2>}
              {description && <p className="text-sm text-text-2 mt-1">{description}</p>}
            </div>
            {!hideClose && <IconButton label="Close" icon={<X size={18} strokeWidth={1.75} />} onClick={onClose} size="sm" className="-mr-2 -mt-1" />}
          </div>
        )}

        <div className="px-6 py-4 overflow-y-auto min-h-0 text-sm text-text">{children}</div>

        {footer && <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-1">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
