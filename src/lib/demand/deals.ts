import type { DealFlags } from "./types";

export type DealFlagKey = "dealLease" | "dealBuy" | "dealGroundLease" | "dealBts" | "freestanding" | "inline";

/**
 * Deal types only, in the order the list, the editor, and the other labels use.
 * Buy is Purchase. Ground lease is Ground Lease. Lease is Rent. Build-to-suit is BTS.
 */
export const DEAL_TYPE_FIELDS: { key: DealFlagKey; label: string }[] = [
  { key: "dealBuy", label: "Purchase" },
  { key: "dealGroundLease", label: "Ground Lease" },
  { key: "dealLease", label: "Rent" },
  { key: "dealBts", label: "BTS" },
];

/** Format flags. They feed matching and the editor, and they are not deal types. */
export const FORMAT_FLAG_FIELDS: { key: DealFlagKey; label: string }[] = [
  { key: "freestanding", label: "Freestanding" },
  { key: "inline", label: "Inline" },
];

/** Deal types, then format flags, for the research controls that edit both. */
export const DEAL_FIELDS: { key: DealFlagKey; label: string }[] = [...DEAL_TYPE_FIELDS, ...FORMAT_FLAG_FIELDS];

/** Yes deal types, as Purchase, Ground Lease, Rent, BTS. Format flags are left out. */
export function yesDealLabels(flags: DealFlags | null | undefined): string[] {
  if (!flags) return [];
  return DEAL_TYPE_FIELDS.filter((field) => flags[field.key] === true).map((field) => field.label);
}
