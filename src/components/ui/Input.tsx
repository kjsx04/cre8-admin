"use client";

import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn, FOCUS_RING } from "./cn";

/** Shared look for every text control: 36px tall, hairline border, one focus ring */
export const CONTROL =
  "w-full rounded-control border border-border bg-surface px-3 text-base text-text " +
  "placeholder:text-text-3 hover:border-border-strong transition-colors duration-150 " +
  "disabled:opacity-50 disabled:bg-surface-2 " +
  FOCUS_RING;

const INVALID = "border-danger hover:border-danger focus-visible:ring-danger/40";

// ── Input ──
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Red border when true (pair with Field's `error`) */
  invalid?: boolean;
  /** Small size (32px) for toolbars and dense rows */
  small?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, small, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(CONTROL, small ? "h-control-sm text-sm" : "h-control", invalid && INVALID, className)}
      {...rest}
    />
  );
});

// ── Textarea ──
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL, "min-h-[96px] py-2 resize-y leading-5", invalid && INVALID, className)}
      {...rest}
    />
  );
});

// ── Select ──
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  small?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, small, className, children, ...rest },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(CONTROL, "appearance-none pr-9 cursor-pointer", small ? "h-control-sm text-sm" : "h-control", invalid && INVALID, className)}
        {...rest}
      >
        {children}
      </select>
      {/* Chevron drawn by us so it matches every browser */}
      <ChevronDown size={16} strokeWidth={1.75} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
    </div>
  );
});
