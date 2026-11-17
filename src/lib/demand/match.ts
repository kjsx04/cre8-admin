import type {
  Bucket,
  CategoryDefault,
  ClassifiedTenant,
  DemandSpace,
  EffectiveRequirement,
  Format,
  ListingContext,
  SizeFit,
  SizeTier,
  SpaceGroup,
  SpaceMatch,
  SpaceOverride,
  SpaceType,
  TenantInput,
  TenantLocation,
  TenantRelationship,
} from "./types";
import { LAND_FORMATS, SHOP_FORMATS } from "./types";
import { taggedTierDistance, tierForValue, tiersOfKind } from "./tiers";
import { formatAc, formatSf, groupTitle, isFormat, rangeText, requirementLabel, sharedTierName } from "./format";
import { formatMiles, haversineMiles, usableLocations } from "./geo";

const FORMAT_ALIASES: Record<string, Format> = {
  pad: "pad",
  inline: "inline",
  endcap: "endcap",
  "end cap": "endcap",
  "end-cap": "endcap",
  "junior box": "junior box",
  "junior-box": "junior box",
  juniorbox: "junior box",
  "big box": "big box",
  "big-box": "big box",
  bigbox: "big box",
  "ground lease": "ground lease",
  "ground-lease": "ground lease",
  groundlease: "ground lease",
  bts: "BTS",
  "build to suit": "BTS",
  "build-to-suit": "BTS",
};

export function normalizeFormats(values: string[] | null | undefined): Format[] {
  const out: Format[] = [];
  for (const raw of values || []) {
    const key = raw.trim().toLowerCase();
    const format = FORMAT_ALIASES[key];
    if (format && !out.includes(format)) out.push(format);
    else if (isFormat(raw) && !out.includes(raw)) out.push(raw);
  }
  return out;
}

function pick<T>(own: T | null | undefined, fallback: T | null | undefined, name: string, inherited: string[]): T | null {
  if (own != null) return own;
  if (fallback != null) {
    inherited.push(name);
    return fallback;
  }
  return null;
}

/**
 * A tenant's own numbers win. Empty / null fields fall back to the category.
 * An SF range with no acreage and no pad, ground lease, or BTS is inline shop.
 */
export function effectiveRequirement(
  tenant: TenantInput,
  category: CategoryDefault | null,
  tiers: SizeTier[]
): EffectiveRequirement {
  const inherited: string[] = [];
  const ownFormats = normalizeFormats(tenant.formats);
  const formats = ownFormats.length
    ? ownFormats
    : (inherited.push("formats"), normalizeFormats(category?.formats));

  let sfMin = pick(tenant.sfMin, category?.sfMin, "sfMin", inherited);
  let sfMax = pick(tenant.sfMax, category?.sfMax, "sfMax", inherited);
  let acresMin = pick(tenant.acresMin, category?.acresMin, "acresMin", inherited);
  let acresMax = pick(tenant.acresMax, category?.acresMax, "acresMax", inherited);
  if (sfMin != null && sfMax != null && sfMin > sfMax) {
    if (tenant.sfMin != null) sfMax = tenant.sfMax;
    else sfMin = tenant.sfMin;
  }
  if (acresMin != null && acresMax != null && acresMin > acresMax) {
    if (tenant.acresMin != null) acresMax = tenant.acresMax;
    else acresMin = tenant.acresMin;
  }

  const tierIds = tenant.tierIds.length
    ? tenant.tierIds
    : (category?.tierIds.length ? (inherited.push("tiers"), category.tierIds) : []);
  const driveThruRequired = pick(tenant.driveThruRequired, category?.driveThruTypical ?? null, "driveThru", inherited);
  const spacingMiles = pick(tenant.spacingMiles, category?.spacingMiles ?? null, "spacing", inherited);

  const hasSfTier = tiers.some((t) => t.kind === "sf" && tierIds.includes(t.id));
  const hasAcreTier = tiers.some((t) => t.kind === "acres" && tierIds.includes(t.id));
  const hasSf = sfMin != null || sfMax != null || hasSfTier;
  const hasAcres = acresMin != null || acresMax != null || hasAcreTier;
  const landish = formats.filter((f) => LAND_FORMATS.includes(f));
  const shopish = formats.filter((f) => SHOP_FORMATS.includes(f));

  let resolved = formats;
  let treatedAsInline = false;
  if (hasSf && !hasAcres && landish.length === 0) {
    resolved = shopish.length ? shopish : ["inline"];
    treatedAsInline = shopish.length === 0;
  } else if (resolved.length === 0 && hasAcres && !hasSf) {
    resolved = ["pad", "ground lease", "BTS"];
  }

  return {
    formats: resolved,
    sfMin,
    sfMax,
    acresMin,
    acresMax,
    tierIds,
    driveThruRequired,
    azMarkets: tenant.azMarkets.map((m) => m.trim()).filter(Boolean),
    spacingMiles,
    treatedAsInline,
    inherited,
  };
}

export function rangeFit(value: number, min: number | null, max: number | null): Exclude<SizeFit, "unknown"> {
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  if (value >= lo && value <= hi) return "inside";
  const bound = value < lo ? lo : hi;
  const tol = Math.abs(bound) * 0.2;
  return Math.abs(value - bound) <= tol ? "close" : "outside";
}

interface SizeResult {
  fit: SizeFit;
  by: "range" | "tier" | "both" | "none";
  tierName: string | null;
  /** The tier names the requirement was checked against, when the fit came from tiers. */
  against: string | null;
}

export function evaluateSize(
  value: number | null,
  min: number | null,
  max: number | null,
  tierIds: string[],
  tiers: SizeTier[],
  kind: "sf" | "acres"
): SizeResult {
  const ordered = tiersOfKind(tiers, kind);
  const tagged = ordered.filter((t) => tierIds.includes(t.id));
  const against = tagged.length ? tagged.map((t) => t.name).join(" or ") : null;
  const hasRange = min != null || max != null;
  if (value == null) return { fit: "unknown", by: "none", tierName: null, against };
  const containing = tierForValue(value, tiers, kind);
  const inTagged = !!containing && tierIds.includes(containing.id);
  const fit = hasRange ? rangeFit(value, min, max) : null;
  const tierName = containing?.name ?? null;

  if (!hasRange && tagged.length === 0) return { fit: "unknown", by: "none", tierName, against };
  if (hasRange && fit === "inside") return { fit: "inside", by: inTagged ? "both" : "range", tierName, against };
  if (!hasRange && inTagged) return { fit: "inside", by: "tier", tierName, against };
  if (hasRange && inTagged) return { fit: "close", by: "both", tierName, against };
  if (hasRange && fit === "close") return { fit: "close", by: "range", tierName, against };
  if (!hasRange && tagged.length) {
    const distance = taggedTierDistance(value, tierIds, tiers, kind);
    if (distance === 1) return { fit: "close", by: "tier", tierName, against };
    return { fit: "outside", by: "tier", tierName, against };
  }
  return { fit: "outside", by: "range", tierName, against };
}

const METRO = new Set([
  "phoenix", "scottsdale", "mesa", "tempe", "chandler", "gilbert", "glendale", "peoria",
  "surprise", "goodyear", "avondale", "buckeye", "queen creek", "san tan valley",
  "apache junction", "fountain hills", "paradise valley", "cave creek", "carefree",
  "el mirage", "tolleson", "litchfield park", "sun city", "youngtown", "maricopa",
]);

function norm(value: string): string {
  return value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

export function marketMatches(markets: string[], city: string | null, county: string | null): boolean {
  if (markets.length === 0) return true;
  const cityKey = city ? norm(city) : "";
  const countyKey = county ? norm(county.replace(/\s+county$/i, "")) : "";
  return markets.some((market) => {
    const key = norm(market);
    if (!key) return false;
    if (["phoenix metro", "metro phoenix", "phoenix msa", "phoenix valley", "the valley", "valley"].includes(key)) {
      return METRO.has(cityKey);
    }
    if (cityKey && key === cityKey) return true;
    if (countyKey && (key === countyKey || key === `${countyKey} county`)) return true;
    if (cityKey && key.length >= 4 && (key.includes(cityKey) || cityKey.includes(key))) return true;
    return false;
  });
}

function dimension(space: DemandSpace): "acres" | "sf" {
  return space.spaceType === "inline" || space.spaceType === "endcap" ? "sf" : "acres";
}

function subject(space: DemandSpace): string {
  if (space.spaceType === "pad") return "pad";
  if (space.spaceType === "land parcel") return "site";
  return "suite";
}

function valueText(value: number, kind: "acres" | "sf"): string {
  return kind === "acres" ? formatAc(value) : formatSf(value);
}

const OPTIMAL_FORMATS: Record<SpaceType, Format[]> = {
  pad: ["pad", "ground lease", "BTS"],
  "land parcel": ["pad", "ground lease", "BTS"],
  endcap: ["endcap", "inline"],
  inline: ["inline", "junior box", "big box"],
};
const POSSIBLE_FORMATS: Record<SpaceType, Format[]> = {
  pad: [],
  "land parcel": [],
  endcap: ["junior box"],
  inline: ["endcap"],
};

function spaceNoun(space: DemandSpace): string {
  if (space.spaceType === "pad") return "a pad";
  if (space.spaceType === "land parcel") return "land";
  if (space.spaceType === "endcap") return "an endcap";
  return "shop space";
}

export function classifySpace(
  listing: ListingContext,
  space: DemandSpace,
  tenant: TenantInput,
  category: CategoryDefault | null,
  tiers: SizeTier[],
  locations: TenantLocation[],
  override: SpaceOverride | null
): ClassifiedTenant {
  const requirement = effectiveRequirement(tenant, category, tiers);
  const hard: string[] = [];
  const soft: string[] = [];
  const notes: string[] = [];

  if (requirement.treatedAsInline) notes.push("SF only, so this is inline shop space");

  const optimal = new Set(OPTIMAL_FORMATS[space.spaceType]);
  const possible = new Set(POSSIBLE_FORMATS[space.spaceType]);
  const hitOptimal = requirement.formats.filter((f) => optimal.has(f));
  const hitPossible = requirement.formats.filter((f) => possible.has(f));
  let formatOk = true;
  if (requirement.formats.length === 0) {
    soft.push("No format on the requirement");
    formatOk = false;
  } else if (hitOptimal.length === 0 && hitPossible.length === 0) {
    hard.push(`Wants ${requirement.formats.join(", ")}; this is ${spaceNoun(space)}`);
    formatOk = false;
  } else if (hitOptimal.length === 0) {
    soft.push(`Wants ${hitPossible.join(", ")}; listing reads as ${spaceNoun(space)}`);
  }

  const kind = dimension(space);
  const value = kind === "acres" ? space.acres : space.sf;
  const size = evaluateSize(
    value,
    kind === "acres" ? requirement.acresMin : requirement.sfMin,
    kind === "acres" ? requirement.acresMax : requirement.sfMax,
    requirement.tierIds,
    tiers,
    kind
  );
  const sizeReason = describeSize(space, kind, value, requirement, size);
  if (size.fit === "outside") hard.push(sizeReason);
  else if (size.fit === "close" || size.fit === "unknown") soft.push(sizeReason);
  else if (size.fit === "inside") notes.push(sizeReason);

  if (requirement.driveThruRequired === true) {
    if (space.driveThru === false) hard.push(`Needs drive-thru; ${subject(space)} has none`);
    else if (space.driveThru == null) soft.push("Needs drive-thru; listing doesn't say");
    else notes.push("Drive-thru available");
  }

  if (requirement.azMarkets.length) {
    if (!marketMatches(requirement.azMarkets, listing.city, listing.county)) hard.push("Not in this market");
    else if (listing.city) notes.push(`In this market (${listing.city})`);
  }

  const spacingReason = spacingConflict(listing, requirement.spacingMiles, locations);
  if (spacingReason) hard.push(spacingReason);

  if (formatOk && space.deal === "sale" && requirement.formats.every((f) => SHOP_FORMATS.includes(f))) {
    soft.push("Listed for sale; this tenant typically leases");
  }
  if (
    formatOk &&
    space.deal === "lease" &&
    requirement.formats.includes("BTS") &&
    !requirement.formats.includes("pad") &&
    !requirement.formats.includes("ground lease")
  ) {
    soft.push("Listed for lease; build-to-suit usually buys the land");
  }

  if (formatOk && listing.propertyFamily === "industrial") soft.push("Property type is Industrial");
  if (formatOk && listing.propertyFamily === "office" && tenant.category !== "medical/dental") soft.push("Property type is Office");
  if (formatOk && listing.propertyFamily === "medical" && tenant.category !== "medical/dental") soft.push("Property type is Medical");

  let bucket: Bucket = hard.length ? "excluded" : soft.length ? "possible" : "optimal";
  if (override?.decision === "exclude") {
    bucket = "excluded";
    hard.unshift(override.reason?.trim() ? `Excluded by override: ${override.reason.trim()}` : "Excluded by override");
  } else if (override?.decision === "include") {
    bucket = "optimal";
    notes.unshift(override.reason?.trim() ? `Included by override: ${override.reason.trim()}` : "Included by override");
  }

  const reasons = (bucket === "excluded" ? [...hard, ...soft] : bucket === "possible" ? [...soft, ...notes] : [...notes]).filter(Boolean);
  if (reasons.length === 0) reasons.push("Fits format, size, and market");

  let score = 100;
  if (size.fit === "inside") score += 10;
  if (size.fit === "close") score -= 12;
  if (size.fit === "unknown") score -= 6;
  score -= soft.length * 8;
  score -= hard.length * 30;

  return { tenantId: tenant.id, bucket, score, reasons, requirement };
}

function describeSize(
  space: DemandSpace,
  kind: "acres" | "sf",
  value: number | null,
  requirement: EffectiveRequirement,
  size: SizeResult
): string {
  const noun = subject(space);
  const range = rangeText(
    kind === "acres" ? requirement.acresMin : requirement.sfMin,
    kind === "acres" ? requirement.acresMax : requirement.sfMax,
    kind === "acres" ? "ac" : "sf"
  );
  if (value == null) {
    return kind === "acres" ? `Acreage not on this ${noun}` : "Suite size not on this space";
  }
  const shown = valueText(value, kind);
  if (size.fit === "inside" && size.by === "tier") return `${shown} is in ${size.tierName}`;
  if (size.fit === "inside" && range) {
    const label = noun === "site" ? "Site" : noun === "pad" ? "Pad" : "Suite";
    return `${label} is ${shown} (needs ${range})`;
  }
  if (size.fit === "close" && range && size.tierName && size.by === "both") {
    return `Needs ${range}; ${noun} is ${shown} (still in ${size.tierName})`;
  }
  if ((size.fit === "outside" || size.fit === "close") && range) return `Needs ${range}; ${noun} is ${shown}`;
  if (size.fit === "outside" && size.by === "tier" && size.against) return `${shown} is outside ${size.against}`;
  if (size.fit === "close" && size.by === "tier" && size.against) return `${shown} is next to ${size.against}`;
  if (size.tierName) return `${shown} is in ${size.tierName}`;
  return `${noun} is ${shown}`;
}

function spacingConflict(listing: ListingContext, spacingMiles: number | null, locations: TenantLocation[]): string | null {
  if (spacingMiles == null || spacingMiles <= 0) return null;
  if (listing.lat == null || listing.lng == null) return null;
  const usable = usableLocations(locations);
  if (usable.length === 0) return null;
  let nearest = Infinity;
  for (const loc of usable) {
    nearest = Math.min(nearest, haversineMiles(listing.lat, listing.lng, loc.lat as number, loc.lng as number));
  }
  if (nearest < spacingMiles) {
    return `Existing store ${formatMiles(nearest)} mi away; spacing ${formatMiles(spacingMiles)} mi`;
  }
  return null;
}

export function matchSpaces(args: {
  listing: ListingContext;
  spaces: DemandSpace[];
  tenants: TenantInput[];
  defaults: CategoryDefault[];
  tiers: SizeTier[];
  locations: TenantLocation[];
  overrides: SpaceOverride[];
}): SpaceMatch[] {
  const defaultsByCategory = new Map(args.defaults.map((d) => [d.category, d]));
  const active = args.tenants.filter((t) => t.active);
  return args.spaces.map((space) => {
    const tenants = active
      .map((tenant) =>
        classifySpace(
          args.listing,
          space,
          tenant,
          defaultsByCategory.get(tenant.category) ?? null,
          args.tiers,
          args.locations.filter((l) => l.tenantId === tenant.id),
          args.overrides.find((o) => o.spaceId === space.id && o.tenantId === tenant.id) ?? null
        )
      )
      .sort(byScore);
    return { space, tenants };
  });
}

function byScore(a: ClassifiedTenant, b: ClassifiedTenant): number {
  return b.score - a.score || a.tenantId.localeCompare(b.tenantId);
}

function signature(tenants: ClassifiedTenant[]): string {
  return tenants
    .slice()
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId))
    .map((t) => `${t.tenantId}:${t.bucket}`)
    .join("|");
}

/**
 * Pads that produce the same Optimal / Possible / Excluded sets share one
 * tenant list. A parcel whose set differs stays on its own.
 * Interest does not change the set; an override does.
 */
export function groupSpaceMatches(matches: SpaceMatch[], tiers: SizeTier[]): SpaceGroup[] {
  const groups: SpaceGroup[] = [];
  for (const match of matches) {
    const key = signature(match.tenants);
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.spaces.push(match.space);
    else groups.push({ key, title: "", tierName: null, spaces: [match.space], tenants: match.tenants });
  }
  for (const group of groups) {
    group.spaces.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    group.tierName = sharedTierName(group.spaces, tiers);
    group.title = groupTitle(group.spaces, group.tierName);
    if (group.spaces.length > 1) group.tenants = generalize(group.tenants, group.tierName);
  }
  groups.sort((a, b) => a.spaces[0].sortOrder - b.spaces[0].sortOrder);
  return groups;
}

function generalize(tenants: ClassifiedTenant[], tierName: string | null): ClassifiedTenant[] {
  if (!tierName) return tenants;
  return tenants.map((tenant) => ({
    ...tenant,
    reasons: tenant.reasons.map((reason) =>
      / is in | is outside | is next to |Needs .+; (pad|site|suite) is /.test(reason) && tenant.bucket !== "excluded"
        ? `In the ${tierName} tier`
        : reason
    ),
  }));
}

export interface PitchSuggestion {
  tenantId: string;
  brandName: string;
  category: string;
  why: string;
}

/** Competitors and similar brands, or — when none are linked — same category and a compatible format. */
export function suggestAlsoPitch(args: {
  tenantId: string;
  tenants: TenantInput[];
  defaults: CategoryDefault[];
  tiers: SizeTier[];
  relationships: TenantRelationship[];
  space: DemandSpace;
  buckets: Map<string, Bucket>;
}): PitchSuggestion[] {
  const self = args.tenants.find((t) => t.id === args.tenantId);
  if (!self) return [];
  const defaults = new Map(args.defaults.map((d) => [d.category, d]));
  const active = args.tenants.filter((t) => t.active && t.id !== self.id);
  const linked = new Map<string, string>();
  for (const rel of args.relationships) {
    if (rel.relation === "co_tenant") continue;
    const other = rel.tenantId === self.id ? rel.relatedTenantId : rel.relatedTenantId === self.id ? rel.tenantId : null;
    if (!other || linked.has(other)) continue;
    linked.set(other, rel.relation === "competitor" ? "Competitor" : "Similar");
  }
  const rows = linked.size
    ? active.filter((t) => linked.has(t.id)).map((t) => ({ tenant: t, why: linked.get(t.id) as string }))
    : active
        .filter((t) => t.category === self.category)
        .filter((t) => formatsOverlap(t, self, defaults, args.tiers, args.space))
        .map((t) => ({ tenant: t, why: "Same category, compatible format" }));

  return rows
    .map(({ tenant, why }) => ({
      tenantId: tenant.id,
      brandName: tenant.brandName,
      category: tenant.category,
      why,
      bucket: args.buckets.get(tenant.id) || "excluded",
    }))
    .filter((row) => linked.size > 0 || row.bucket !== "excluded")
    .sort((a, b) => bucketRank(a.bucket) - bucketRank(b.bucket) || a.brandName.localeCompare(b.brandName))
    .slice(0, 8)
    .map(({ tenantId, brandName, category, why }) => ({ tenantId, brandName, category, why }));
}

function bucketRank(bucket: Bucket): number {
  return bucket === "optimal" ? 0 : bucket === "possible" ? 1 : 2;
}

function formatsOverlap(
  candidate: TenantInput,
  self: TenantInput,
  defaults: Map<string, CategoryDefault>,
  tiers: SizeTier[],
  space: DemandSpace
): boolean {
  const formats = effectiveRequirement(candidate, defaults.get(candidate.category) ?? null, tiers).formats;
  const optimal = new Set(OPTIMAL_FORMATS[space.spaceType]);
  const possible = new Set(POSSIBLE_FORMATS[space.spaceType]);
  const selfFormats = effectiveRequirement(self, defaults.get(self.category) ?? null, tiers).formats;
  return formats.some((f) => (optimal.has(f) || possible.has(f)) && selfFormats.includes(f));
}

export function requirementText(req: EffectiveRequirement, tiers: SizeTier[]): string {
  return requirementLabel(req, tiers);
}
