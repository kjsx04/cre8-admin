/**
 * Store-location status.
 *
 * Glenwood's map (glenwood-map `custom_sites.status`) uses `active` for an
 * operating store and `pending` for one that is not open yet. Demand keeps
 * the same field name, `status`, and the same meanings, split the way the
 * Demand map draws them:
 *   open                — Glenwood `active`. Null on an existing row is open.
 *   under_construction  — Glenwood `pending` that is being built.
 *   signed              — committed, not built yet.
 */

export const LOCATION_STATUSES = ["open", "under_construction", "signed"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export const LOCATION_STATUS_LABEL: Record<LocationStatus, string> = {
  open: "Open",
  under_construction: "Under Construction",
  signed: "Signed",
};

/** Line dash in stroke-width units. Null is a solid ring. */
export function ringDash(status: LocationStatus): number[] | null {
  if (status === "under_construction") return [2, 1.5];
  if (status === "signed") return [0.4, 2.2];
  return null;
}

export function locationStatus(value: string | null | undefined): LocationStatus {
  const key = (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "under_construction" || key === "construction" || key === "pending") return "under_construction";
  if (key === "signed") return "signed";
  // open, active (Glenwood), blank, and anything unrecognized stay open.
  return "open";
}
