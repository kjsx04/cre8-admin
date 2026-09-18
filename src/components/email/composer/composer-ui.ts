/**
 * Shared light-tool classes for the email composer column.
 * Uses existing CRE8 tokens only (no second palette).
 */

export const COMPOSER_FIELD =
  "w-full bg-white rounded-card px-3 py-2.5 text-sm text-charcoal placeholder:text-muted-gray/65 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] focus:outline-none focus:shadow-[inset_0_0_0_1px_rgba(140,198,68,0.55)]";

export const COMPOSER_FIELD_SEARCH = `${COMPOSER_FIELD} pl-9`;

export const COMPOSER_PILL =
  "px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors duration-150";

export const COMPOSER_PILL_ON = "bg-green/10 text-charcoal";
export const COMPOSER_PILL_OFF = "bg-white text-medium-gray hover:text-charcoal";
