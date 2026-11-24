/**
 * Small pure helpers the tools share: clean search words, cap rows, turn raw
 * database rows into the short shapes the model sees. No database in here.
 */

export const ROW_CAP = 10;
export const MAX_TEXT = 1500;

export type Capped<T> = { rows: T[]; truncated: boolean; matchCount: number };

/** Keep at most `cap` rows and say whether more matched. `total` is the database's own count when it gave one. */
export function capRows<T>(rows: T[], total: number | null | undefined, cap = ROW_CAP): Capped<T> {
  const matchCount = typeof total === "number" && total >= rows.length ? total : rows.length;
  return { rows: rows.slice(0, cap), truncated: matchCount > cap, matchCount };
}

/**
 * A search word that is safe to drop into a PostgREST `or(...)` filter. Commas,
 * parentheses and backslashes would let a word change the filter, and `%`/`_`/`*`
 * are wildcards, so all of them are removed rather than escaped.
 */
export function cleanSearchTerm(value: unknown, max = 80): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[,()\\%_*"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Cut long free text so one note cannot flood the model's context. */
export function clampText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}… (cut at ${max} characters)` : text;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ── Listings ────────────────────────────────────────────────

export const LISTING_COLUMNS =
  "id, name, slug, full_address, city_county, acres, building_sqft, list_price, listing_type, property_type, " +
  "zoning, zoning_municipality, cross_streets, traffic_count, latitude, longitude, property_overview, " +
  "spaces_available, available, sold, under_contract, featured, broker_ids, webflow_id, published_at, updated_at";

export type ListingRow = {
  id: string;
  name: string | null;
  full_address: string | null;
  city_county: string | null;
  acres: number | null;
  building_sqft: number | null;
  list_price: string | null;
  listing_type: string | null;
  property_type: string | null;
  zoning: string | null;
  zoning_municipality: string | null;
  cross_streets: string | null;
  traffic_count: string | null;
  latitude: number | null;
  longitude: number | null;
  property_overview: string | null;
  spaces_available: string | null;
  available: boolean | null;
  sold: boolean | null;
  under_contract: boolean | null;
  featured: boolean | null;
  broker_ids: string[] | null;
  webflow_id: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export type ListingStatus = "Sold" | "Draft" | "Under Contract" | "Live";

/** Same order as the Listings page: sold first, then draft, then under contract, otherwise live. */
export function listingStatus(row: Pick<ListingRow, "sold" | "under_contract" | "published_at">): ListingStatus {
  if (row.sold) return "Sold";
  if (!row.published_at) return "Draft";
  if (row.under_contract) return "Under Contract";
  return "Live";
}

export function shapeListing(row: ListingRow, brokerNames: Record<string, string> = {}) {
  return {
    id: row.id,
    name: row.name,
    status: listingStatus(row),
    address: row.full_address,
    cityCounty: row.city_county,
    acres: row.acres,
    buildingSqft: row.building_sqft,
    price: row.list_price,
    listingType: row.listing_type,
    propertyType: row.property_type,
    zoning: row.zoning,
    zoningMunicipality: row.zoning_municipality,
    brokers: (row.broker_ids ?? []).map((id) => brokerNames[id]).filter(Boolean),
    updatedAt: row.updated_at,
  };
}

// ── Deals ───────────────────────────────────────────────────

export const DEAL_SEARCH_COLUMNS =
  "id, deal_name, property_address, deal_type, status, price, effective_date, escrow_open_date, " +
  "actual_close_date, lease_stage, listing_id, deal_dates(label, date, sort_order), " +
  "deal_members(split_percent, brokers(name))";

export type DealRow = {
  id: string;
  deal_name: string | null;
  property_address: string | null;
  deal_type: string | null;
  status: string | null;
  price: number | null;
  effective_date: string | null;
  escrow_open_date: string | null;
  actual_close_date: string | null;
  lease_stage: string | null;
  listing_id: string | null;
  deal_dates?: { label: string | null; date: string | null; sort_order: number | null }[] | null;
  deal_members?: { split_percent: number | null; brokers: { name: string | null } | { name: string | null }[] | null }[] | null;
};

function memberName(brokers: { name: string | null } | { name: string | null }[] | null): string | null {
  if (!brokers) return null;
  return (Array.isArray(brokers) ? brokers[0]?.name : brokers.name) ?? null;
}

export function shapeDeal(row: DealRow) {
  const dates = [...(row.deal_dates ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((d) => ({ label: d.label, date: d.date }));
  return {
    id: row.id,
    name: row.deal_name,
    address: row.property_address,
    type: row.deal_type,
    status: row.status,
    leaseStage: row.lease_stage,
    price: row.price,
    effectiveDate: row.effective_date,
    escrowOpenDate: row.escrow_open_date,
    closeDate: row.actual_close_date,
    keyDates: dates,
    brokers: (row.deal_members ?? []).map((m) => ({ name: memberName(m.brokers), splitPercent: m.split_percent })),
  };
}

// ── The guide ───────────────────────────────────────────────

export type GuideSection = { heading: string; body: string };

/** Split the guide on its `## ` headings. */
export function splitGuide(markdown: string): GuideSection[] {
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { heading: line.slice(3).trim(), body: "" };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}

/** The sections whose heading or text mentions any word of the topic, best matches first. */
export function findGuideSections(markdown: string, topic: string, max = 3): GuideSection[] {
  const words = topic.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];
  return splitGuide(markdown)
    .map((section) => {
      const heading = section.heading.toLowerCase();
      const body = section.body.toLowerCase();
      const score = words.reduce((sum, w) => sum + (heading.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
      return { section, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.section);
}
