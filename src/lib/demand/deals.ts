import type { DealFlags } from "./types";

/** The six deal flags, in the order the list and the editor show them. */
export const DEAL_FIELDS: { key: "dealLease" | "dealBuy" | "dealGroundLease" | "dealBts" | "freestanding" | "inline"; label: string }[] = [
  { key: "dealLease", label: "Rent" },
  { key: "dealBuy", label: "Buy" },
  { key: "dealGroundLease", label: "Ground lease" },
  { key: "dealBts", label: "BTS" },
  { key: "freestanding", label: "Freestanding" },
  { key: "inline", label: "Inline" },
];

/** Labels the tenant will do. No and unknown are omitted. */
export function yesDealLabels(flags: DealFlags | null | undefined): string[] {
  if (!flags) return [];
  return DEAL_FIELDS.filter((field) => flags[field.key] === true).map((field) => field.label);
}
