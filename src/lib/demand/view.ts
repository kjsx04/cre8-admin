import type { Bucket, Deal, InterestStatus, OverrideDecision, Relation, SpaceType, TierKind } from "./types";

export interface ContactView {
  id: string;
  contactType: "in_house" | "broker";
  name: string;
  title: string | null;
  firmName: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  confidence: string | null;
}

export interface InterestView {
  spaceId: string;
  status: InterestStatus;
  notes: string | null;
}

export interface OverrideView {
  spaceId: string;
  decision: OverrideDecision;
  reason: string | null;
}

export interface PitchView {
  tenantId: string;
  brandName: string;
  category: string;
  why: string;
}

export interface TenantMatchView {
  tenantId: string;
  brandName: string;
  category: string;
  subcategory: string | null;
  bucket: Bucket;
  score: number;
  reasons: string[];
  requirement: string;
  dealLease: boolean | null;
  dealBuy: boolean | null;
  dealGroundLease: boolean | null;
  dealBts: boolean | null;
  freestanding: boolean | null;
  inline: boolean | null;
  dealTypesSource: string | null;
  dealTypesConfidence: "High" | "Medium" | "Low" | null;
  researchStatus: string | null;
  lastResearched: string | null;
  storeCount: number;
  contacts: ContactView[];
  interests: InterestView[];
  overrides: OverrideView[];
  alsoPitch: PitchView[];
}

export interface SpaceView {
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
  hasGeometry: boolean;
}

export interface GroupView {
  key: string;
  title: string;
  tierName: string | null;
  spaces: SpaceView[];
  optimal: TenantMatchView[];
  possible: TenantMatchView[];
  excluded: TenantMatchView[];
}

export interface ListingSummary {
  id: string;
  name: string;
  city: string | null;
  county: string | null;
  address: string;
  acres: number | null;
  buildingSf: number | null;
  listingType: string;
  propertyType: string;
  status: string;
  sold: boolean;
  lat: number | null;
  lng: number | null;
}

export interface MatchResponse {
  listing: ListingSummary;
  spacesSeeded: boolean;
  groups: GroupView[];
}

export interface ReverseHit {
  listingId: string;
  listingName: string;
  city: string | null;
  title: string;
  reasons: string[];
  score: number;
}

export interface ReverseResponse {
  tenant: { id: string; brandName: string; category: string; requirement: string };
  optimal: ReverseHit[];
  possible: ReverseHit[];
  excluded: ReverseHit[];
}

export interface MapTenant {
  id: string;
  brandName: string;
  category: string;
  spacingMiles: number | null;
  locations: { id: string; name: string | null; lat: number; lng: number }[];
}

export interface MapResponse {
  listing: { id: string; name: string; city: string | null; lat: number | null; lng: number | null };
  /** Parcel polygon when a county service returned one. */
  parcel: { type: "Feature"; geometry: { type: string; coordinates: unknown } } | null;
  /** Pad / suite outlines already stored on listing_spaces. */
  spaceOutlines: { id: string; label: string; geometry: unknown }[];
  note: string | null;
  tenants: MapTenant[];
}

export interface FirmView {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
}

export interface TenantAdminView {
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
  requirementSource: string | null;
  requirementDate: string | null;
  notes: string | null;
  active: boolean;
  dealLease: boolean | null;
  dealBuy: boolean | null;
  dealGroundLease: boolean | null;
  dealBts: boolean | null;
  freestanding: boolean | null;
  inline: boolean | null;
  dealTypesSource: string | null;
  dealTypesConfidence: "High" | "Medium" | "Low" | null;
  researchStatus: string | null;
  researchPriority: number | null;
  lastResearched: string | null;
  storeCount: number;
  contacts: ContactView[];
  relationships: { id: string; relatedTenantId: string; relation: Relation }[];
}

export interface ResearchLogView {
  id: string;
  tenantId: string | null;
  brandName: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  source: string | null;
  confidence: string | null;
  researchedAt: string | null;
  researchedBy: string | null;
}

export interface CategoryAdminView {
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

export interface TierAdminView {
  id: string;
  name: string;
  kind: TierKind;
  minValue: number | null;
  maxValue: number | null;
  sortOrder: number;
}

export interface CatalogResponse {
  tenants: TenantAdminView[];
  firms: FirmView[];
  categories: CategoryAdminView[];
  tiers: TierAdminView[];
  recentResearch: ResearchLogView[];
}
