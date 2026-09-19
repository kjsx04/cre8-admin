/**
 * Shared light-tool classes for the email composer column.
 *
 * Tokens from the CRE8 Design System in tailwind.config.ts + globals.css:
 *   green #8CC644, charcoal #1A1A1A, subtle-gray #FAFAFA, light-gray #F5F5F5,
 *   rounded-card 8px, rounded-btn 4px.
 * Selected = pressed in (inset shadow). No checks, no green wash.
 */

import { ButtonHTMLAttributes, ReactNode } from "react";

export const COMPOSER_FIELD =
  "w-full bg-white rounded-card px-3 py-2.5 text-sm text-charcoal placeholder:text-muted-gray/65 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] focus:outline-none focus:shadow-[inset_0_0_0_1px_rgba(140,198,68,0.55)]";

export const COMPOSER_FIELD_SEARCH = `${COMPOSER_FIELD} pl-9`;

/** 8px choice chip. Shadow/transform only — no color-transition flash. */
export const COMPOSER_CHOICE =
  "inline-flex items-center px-3 py-1.5 rounded-card text-sm font-medium active:scale-[0.98] transition-[box-shadow,transform,opacity] duration-100";

/** Recessed: inner shadow + thin brand hairline. */
export const COMPOSER_CHOICE_ON =
  "bg-light-gray text-charcoal shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),inset_0_0_0_1px_rgba(140,198,68,0.4)]";

/** Soft surface, quiet hairline. */
export const COMPOSER_CHOICE_OFF =
  "bg-white text-medium-gray shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] hover:text-charcoal hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]";

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
