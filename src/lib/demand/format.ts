import type { DemandSpace, EffectiveRequirement, Format, SizeTier, SpaceType } from "./types";
import { tierForValue } from "./tiers";

export function trimNumber(n: number, digits = 2): string {
  const p = 10 ** digits;
  return String(Math.round(n * p) / p);
}

export function formatSf(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} SF`;
}

export function formatAc(n: number): string {
  return `${trimNumber(n)} ac`;
}

export function rangeText(min: number | null, max: number | null, unit: "ac" | "sf"): string | null {
  const fmt = unit === "ac" ? trimNumber : (n: number) => Math.round(n).toLocaleString("en-US");
  const suffix = unit === "ac" ? "ac" : "SF";
  if (min != null && max != null) return `${fmt(min)}-${fmt(max)} ${suffix}`;
  if (min != null) return `at least ${fmt(min)} ${suffix}`;
  if (max != null) return `up to ${fmt(max)} ${suffix}`;
  return null;
}

const TYPE_WORD: Record<SpaceType, { one: string; many: string; strip: RegExp }> = {
  pad: { one: "Pad", many: "Pads", strip: /^(?:pad)\s+/i },
  inline: { one: "Suite", many: "Suites", strip: /^(?:suite|inline|shop)\s+/i },
  endcap: { one: "Endcap", many: "Endcaps", strip: /^(?:endcap|end[-\s]?cap)\s+/i },
  "land parcel": { one: "Parcel", many: "Parcels", strip: /^(?:parcel|lot)\s+/i },
};

/** "Pads A, B, C, D, 0-1.5 ac" — one label for spaces that share a tenant list. */
export function groupTitle(spaces: DemandSpace[], tierName: string | null): string {
  const types = new Set(spaces.map((s) => s.spaceType));
  let head: string;
  if (spaces.length === 1) {
    head = spaces[0].label;
  } else if (types.size === 1) {
    const type = spaces[0].spaceType;
    const word = TYPE_WORD[type];
    const suffixes = spaces.map((s) => s.label.replace(word.strip, "").trim() || s.label);
    head = `${word.many} ${suffixes.join(", ")}`;
  } else {
    head = spaces.map((s) => s.label).join(", ");
  }
  return tierName ? `${head}, ${tierName}` : head;
}

export function sharedTierName(spaces: DemandSpace[], tiers: SizeTier[]): string | null {
  if (spaces.length === 0) return null;
  const kind = spaces[0].spaceType === "inline" || spaces[0].spaceType === "endcap" ? "sf" : "acres";
  if (spaces.some((s) => (s.spaceType === "inline" || s.spaceType === "endcap" ? "sf" : "acres") !== kind)) return null;
  const names = new Set<string>();
  for (const space of spaces) {
    const value = kind === "sf" ? space.sf : space.acres;
    if (value == null) return null;
    const tier = tierForValue(value, tiers, kind);
    if (!tier) return null;
    names.add(tier.name);
  }
  return names.size === 1 ? Array.from(names)[0] : null;
}

export function requirementLabel(req: EffectiveRequirement, tiers: SizeTier[]): string {
  const parts: string[] = [];
  if (req.formats.length) parts.push(req.formats.join(", "));
  const acres = rangeText(req.acresMin, req.acresMax, "ac");
  const sf = rangeText(req.sfMin, req.sfMax, "sf");
  if (acres) parts.push(acres);
  if (sf) parts.push(sf);
  const tierNames = tiers.filter((t) => req.tierIds.includes(t.id)).map((t) => t.name);
  if (tierNames.length) parts.push(tierNames.join(", "));
  if (req.driveThruRequired === true) parts.push("drive-thru");
  // Markets are deliberately left out: they are not a matching rule (see MARKETS_ARE_A_RULE in match.ts).
  if (req.spacingMiles != null) parts.push(`spacing ${trimNumber(req.spacingMiles)} mi`);
  if (req.treatedAsInline) parts.push("inline shop");
  return parts.join(" · ") || "No requirement on file";
}

export function isFormat(value: string): value is Format {
  return (
    value === "pad" ||
    value === "inline" ||
    value === "endcap" ||
    value === "junior box" ||
    value === "big box" ||
    value === "ground lease" ||
    value === "BTS"
  );
}
