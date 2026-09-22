"use client";

import Link from "next/link";
import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";
import { cn, FOCUS_RING } from "./cn";
import Spinner from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the icon and disables the button */
  loading?: boolean;
  /** Icon on the left (a lucide icon element) */
  icon?: ReactNode;
  /** Icon on the right */
  iconRight?: ReactNode;
  /** Render as a link instead of a button. External URLs (http…) open as a plain <a>; internal paths use Next's Link. */
  href?: string;
  /** Link target, e.g. "_blank" to open in a new tab (adds rel="noopener noreferrer" automatically) */
  target?: string;
  /** Stretch to the container width */
  block?: boolean;
}

// One recipe per variant. Primary is near-black — green is reserved for status.
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink-hover",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong",
  ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-control-sm px-3 text-sm gap-1.5",
  md: "h-control px-3.5 text-base gap-2",
  lg: "h-control-lg px-4 text-base gap-2",
};

const BASE =
  "inline-flex items-center justify-center font-medium rounded-control transition-colors duration-150 " +
  "whitespace-nowrap select-none disabled:opacity-50 disabled:pointer-events-none";

/**
 * Button — the only button style in the app.
 *   <Button>Save</Button>
 *   <Button variant="secondary" icon={<Plus size={18} />}>New listing</Button>
 *   <Button variant="danger" loading={deleting}>Delete</Button>
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, iconRight, href, target, block, className, children, disabled, type, ...rest },
  ref
) {
  const classes = cn(BASE, VARIANT[variant], SIZE[size], block && "w-full", FOCUS_RING, className);
  const content = (
    <>
      {loading ? <Spinner size="sm" className={variant === "primary" || variant === "danger" ? "border-white/40 border-t-white" : undefined} /> : icon}
      {children}
      {!loading && iconRight}
    </>
  );

  if (href) {
    const external = /^https?:\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("blob:");
    const rel = target === "_blank" ? "noopener noreferrer" : undefined;
    // External links (SharePoint, Word Online, blob downloads) use a plain <a>; app routes use Next Link
    if (external || target) {
      return (
        <a href={href} target={target} rel={rel} className={classes} aria-disabled={disabled || loading}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} aria-disabled={disabled || loading}>
        {content}
      </Link>
    );
  }

  return (
    <button ref={ref} type={type || "button"} className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {content}
    </button>
  );
});

export default Button;
