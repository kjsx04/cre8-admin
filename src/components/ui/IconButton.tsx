"use client";

import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";
import { cn, FOCUS_RING } from "./cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because there is no visible text */
  label: string;
  /** A lucide icon element, size 18 */
  icon: ReactNode;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary";
}

/**
 * IconButton — square button holding one icon (close, more, edit…).
 *   <IconButton label="Close" icon={<X size={18} />} onClick={onClose} />
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = "md", variant = "ghost", className, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type || "button"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-control transition-colors duration-150 shrink-0",
        size === "sm" ? "w-control-sm h-control-sm" : "w-control h-control",
        variant === "ghost"
          ? "text-text-2 hover:bg-surface-2 hover:text-text"
          : "bg-surface text-text border border-border hover:bg-surface-2",
        "disabled:opacity-50 disabled:pointer-events-none",
        FOCUS_RING,
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});

export default IconButton;
