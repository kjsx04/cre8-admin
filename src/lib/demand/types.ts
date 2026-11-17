/**
 * Demand domain types.
 *
 * The database uses snake_case. Everything in this folder speaks camelCase
 * so the matcher and the tests don't depend on a row shape.
 */

export const FORMATS = ["pad", "inline", "endcap", "junior box", "big box", "ground lease", "BTS"] as const;
export type Format = (typeof FORMATS)[number];

export const LAND_FORMATS: Format[] = ["pad", "ground lease", "BTS"];
export const SHOP_FORMATS: Format[] = ["inline", "endcap", "junior box", "big box"];

export const SPACE_TYPES = ["pad", "inline", "endcap", "land parcel"] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export type Deal = "sale" | "lease" | "both";
export type Bucket = "optimal" | "possible" | "excluded";
export type ContactType = "in_house" | "broker";
export type Confidence = "High" | "Medium" | "Low";
export type InterestStatus = "submitted" | "interested" | "touring" | "LOI" | "passed";
export type OverrideDecision = "include" | "exclude";
export type TierKind = "sf" | "acres";
export type Relation = "competitor" | "similar" | "co_tenant";

export interface SizeTier {
  id: string;
  name: string;
  kind: TierKind;
  /** Inclusive. Null means no lower bound. */
  minValue: number | null;
  /** Exclusive. Null means no upper bound. A value sitting on the edge belongs to the next tier. */
  maxValue: number | null;
  sortOrder: number;
}

export interface TenantInput {
  id: string;
  brandName: string;
  category: string;
  subcategory: string | null;
  formats: string[];
  sfMin: number | null;
  sfMax: number | null;
  acresMin: number | null;
  acresMax: number | null;
  tierIds: string[];
  driveThruRequired: boolean | null;
  azMarkets: string[];
  spacingMiles: number | null;
  active: boolean;
}

export interface CategoryDefault {
  category: string;
  formats: string[];
  sfMin: number | null;
  sfMax: number | null;
  acresMin: number | null;
  acresMax: number | null;
  tierIds: string[];
  driveThruTypical: boolean | null;
  spacingMiles: number | null;
}

export interface TenantLocation {
  id: string;
  tenantId: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
}

export interface TenantRelationship {
  id: string;
  tenantId: string;
  relatedTenantId: string;
  relation: Relation;
}

export interface DemandSpace {
  id: string;
  label: string;
  spaceType: SpaceType;
  acres: number | null;
  sf: number | null;
  driveThru: boolean | null;
  deal: Deal;
  priceRate: string | null;
  status: string | null;
  notes: string | null;
  sortOrder: number;
  /** GeoJSON geometry, when a pad outline exists. Matching ignores it. */
  geometry?: unknown;
}

export interface ListingContext {
  id: string;
  name: string;
  city: string | null;
  county: string | null;
  marketLabel: string;
  lat: number | null;
  lng: number | null;
  zoning: string | null;
  propertyType: string;
  /** industrial / office / medical buildings are a soft mismatch for retail tenants. */
  propertyFamily: "retail" | "land" | "industrial" | "office" | "medical" | "other";
}

export interface SpaceOverride {
  spaceId: string;
  tenantId: string;
  decision: OverrideDecision;
  reason: string | null;
}

export interface EffectiveRequirement {
  formats: Format[];
  sfMin: number | null;
  sfMax: number | null;
  acresMin: number | null;
  acresMax: number | null;
  tierIds: string[];
  driveThruRequired: boolean | null;
  azMarkets: string[];
  spacingMiles: number | null;
  /** True when an SF-only requirement was treated as inline shop, not pad / ground lease / BTS. */
  treatedAsInline: boolean;
  inherited: string[];
}

export type SizeFit = "inside" | "close" | "outside" | "unknown";

export interface ClassifiedTenant {
  tenantId: string;
  bucket: Bucket;
  score: number;
  reasons: string[];
  requirement: EffectiveRequirement;
}

export interface SpaceMatch {
  space: DemandSpace;
  tenants: ClassifiedTenant[];
}

export interface SpaceGroup {
  key: string;
  title: string;
  tierName: string | null;
  spaces: DemandSpace[];
  /** Same order for every space in the group — the sets match, so the first space speaks for the group. */
  tenants: ClassifiedTenant[];
}
