/**
 * Shared controls for the email composer column and the placement bar.
 *
 * A ChoiceButton is a toggle, not a button, so it keeps its own "pressed in"
 * look rather than borrowing the Button styles. It uses the same design tokens
 * as everything else (surface, border, accent, rounded-control) so the two
 * read as one family instead of two.
 */

import { ButtonHTMLAttributes, ReactNode } from "react";

export const COMPOSER_FIELD =
  "w-full bg-surface rounded-control px-3 py-2.5 text-sm text-text placeholder:text-text-3 border border-border focus:outline-none focus:border-accent-strong focus:ring-2 focus:ring-accent/25";

export const COMPOSER_FIELD_SEARCH = `${COMPOSER_FIELD} pl-9`;

/** 8px choice chip. Shadow/transform only — no color-transition flash. */
export const COMPOSER_CHOICE =
  "inline-flex items-center h-control-sm px-3 rounded-control text-sm font-medium transition-colors duration-150";

/** Recessed: inner shadow + thin brand hairline. */
export const COMPOSER_CHOICE_ON = "bg-surface-2 text-text border border-accent-strong";

/** Soft surface, quiet hairline. */
export const COMPOSER_CHOICE_OFF =
  "bg-surface text-text-2 border border-border hover:text-text hover:border-border-strong";

type ChoiceButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean;
  children: ReactNode;
};

export function ChoiceButton({ selected, children, className = "", type = "button", ...rest }: ChoiceButtonProps) {
  return (
    <button
      type={type}
      className={`${COMPOSER_CHOICE} ${selected ? COMPOSER_CHOICE_ON : COMPOSER_CHOICE_OFF} ${className}`}
      aria-pressed={selected}
      {...rest}
    >
      {children}
    </button>
  );
}
