import type {
  Bucket,
  CategoryDefault,
  ClassifiedTenant,
  DealFlags,
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
import { categoryKey, indexByCategory, isMedicalDental, sameCategory } from "./categories";
import { formatMiles, haversineMiles, usableLocations } from "./geo";
import { checkMarket } from "./markets";
import { standardizeSpaceSize } from "./spaces";

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
 * What a tenant needs, after filling blanks from its category.
 *
 * SIZE RULE — the tenant's own size always takes priority over its category:
 *   - A min or max the tenant has is used as is. The category can only fill in
 *     a bound the tenant left blank (tenant says "at least 1.3 ac", category
 *     typical max is 2 ac → 1.3-2 ac), and never one that contradicts it.
 *   - If the tenant has ANY size of its own in a unit (an SF or acre min or
 *     max, or its own size tier in that unit), the category's size TIERS for
 *     that unit are ignored completely.
 * SF and acres are decided separately, so a tenant with its own building SF
 * still gets its category's acreage.
 *
 * (Before this, a tenant with its own 1-2 ac range still inherited its
 * category's size tiers, and a 4 ac pad sitting in one of those tiers was
 * scored "close" instead of "outside".)
 *
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

  // Which unit each size tier is in.
  const kindOf = new Map(tiers.map((tier) => [tier.id, tier.kind]));
  const ownTiers = tenant.tierIds || [];
  const categoryTiers = category?.tierIds || [];

  /** One unit (SF or acres). The tenant's own numbers first; the category only fills blanks. */
  function sizeFor(kind: "sf" | "acres") {
    const ownMin = (kind === "sf" ? tenant.sfMin : tenant.acresMin) ?? null;
    const ownMax = (kind === "sf" ? tenant.sfMax : tenant.acresMax) ?? null;
    const ownTierIds = ownTiers.filter((id) => kindOf.get(id) === kind);
    const own = ownMin != null || ownMax != null || ownTierIds.length > 0;

    const catMin = (kind === "sf" ? category?.sfMin : category?.acresMin) ?? null;
    const catMax = (kind === "sf" ? category?.sfMax : category?.acresMax) ?? null;

    // A blank bound is filled from the category...
    let min = ownMin ?? catMin;
    let max = ownMax ?? catMax;
    // ...unless that would contradict the tenant's own number (min above max).
    if (min != null && max != null && min > max) {
      if (ownMin != null) max = ownMax;
      else min = ownMin;
    }
    if (ownMin == null && min != null) inherited.push(`${kind}Min`);
    if (ownMax == null && max != null) inherited.push(`${kind}Max`);

    // Size tiers: the tenant's own, or — only when the tenant has no size of
    // its own in this unit at all — the category's.
    let tierIds = ownTierIds;
    if (!own) {
      tierIds = categoryTiers.filter((id) => kindOf.get(id) === kind);
      if (tierIds.length && !inherited.includes("tiers")) inherited.push("tiers");
    }
    return { min, max, tierIds, own };
  }

  const sfSize = sizeFor("sf");
  const acreSize = sizeFor("acres");
  const sfMin = sfSize.min;
  const sfMax = sfSize.max;
  const acresMin = acreSize.min;
  const acresMax = acreSize.max;
  // Tier ids that are not in the tier list at all are kept, so nothing is silently lost.
  const unknownOwnTiers = ownTiers.filter((id) => !kindOf.has(id));
  const tierIds = [...sfSize.tierIds, ...acreSize.tierIds, ...unknownOwnTiers];

  const driveThruRequired = pick(tenant.driveThruRequired, category?.driveThruTypical ?? null, "driveThru", inherited);
  const spacingMiles = pick(tenant.spacingMiles, category?.spacingMiles ?? null, "spacing", inherited);

  const hasSfTier = sfSize.tierIds.length > 0;
  const hasAcreTier = acreSize.tierIds.length > 0;
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

  const azMarkets = (tenant.azMarkets || []).map((m) => String(m || "").trim()).filter(Boolean);

  // Nothing of the tenant's own: no formats, no size, no deal types.
  // (Markets don't count — they are not a matching rule.)
  const anyDealFlag = [tenant.dealLease, tenant.dealBuy, tenant.dealGroundLease, tenant.dealBts, tenant.freestanding, tenant.inline].some(
    (flag) => flag != null
  );
  const nothingOnFile = ownFormats.length === 0 && !sfSize.own && !acreSize.own && unknownOwnTiers.length === 0 && !anyDealFlag;

  return {
    formats: resolved,
    sfMin,
    sfMax,
    acresMin,
    acresMax,
    tierIds,
    driveThruRequired,
    azMarkets,
    spacingMiles,
    treatedAsInline,
    nothingOnFile,
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

/**
 * True when the listing is in one of the tenant's markets, or when there is
 * nothing to check. The reading of both sides is in markets.ts.
 */
export function marketMatches(markets: string[], city: string | null, county: string | null): boolean {
  const result = checkMarket(markets, { city, county });
  return result === "match" || result === "none";
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

type FlagResult = { status: "ok" | "unknown" | "no"; reasons: string[] };

function flagPart(flags: (boolean | null)[], falseReason: string): FlagResult {
  if (flags.some((flag) => flag === true)) return { status: "ok", reasons: [] };
  if (flags.every((flag) => flag === false)) return { status: "no", reasons: [falseReason] };
  return { status: "unknown", reasons: [] };
}

function andParts(parts: FlagResult[]): FlagResult {
  const blocked = parts.filter((part) => part.status === "no");
  if (blocked.length) return { status: "no", reasons: blocked.flatMap((part) => part.reasons) };
  if (parts.some((part) => part.status === "unknown")) return { status: "unknown", reasons: [] };
  return { status: "ok", reasons: [] };
}

function orPaths(paths: FlagResult[]): FlagResult {
  if (paths.some((path) => path.status === "ok")) return { status: "ok", reasons: [] };
  if (paths.some((path) => path.status === "unknown")) return { status: "unknown", reasons: [] };
  const reasons: string[] = [];
  for (const path of paths) {
    for (const reason of path.reasons) if (!reasons.includes(reason)) reasons.push(reason);
  }
  return { status: "no", reasons };
}

function buyPadsReason(flags: DealFlags): string {
  if (flags.dealLease === true && flags.inline === true) return "Leases inline only; does not buy pads";
  return "Does not buy pads";
}

function saleLandPath(flags: DealFlags): FlagResult {
  return andParts([
    flagPart([flags.freestanding], "Does not take freestanding sites"),
    flagPart([flags.dealBuy, flags.dealGroundLease, flags.dealBts], buyPadsReason(flags)),
  ]);
}

function groundLeasePath(flags: DealFlags): FlagResult {
  return andParts([
    flagPart([flags.freestanding], "Does not take freestanding sites"),
    flagPart([flags.dealGroundLease, flags.dealBts], "Does not ground lease"),
  ]);
}

function leaseShopPath(flags: DealFlags): FlagResult {
  return andParts([
    flagPart([flags.inline], "Does not take inline space"),
    flagPart([flags.dealLease], "Does not lease shop space"),
  ]);
}

/**
 * Deal-type and freestanding/inline flags.
 * A required flag that is null stays unknown and does not change the bucket.
 * An explicit false excludes them. A for-sale-or-lease space accepts either path.
 */
export function dealTypeFit(space: DemandSpace, flags: DealFlags): FlagResult {
  const land = space.spaceType === "pad" || space.spaceType === "land parcel";
  const shop = space.spaceType === "inline" || space.spaceType === "endcap";
  if (land && space.deal === "sale") return saleLandPath(flags);
  if (land && space.deal === "lease") return groundLeasePath(flags);
  if (land) return orPaths([saleLandPath(flags), groundLeasePath(flags)]);
  if (shop && space.deal === "sale") {
    return andParts([
      flagPart([flags.inline], "Does not take inline space"),
      flagPart([flags.dealBuy], flags.dealLease === true ? "Leases only; this suite is for sale" : "Does not buy shop space"),
    ]);
  }
  if (shop) return leaseShopPath(flags);
  return { status: "ok", reasons: [] };
}

function spaceNoun(space: DemandSpace): string {
  if (space.spaceType === "pad") return "a pad";
  if (space.spaceType === "land parcel") return "land";
  if (space.spaceType === "endcap") return "an endcap";
  return "shop space";
}

/**
 * Should a tenant's markets list (where it wants new stores) affect the match?
 *
 * OFF (Kevin, Nov 19 2026): most tenants just want good sites, and every CRE8
 * listing is a fit as long as there isn't one of their stores nearby — that
 * part is the spacing rule, which is separate and still on. With this off,
 * markets never exclude a tenant, never lower its rank, and never appear as a
 * reason. The markets stored on each tenant are left untouched.
 *
 * To bring markets back as a rule later, change this to true. The reading of
 * city / county names (markets.ts) is already built and tested.
 */
export const MARKETS_ARE_A_RULE: boolean = false;

export function classifySpace(
  listing: ListingContext,
  rawSpace: DemandSpace,
  tenant: TenantInput,
  category: CategoryDefault | null,
  tiers: SizeTier[],
  locations: TenantLocation[],
  override: SpaceOverride | null
): ClassifiedTenant {
  // Pads and land are always compared in acres (a pad typed in SF is converted).
  const space = standardizeSpaceSize(rawSpace);
  const requirement = effectiveRequirement(tenant, category, tiers);
  const hard: string[] = [];
  const soft: string[] = [];
  const notes: string[] = [];

  if (requirement.treatedAsInline) notes.push("SF only, so this is inline shop space");

  const optimal = new Set(OPTIMAL_FORMATS[space.spaceType]);
  const possible = new Set(POSSIBLE_FORMATS[space.spaceType]);
  const hitOptimal = requirement.formats.filter((f) => optimal.has(f));
  const hitPossible = requirement.formats.filter((f) => possible.has(f));
  // A blank format is a fit. Only a real format that misses the space is a problem.
  let formatOk = true;
  if (requirement.formats.length > 0 && hitOptimal.length === 0 && hitPossible.length === 0) {
    hard.push(`Wants ${requirement.formats.join(", ")}; this is ${spaceNoun(space)}`);
    formatOk = false;
  } else if (requirement.formats.length > 0 && hitOptimal.length === 0) {
    soft.push(`Wants ${hitPossible.join(", ")}; listing reads as ${spaceNoun(space)}`);
  }

  const dealFit = dealTypeFit(space, tenant);
  if (dealFit.status === "no") hard.push(...dealFit.reasons);

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
  else if (size.fit === "close") soft.push(sizeReason);
  else if (size.fit === "inside") notes.push(sizeReason);
  // The space has a size but there is nothing to compare it with (not on the
  // tenant, not on its category). That is not a size fit, so it cannot be Top.
  else if (value != null && !requirement.nothingOnFile) {
    soft.push(kind === "acres" ? "No acreage requirement on file" : "No SF requirement on file");
  }

  if (requirement.driveThruRequired === true) {
    if (space.driveThru === false) hard.push(`Needs drive-thru; ${subject(space)} has none`);
    else if (space.driveThru === true) notes.push("Drive-thru available");
  }

  // Markets (where a tenant wants new stores) are NOT a matching rule.
  // Most tenants just want good sites, so a listing is never ruled in or out,
  // or moved down, by city or county. See MARKETS_ARE_A_RULE above.
  if (MARKETS_ARE_A_RULE) {
    const market = checkMarket(requirement.azMarkets, listing);
    if (market === "miss") {
      hard.push("Not in this market");
    } else if (market === "match" && listing.city) {
      notes.push(listing.cityGuessed ? `In this market (near ${listing.city})` : `In this market (${listing.city})`);
    } else if (market === "unknown") {
      soft.push("Listing has no city on file; market not checked");
    }
  }

  const spacingReason = spacingConflict(listing, requirement.spacingMiles, locations);
  if (spacingReason) hard.push(spacingReason);

  if (formatOk && requirement.formats.length > 0 && space.deal === "sale" && requirement.formats.every((f) => SHOP_FORMATS.includes(f))) {
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
  if (formatOk && listing.propertyFamily === "office" && !isMedicalDental(tenant.category)) soft.push("Property type is Office");
  if (formatOk && listing.propertyFamily === "medical" && !isMedicalDental(tenant.category)) soft.push("Property type is Medical");

  // storeCount is the per-tenant total from one grouped count, not a scan of
  // every location row. Zero locations can never be Top. A hard miss still excludes.
  if (tenant.storeCount <= 0) soft.unshift("No locations");

  // A tenant with nothing of its own on file was only ever compared with its
  // category's typical numbers. That is a lead to research, not a Top fit.
  if (requirement.nothingOnFile) soft.unshift("Nothing on file for this tenant; category defaults used");

  let bucket: Bucket = hard.length ? "excluded" : soft.length ? "possible" : "optimal";
  if (override?.decision === "exclude") {
    bucket = "excluded";
    hard.unshift(override.reason?.trim() ? `Excluded by override: ${override.reason.trim()}` : "Excluded by override");
  } else if (override?.decision === "include") {
    bucket = "optimal";
    notes.unshift(override.reason?.trim() ? `Included by override: ${override.reason.trim()}` : "Included by override");
  }
  if (tenant.storeCount <= 0 && bucket === "optimal") bucket = "possible";

  const reasons = (bucket === "excluded" ? [...hard, ...soft] : bucket === "possible" ? [...soft, ...notes] : [...notes]).filter(Boolean);
  if (reasons.length === 0) reasons.push("Fits format, size, and market");

  let score = 100;
  if (size.fit === "inside") score += 10;
  if (size.fit === "close") score -= 12;
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
  const defaultsByCategory = indexByCategory(args.defaults);
  const active = args.tenants.filter((t) => t.active);
  const locationsByTenant = new Map<string, TenantLocation[]>();
  for (const location of args.locations) {
    const list = locationsByTenant.get(location.tenantId);
    if (list) list.push(location);
    else locationsByTenant.set(location.tenantId, [location]);
  }
  return args.spaces.map((space) => {
    const tenants = active
      .map((tenant) =>
        classifySpace(
          args.listing,
          space,
          tenant,
          defaultsByCategory.get(categoryKey(tenant.category)) ?? null,
          args.tiers,
          locationsByTenant.get(tenant.id) || [],
          args.overrides.find((o) => o.spaceId === space.id && o.tenantId === tenant.id) ?? null
        )
      )
      .sort(byScore);
    return { space: standardizeSpaceSize(space), tenants };
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
function tierKey(rawSpace: DemandSpace, tiers: SizeTier[]): string {
  const space = standardizeSpaceSize(rawSpace);
  const kind = space.spaceType === "inline" || space.spaceType === "endcap" ? "sf" : "acres";
  const value = kind === "sf" ? space.sf : space.acres;
  if (value == null) return `${kind}:unknown`;
  return tierForValue(value, tiers, kind)?.id || `${kind}:none`;
}

export function groupSpaceMatches(matches: SpaceMatch[], tiers: SizeTier[]): SpaceGroup[] {
  const groups: SpaceGroup[] = [];
  for (const match of matches) {
    // Same tenant set on two sizes is still two matches when the tiers differ.
    const key = `${tierKey(match.space, tiers)}:${signature(match.tenants)}`;
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
  const defaults = indexByCategory(args.defaults);
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
        .filter((t) => sameCategory(t.category, self.category))
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
  const formats = effectiveRequirement(candidate, defaults.get(categoryKey(candidate.category)) ?? null, tiers).formats;
  const optimal = new Set(OPTIMAL_FORMATS[space.spaceType]);
  const possible = new Set(POSSIBLE_FORMATS[space.spaceType]);
  const selfFormats = effectiveRequirement(self, defaults.get(categoryKey(self.category)) ?? null, tiers).formats;
  return formats.some((f) => (optimal.has(f) || possible.has(f)) && selfFormats.includes(f));
}

export function requirementText(req: EffectiveRequirement, tiers: SizeTier[]): string {
  return requirementLabel(req, tiers);
}
