import type { SizeTier, TierKind } from "./types";

/**
 * Default size tiers.
 *
 * Max is exclusive, so a value on the boundary belongs to the tier that starts
 * there: 1.5 ac is "1.5-2.5 ac", 10 ac is "10+ ac", 1,500 SF is "1,500-3,000 SF".
 * The size_tiers table is editable; matching uses whatever is stored.
 */
export const DEFAULT_TIERS: Omit<SizeTier, "id">[] = [
  { name: "<1,500 SF", kind: "sf", minValue: null, maxValue: 1500, sortOrder: 10 },
  { name: "1,500-3,000 SF", kind: "sf", minValue: 1500, maxValue: 3000, sortOrder: 20 },
  { name: "3,000-6,000 SF", kind: "sf", minValue: 3000, maxValue: 6000, sortOrder: 30 },
  { name: "6,000-15,000 SF", kind: "sf", minValue: 6000, maxValue: 15000, sortOrder: 40 },
  { name: "15,000+ SF", kind: "sf", minValue: 15000, maxValue: null, sortOrder: 50 },
  { name: "0-1.5 ac", kind: "acres", minValue: 0, maxValue: 1.5, sortOrder: 110 },
  { name: "1.5-2.5 ac", kind: "acres", minValue: 1.5, maxValue: 2.5, sortOrder: 120 },
  { name: "2.5-5 ac", kind: "acres", minValue: 2.5, maxValue: 5, sortOrder: 130 },
  { name: "5-10 ac", kind: "acres", minValue: 5, maxValue: 10, sortOrder: 140 },
  { name: "10+ ac", kind: "acres", minValue: 10, maxValue: null, sortOrder: 150 },
];

export function tierContains(tier: SizeTier, value: number): boolean {
  if (tier.minValue != null && value < tier.minValue) return false;
  if (tier.maxValue != null && value >= tier.maxValue) return false;
  return true;
}

export function tiersOfKind(tiers: SizeTier[], kind: TierKind): SizeTier[] {
  return tiers.filter((t) => t.kind === kind).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function tierForValue(value: number, tiers: SizeTier[], kind: TierKind): SizeTier | null {
  return tiersOfKind(tiers, kind).find((t) => tierContains(t, value)) ?? null;
}

/** 0 if the value sits in a tagged tier, 1 if it sits in a neighbor, else null when it isn't adjacent. */
export function taggedTierDistance(value: number, tierIds: string[], tiers: SizeTier[], kind: TierKind): number | null {
  const ordered = tiersOfKind(tiers, kind);
  const index = ordered.findIndex((t) => tierContains(t, value));
  if (index < 0) return null;
  const tagged = new Set(tierIds);
  if (tagged.has(ordered[index].id)) return 0;
  let best = Infinity;
  ordered.forEach((t, i) => {
    if (tagged.has(t.id)) best = Math.min(best, Math.abs(i - index));
  });
  return best === Infinity ? null : best;
}
