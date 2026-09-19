/**
 * Shared light-tool classes for the email composer column.
 *
 * Tokens from the CRE8 Design System in tailwind.config.ts + globals.css:
 *   green #8CC644, charcoal #1A1A1A, subtle-gray #FAFAFA,
 *   rounded-card 8px, rounded-btn 4px.
 * Selection is a quiet border + soft fill — no green wash, no pill stadium.
 */

import { ButtonHTMLAttributes, ReactNode } from "react";

export const COMPOSER_FIELD =
  "w-full bg-white rounded-card px-3 py-2.5 text-sm text-charcoal placeholder:text-muted-gray/65 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] focus:outline-none focus:shadow-[inset_0_0_0_1px_rgba(140,198,68,0.55)]";

export const COMPOSER_FIELD_SEARCH = `${COMPOSER_FIELD} pl-9`;

/** 8px choice chip — matches rounded-card. No color transition (avoids the green flash). */
export const COMPOSER_CHOICE =
  "inline-flex items-center px-3 py-1.5 rounded-card text-sm font-medium border";

export const COMPOSER_CHOICE_ON =
  "bg-subtle-gray text-charcoal border-charcoal/20";

export const COMPOSER_CHOICE_OFF =
  "bg-white text-medium-gray border-border-light hover:border-border-medium hover:text-charcoal";

export function ChoiceCheck() {
  return (
    <svg className="mr-1.5 text-green shrink-0" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.4 6.2L5 8.6 9.6 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
      {selected && <ChoiceCheck />}
      {children}
    </button>
  );
}
