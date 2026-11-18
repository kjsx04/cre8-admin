import { supabase } from "@/lib/flow/supabase";
import { escapeLikePattern } from "@/lib/sql-escape";
import { asBoolean, asNumber, asString, asStringList, DemandError, fromSupabase } from "./coerce";
import { parseContactCsv, parseTenantCsv, toCsv } from "./csv";
import { effectiveRequirement, groupSpaceMatches, matchSpaces, normalizeFormats, requirementText, suggestAlsoPitch } from "./match";
import { parcelAtPoint } from "./parcels";
import { locationStatus, type LocationStatus } from "./location-status";
import { categoryKey, indexByCategory, isDemandCategory, lookupCategory } from "./categories";
import { effectiveSpacing } from "./spacing";
import { deriveSpaces, listingContext } from "./spaces";
import type { ListingRow } from "./spaces";
import type {
  CategoryDefault,
  ContactType,
  Deal,
  DealFlags,
  DemandSpace,
  InterestStatus,
  OverrideDecision,
  Relation,
  ResearchConfidence,
  ResearchStatus,
  SizeTier,
  SpaceOverride,
  SpaceType,
  TenantInput,
  TenantLocation,
  TenantRelationship,
} from "./types";
import type {
  CatalogResponse,
  CategoryAdminView,
  ContactView,
  GroupView,
  ListingSummary,
  MapResponse,
  MatchResponse,
  DemandListTenant,
  ResearchLogView,
  ReverseResponse,
  SpaceView,
  TenantAdminView,
  TenantMatchView,
  TierAdminView,
} from "./view";

function confidenceOf(value: unknown): ResearchConfidence | null {
  return value === "High" || value === "Medium" || value === "Low" ? value : null;
}

function researchStatusOf(value: unknown): ResearchStatus | null {
  return value === "pending" || value === "in_progress" || value === "researched" || value === "needs_review" ? value : null;
}

function triText(value: boolean | null | undefined): string {
  if (value === true) return "true";
  if (value === false) return "false";
  return "unknown";
}

const LISTING_COLS =
  "id, name, slug, full_address, city_county, acres, building_sqft, list_price, listing_type, property_type, zoning, property_overview, spaces_available, latitude, longitude, status, sold";

const PITCH = new Set(["interested", "touring", "LOI"]);
const SPACE_TYPES = new Set(["pad", "inline", "endcap", "land parcel"]);
const DEALS = new Set(["sale", "lease", "both"]);
const INTEREST = new Set(["submitted", "interested", "touring", "LOI", "passed"]);

type Row = Record<string, unknown>;

async function many(builder: PromiseLike<{ data: Row[] | null; error: { message: string } | null }>, what: string): Promise<Row[]> {
  const { data, error } = await builder;
  if (error) throw fromSupabase(error, what);
  return data || [];
}

function listingRow(row: Row): ListingRow & { status: string } {
  return {
    id: String(row.id),
    name: String(row.name || "Untitled"),
    fullAddress: asString(row.full_address),
    cityCounty: asString(row.city_county),
    acres: asNumber(row.acres),
    buildingSqft: asNumber(row.building_sqft) == null ? null : Math.round(asNumber(row.building_sqft) as number),
    listPrice: asString(row.list_price),
    listingType: asString(row.listing_type),
    propertyType: asString(row.property_type),
    zoning: asString(row.zoning),
    overview: asString(row.property_overview),
    spacesHtml: asString(row.spaces_available),
    latitude: asNumber(row.latitude),
    longitude: asNumber(row.longitude),
    sold: row.sold === true || row.status === "sold",
    status: String(row.status || ""),
  };
}

function summary(row: ReturnType<typeof listingRow>): ListingSummary {
  const place = row.cityCounty ? splitPlace(row.cityCounty) : { city: null, county: null };
  return {
    id: row.id,
    name: row.name,
    city: place.city,
    county: place.county,
    address: row.fullAddress || "",
    acres: row.acres ?? null,
    buildingSf: row.buildingSqft ?? null,
    listingType: row.listingType || "",
    propertyType: row.propertyType || "",
    status: row.status,
    sold: row.sold || false,
    lat: row.latitude ?? null,
    lng: row.longitude ?? null,
  };
}

function splitPlace(raw: string): { city: string | null; county: string | null } {
  const ctx = listingContext({ id: "", name: "", cityCounty: raw });
  return { city: ctx.city, county: ctx.county };
}

function spaceFrom(row: Row): DemandSpace {
  const type = String(row.space_type || "");
  const deal = String(row.deal || "both");
  return {
    id: String(row.id),
    label: String(row.label || "Space"),
    spaceType: (SPACE_TYPES.has(type) ? type : "inline") as SpaceType,
    acres: asNumber(row.acres),
    sf: asNumber(row.sf) == null ? null : Math.round(asNumber(row.sf) as number),
    driveThru: asBoolean(row.drive_thru),
    deal: (DEALS.has(deal) ? deal : "both") as Deal,
    priceRate: asString(row.price_rate),
    status: asString(row.status),
    notes: asString(row.notes),
    sortOrder: asNumber(row.sort_order) ?? 0,
    geometry: row.geometry ?? undefined,
  };
}

function spaceView(space: DemandSpace): SpaceView {
  return {
    id: space.id,
    label: space.label,
    spaceType: space.spaceType,
    acres: space.acres,
    sf: space.sf,
    driveThru: space.driveThru,
    deal: space.deal,
    priceRate: space.priceRate,
    status: space.status,
    notes: space.notes,
    sortOrder: space.sortOrder,
    hasGeometry: space.geometry != null,
  };
}

interface Bundle {
  tenants: TenantInput[];
  admin: Map<string, { subcategory: string | null; source: string | null; date: string | null; notes: string | null }>;
  defaults: CategoryDefault[];
  tiers: SizeTier[];
  locations: TenantLocation[];
  relationships: TenantRelationship[];
  contacts: Map<string, ContactView[]>;
  firms: Row[];
}

interface PageQuery {
  eq: (column: string, value: string) => PageQuery;
  in: (column: string, values: string[]) => PageQuery;
  order: (column: string, options: { ascending: boolean }) => PageQuery;
  range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
}

/**
 * PostgREST returns at most 1,000 rows per request. A table past that — locations,
 * relationships, and the tenant/contact tables as they grow — is cut off with no error
 * unless we page. Order columns need to be unique together so a page boundary can't skip a row.
 * Location rows omit geom; the geography payload is large and matching only needs lat/lng.
 */
async function fetchPage(
  table: string,
  columns: string,
  orderColumns: string[],
  from: number,
  size: number,
  filter?: (query: PageQuery) => PageQuery
): Promise<Row[]> {
  let query = supabase.from(table).select(columns) as unknown as PageQuery;
  if (filter) query = filter(query);
  for (const column of orderColumns) query = query.order(column, { ascending: true });
  const { data, error } = await query.range(from, from + size - 1);
  if (error) throw fromSupabase(error, table);
  return data || [];
}

async function fetchAll(
  table: string,
  columns: string,
  orderColumns: string[],
  filter?: (query: PageQuery) => PageQuery
): Promise<Row[]> {
  const size = 1000;
  const first = await fetchPage(table, columns, orderColumns, 0, size, filter);
  if (first.length < size) return first;
  // A full page means there is more. Ask for the rest together instead of
  // waiting on one thousand-row round trip at a time.
  const rows = [...first];
  const wave = 12;
  for (let page = 1; ; page += wave) {
    const batch = await Promise.all(
      Array.from({ length: wave }, (_, index) => fetchPage(table, columns, orderColumns, (page + index) * size, size, filter))
    );
    let done = false;
    for (const part of batch) {
      rows.push(...part);
      if (part.length < size) {
        done = true;
        break;
      }
    }
    if (done) return rows;
  }
}

let bundleCache: { at: number; value: Promise<Bundle> } | null = null;
// Contact and location writes call invalidateBundle(). The list still updates
// the saved row in memory, because a refetch inside this window can be stale
// if a write forgot to invalidate.
const BUNDLE_MS = 30_000;

function invalidateBundle(): void {
  bundleCache = null;
}

async function loadBundle(): Promise<Bundle> {
  if (bundleCache && Date.now() - bundleCache.at < BUNDLE_MS) return bundleCache.value;
  const value = readBundle().catch((err) => {
    if (bundleCache?.value === value) bundleCache = null;
    throw err;
  });
  bundleCache = { at: Date.now(), value };
  return value;
}

async function readBundle(): Promise<Bundle> {
  const [tenantRows, contactRows, firmRows, tierRows, categoryRows, categoryTiers, tenantTiers, locationRows, relationshipRows] =
    await Promise.all([
      // tenant_locations(count) is one grouped count per tenant. Spacing still
      // needs the coordinate rows loaded below; the bucket rule does not.
      fetchAll("tenants", "*,tenant_locations(count)", ["brand_name", "id"]),
      fetchAll("tenant_contacts", "*", ["id"]),
      fetchAll("rep_firms", "*", ["name", "id"]),
      fetchAll("size_tiers", "*", ["sort_order", "id"]),
      fetchAll("category_defaults", "*", ["category"]),
      fetchAll("category_size_tiers", "*", ["category", "size_tier_id"]),
      fetchAll("tenant_size_tiers", "*", ["tenant_id", "size_tier_id"]),
      fetchAll("tenant_locations", "id, tenant_id, name, lat, lng, status", ["id"]),
      fetchAll("tenant_relationships", "*", ["id"]),
    ]);

  const firmName = new Map(firmRows.map((row) => [String(row.id), String(row.name || "")]));
  const tiersByTenant = new Map<string, string[]>();
  for (const row of tenantTiers) {
    const id = String(row.tenant_id);
    const list = tiersByTenant.get(id) || [];
    list.push(String(row.size_tier_id));
    tiersByTenant.set(id, list);
  }
  const tiersByCategory = new Map<string, string[]>();
  for (const row of categoryTiers) {
    const id = String(row.category);
    const list = tiersByCategory.get(id) || [];
    list.push(String(row.size_tier_id));
    tiersByCategory.set(id, list);
  }

  const contacts = new Map<string, ContactView[]>();
  for (const row of contactRows) {
    if (!row.tenant_id) continue;
    const tenantId = String(row.tenant_id);
    const view: ContactView = {
      id: String(row.id),
      contactType: row.contact_type === "broker" ? "broker" : "in_house",
      name: String(row.name || ""),
      title: asString(row.title),
      firmName: row.firm_id ? firmName.get(String(row.firm_id)) || null : null,
      email: asString(row.email),
      phone: asString(row.phone),
      isPrimary: row.is_primary === true,
      confidence: asString(row.confidence),
    };
    const list = contacts.get(tenantId) || [];
    list.push(view);
    contacts.set(tenantId, list);
  }
  Array.from(contacts.values()).forEach((list) => list.sort(contactOrder));

  const tenants: TenantInput[] = tenantRows.map((row) => ({
    id: String(row.id),
    brandName: String(row.brand_name || ""),
    category: String(row.category || "other"),
    subcategory: asString(row.subcategory),
    formats: asStringList(row.formats),
    sfMin: asNumber(row.sf_min),
    sfMax: asNumber(row.sf_max),
    acresMin: asNumber(row.acres_min),
    acresMax: asNumber(row.acres_max),
    tierIds: tiersByTenant.get(String(row.id)) || [],
    driveThruRequired: asBoolean(row.drive_thru_required),
    azMarkets: asStringList(row.az_markets),
    spacingMiles: asNumber(row.spacing_miles),
    active: row.active !== false,
    dealLease: asBoolean(row.deal_lease),
    dealBuy: asBoolean(row.deal_buy),
    dealGroundLease: asBoolean(row.deal_ground_lease),
    dealBts: asBoolean(row.deal_bts),
    freestanding: asBoolean(row.freestanding),
    inline: asBoolean(row.inline),
    dealTypesSource: asString(row.deal_types_source),
    dealTypesConfidence: confidenceOf(row.deal_types_confidence),
    researchStatus: researchStatusOf(row.research_status),
    researchPriority: asNumber(row.research_priority),
    lastResearched: asString(row.last_researched),
    storeCount: embeddedCount(row.tenant_locations),
  }));

  const admin = new Map(
    tenantRows.map((row) => [
      String(row.id),
      {
        subcategory: asString(row.subcategory),
        source: asString(row.requirement_source),
        date: asString(row.requirement_date),
        notes: asString(row.notes),
      },
    ])
  );

  const tiers: SizeTier[] = tierRows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ""),
    kind: row.kind === "acres" ? "acres" : "sf",
    minValue: asNumber(row.min_value),
    maxValue: asNumber(row.max_value),
    sortOrder: asNumber(row.sort_order) ?? 0,
  }));

  const defaults: CategoryDefault[] = categoryRows.map((row) => ({
    category: String(row.category),
    formats: asStringList(row.formats),
    sfMin: asNumber(row.sf_min),
    sfMax: asNumber(row.sf_max),
    acresMin: asNumber(row.acres_min),
    acresMax: asNumber(row.acres_max),
    tierIds: tiersByCategory.get(String(row.category)) || [],
    driveThruTypical: asBoolean(row.drive_thru_typical),
    spacingMiles: asNumber(row.spacing_miles),
  }));

  const locations: TenantLocation[] = locationRows.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: asString(row.name),
    address: null,
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
    status: asString(row.status),
  }));

  const relationships: TenantRelationship[] = relationshipRows.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    relatedTenantId: String(row.related_tenant_id),
    relation: (row.relation === "similar" || row.relation === "co_tenant" ? row.relation : "competitor") as Relation,
  }));

  return { tenants, admin, defaults, tiers, locations, relationships, contacts, firms: firmRows };
}

function contactOrder(a: ContactView, b: ContactView): number {
  const type = (a.contactType === "broker" ? 0 : 1) - (b.contactType === "broker" ? 0 : 1);
  if (type) return type;
  return Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name);
}

async function oneListing(id: string): Promise<ReturnType<typeof listingRow>> {
  const { data, error } = await supabase.from("listings").select(LISTING_COLS).eq("id", id).maybeSingle();
  if (error) throw fromSupabase(error, "listing");
  if (!data) throw new DemandError("Listing not found.", 404);
  return listingRow(data as Row);
}

async function spaceRows(listingId: string): Promise<DemandSpace[]> {
  const rows = await many(
    supabase.from("listing_spaces").select("*").eq("listing_id", listingId).order("sort_order"),
    "spaces"
  );
  return rows.map(spaceFrom);
}

async function ensureSpaces(row: ReturnType<typeof listingRow>): Promise<{ spaces: DemandSpace[]; seeded: boolean }> {
  const existing = await spaceRows(row.id);
  if (existing.length) return { spaces: existing, seeded: false };
  const drafts = deriveSpaces(row);
  const { data, error } = await supabase
    .from("listing_spaces")
    .insert(
      drafts.map((space) => ({
        listing_id: row.id,
        label: space.label,
        space_type: space.spaceType,
        acres: space.acres,
        sf: space.sf,
        drive_thru: space.driveThru,
        deal: space.deal,
        price_rate: space.priceRate,
        status: space.status,
        notes: space.notes,
        sort_order: space.sortOrder,
      }))
    )
    .select("*");
  if (error) throw fromSupabase(error, "seed spaces");
  return { spaces: ((data || []) as Row[]).map(spaceFrom), seeded: true };
}

async function overridesFor(listingId: string): Promise<SpaceOverride[]> {
  const rows = await fetchAll("demand_overrides", "*", ["id"], (query) => query.eq("listing_id", listingId));
  return rows.map((row) => ({
    spaceId: String(row.listing_space_id),
    tenantId: String(row.tenant_id),
    decision: row.decision === "include" ? "include" : "exclude",
    reason: asString(row.reason),
  }));
}

async function interestFor(listingId: string): Promise<{ spaceId: string; tenantId: string; status: InterestStatus; notes: string | null }[]> {
  const rows = await fetchAll("demand_interest", "*", ["id"], (query) => query.eq("listing_id", listingId));
  return rows
    .filter((row) => INTEREST.has(String(row.status)))
    .map((row) => ({
      spaceId: String(row.listing_space_id),
      tenantId: String(row.tenant_id),
      status: String(row.status) as InterestStatus,
      notes: asString(row.notes),
    }));
}

function toGroup(group: ReturnType<typeof groupSpaceMatches>[number], bundle: Bundle, interest: Awaited<ReturnType<typeof interestFor>>, overrides: SpaceOverride[]): GroupView {
  const spaceIds = new Set(group.spaces.map((space) => space.id));
  const buckets = new Map(group.tenants.map((tenant) => [tenant.tenantId, tenant.bucket]));
  const byId = new Map(bundle.tenants.map((tenant) => [tenant.id, tenant]));
  const views = group.tenants.map((classified) => {
    const tenant = byId.get(classified.tenantId);
    const interests = interest.filter((row) => row.tenantId === classified.tenantId && spaceIds.has(row.spaceId));
    const overs = overrides.filter((row) => row.tenantId === classified.tenantId && spaceIds.has(row.spaceId));
    const alsoPitch = interests.some((row) => PITCH.has(row.status))
      ? suggestAlsoPitch({
          tenantId: classified.tenantId,
          tenants: bundle.tenants,
          defaults: bundle.defaults,
          tiers: bundle.tiers,
          relationships: bundle.relationships,
          space: group.spaces[0],
          buckets,
        })
      : [];
    const view: TenantMatchView = {
      tenantId: classified.tenantId,
      brandName: tenant?.brandName || "Tenant",
      category: tenant?.category || "",
      subcategory: tenant?.subcategory || null,
      bucket: classified.bucket,
      score: classified.score,
      reasons: classified.reasons,
      requirement: requirementText(classified.requirement, bundle.tiers),
      sfMin: tenant?.sfMin ?? null,
      sfMax: tenant?.sfMax ?? null,
      acresMin: tenant?.acresMin ?? null,
      acresMax: tenant?.acresMax ?? null,
      dealLease: tenant?.dealLease ?? null,
      dealBuy: tenant?.dealBuy ?? null,
      dealGroundLease: tenant?.dealGroundLease ?? null,
      dealBts: tenant?.dealBts ?? null,
      freestanding: tenant?.freestanding ?? null,
      inline: tenant?.inline ?? null,
      dealTypesSource: tenant?.dealTypesSource ?? null,
      dealTypesConfidence: tenant?.dealTypesConfidence ?? null,
      researchStatus: tenant?.researchStatus ?? null,
      lastResearched: tenant?.lastResearched ?? null,
      storeCount: tenant?.storeCount ?? 0,
      contacts: bundle.contacts.get(classified.tenantId) || [],
      interests: interests.map((row) => ({ spaceId: row.spaceId, status: row.status, notes: row.notes })),
      overrides: overs.map((row) => ({ spaceId: row.spaceId, decision: row.decision, reason: row.reason })),
      alsoPitch,
    };
    return view;
  });
  return {
    key: group.key,
    title: group.title,
    tierName: group.tierName,
    spaces: group.spaces.map(spaceView),
    optimal: views.filter((view) => view.bucket === "optimal"),
    possible: views.filter((view) => view.bucket === "possible"),
    excluded: views.filter((view) => view.bucket === "excluded"),
  };
}

export async function listListings(): Promise<ListingSummary[]> {
  const rows = await fetchAll("listings", LISTING_COLS, ["name", "id"]);
  return rows.map((row) => summary(listingRow(row)));
}

export async function getMatch(listingId: string): Promise<MatchResponse> {
  const row = await oneListing(listingId);
  const bundle = await loadBundle();
  const { spaces, seeded } = await ensureSpaces(row);
  const [overrides, interest] = await Promise.all([overridesFor(listingId), interestFor(listingId)]);
  const groups = groupSpaceMatches(
    matchSpaces({
      listing: listingContext(row),
      spaces,
      tenants: bundle.tenants,
      defaults: bundle.defaults,
      tiers: bundle.tiers,
      locations: bundle.locations,
      overrides,
    }),
    bundle.tiers
  );
  return { listing: summary(row), spacesSeeded: seeded, groups: groups.map((group) => toGroup(group, bundle, interest, overrides)) };
}

export async function getReverse(tenantId: string): Promise<ReverseResponse> {
  const bundle = await loadBundle();
  const tenant = bundle.tenants.find((item) => item.id === tenantId);
  if (!tenant) throw new DemandError("Tenant not found.", 404);
  const [listingRows, spaceData, overrideRows] = await Promise.all([
    fetchAll("listings", LISTING_COLS, ["id"]),
    fetchAll("listing_spaces", "*", ["id"]),
    fetchAll("demand_overrides", "*", ["id"], (query) => query.eq("tenant_id", tenantId)),
  ]);
  const byListing = new Map<string, DemandSpace[]>();
  for (const row of spaceData) {
    const space = spaceFrom(row);
    const list = byListing.get(String(row.listing_id)) || [];
    list.push(space);
    byListing.set(String(row.listing_id), list);
  }
  const overrides: SpaceOverride[] = overrideRows.map((row) => ({
    spaceId: String(row.listing_space_id),
    tenantId,
    decision: row.decision === "include" ? "include" : "exclude",
    reason: asString(row.reason),
  }));
  const hits: ReverseResponse = {
    tenant: {
      id: tenant.id,
      brandName: tenant.brandName,
      category: tenant.category,
      requirement: requirementText(effectiveRequirement(tenant, lookupCategory(bundle.defaults, tenant.category), bundle.tiers), bundle.tiers),
    },
    optimal: [],
    possible: [],
    excluded: [],
  };
  for (const raw of listingRows) {
    const row = listingRow(raw);
    let spaces = byListing.get(row.id) || [];
    if (!spaces.length) {
      spaces = deriveSpaces(row).map((space, index) => ({ ...space, id: `draft:${row.id}:${index}` }));
    }
    const groups = groupSpaceMatches(
      matchSpaces({
        listing: listingContext(row),
        spaces,
        tenants: [{ ...tenant, active: true }],
        defaults: bundle.defaults,
        tiers: bundle.tiers,
        locations: bundle.locations,
        overrides,
      }),
      bundle.tiers
    );
    const place = summary(row);
    for (const group of groups) {
      const classified = group.tenants[0];
      if (!classified) continue;
      hits[classified.bucket].push({
        listingId: row.id,
        listingName: row.name,
        city: place.city,
        title: group.title,
        reasons: classified.reasons,
        score: classified.score,
      });
    }
  }
  for (const bucket of ["optimal", "possible", "excluded"] as const) {
    hits[bucket].sort((a, b) => b.score - a.score || a.listingName.localeCompare(b.listingName));
  }
  return hits;
}

export async function getMap(listingId: string): Promise<MapResponse> {
  const match = await getMatch(listingId);
  const bundle = await loadBundle();
  const spaces = await spaceRows(listingId);
  const seen = new Set<string>();
  const tenants = [];
  for (const group of match.groups) {
    for (const view of [...group.optimal, ...group.possible]) {
      if (seen.has(view.tenantId)) continue;
      seen.add(view.tenantId);
      const tenant = bundle.tenants.find((item) => item.id === view.tenantId);
      const requirement = tenant
        ? effectiveRequirement(tenant, lookupCategory(bundle.defaults, tenant.category), bundle.tiers)
        : null;
      tenants.push({
        id: view.tenantId,
        brandName: view.brandName,
        category: view.category,
        spacingMiles: requirement?.spacingMiles ?? null,
        locations: bundle.locations
          .filter((loc) => loc.tenantId === view.tenantId && loc.lat != null && loc.lng != null && !/closed|dead|former|relocated/i.test(loc.status || ""))
          .map((loc) => ({ id: loc.id, name: loc.name, lat: loc.lat as number, lng: loc.lng as number })),
      });
    }
  }
  tenants.sort((a, b) => a.category.localeCompare(b.category) || a.brandName.localeCompare(b.brandName));
  const spaceOutlines = spaces
    .filter((space) => space.geometry)
    .map((space) => ({ id: space.id, label: space.label, geometry: space.geometry }));
  let parcel: MapResponse["parcel"] = null;
  if (match.listing.lat != null && match.listing.lng != null) {
    const hit = await parcelAtPoint(match.listing.lng, match.listing.lat);
    if (hit) parcel = { type: "Feature", geometry: hit.geometry };
  }
  const note =
    parcel || spaceOutlines.length
      ? null
      : match.listing.lat == null
        ? "This listing has no map location yet."
        : "No parcel outline on file. Showing the listing pin.";
  return {
    listing: { id: match.listing.id, name: match.listing.name, city: match.listing.city, lat: match.listing.lat, lng: match.listing.lng },
    parcel,
    spaceOutlines,
    note,
    tenants,
  };
}

export function exportCsv(match: MatchResponse, includeRest: boolean): string {
  const headers = [
    "group", "spaces", "bucket", "brand_name", "category", "requirement", "reasons", "interest", "override",
    "broker_name", "broker_firm", "broker_email", "broker_phone",
    "in_house_name", "in_house_title", "in_house_email", "in_house_phone",
  ];
  const lines: (string | null)[][] = [];
  for (const group of match.groups) {
    const buckets = includeRest ? [group.optimal, group.possible, group.excluded] : [group.optimal];
    for (const list of buckets) {
      for (const tenant of list) {
        const broker = tenant.contacts.find((contact) => contact.contactType === "broker");
        const house = tenant.contacts.find((contact) => contact.contactType === "in_house");
        const interest = tenant.interests.map((row) => {
          const label = group.spaces.find((space) => space.id === row.spaceId)?.label || row.spaceId;
          return `${label}: ${row.status}`;
        }).join("; ");
        const override = tenant.overrides.map((row) => `${row.decision}${row.reason ? ` (${row.reason})` : ""}`).join("; ");
        lines.push([
          group.title,
          group.spaces.map((space) => space.label).join("; "),
          tenant.bucket,
          tenant.brandName,
          tenant.category,
          tenant.requirement,
          tenant.reasons.join("; "),
          interest,
          override,
          broker?.name || "",
          broker?.firmName || "",
          broker?.email || "",
          broker?.phone || "",
          house?.name || "",
          house?.title || "",
          house?.email || "",
          house?.phone || "",
        ]);
      }
    }
  }
  return toCsv(headers, lines);
}

export interface SpaceInput {
  id?: string;
  label: string;
  spaceType: SpaceType;
  acres: number | null;
  sf: number | null;
  driveThru: boolean | null;
  deal: Deal;
  priceRate: string | null;
  status: string | null;
  notes: string | null;
}

export async function saveSpaces(listingId: string, spaces: SpaceInput[]): Promise<void> {
  await oneListing(listingId);
  const existing = await spaceRows(listingId);
  const keep = new Set<string>();
  for (let index = 0; index < spaces.length; index++) {
    const space = spaces[index];
    if (!SPACE_TYPES.has(space.spaceType)) throw new DemandError("Unknown space type.", 400);
    const payload = {
      listing_id: listingId,
      label: space.label.trim() || "Space",
      space_type: space.spaceType,
      acres: space.acres,
      sf: space.sf,
      drive_thru: space.driveThru,
      deal: DEALS.has(space.deal) ? space.deal : "both",
      price_rate: space.priceRate,
      status: space.status,
      notes: space.notes,
      sort_order: index,
    };
    if (space.id && existing.some((row) => row.id === space.id)) {
      keep.add(space.id);
      const { error } = await supabase.from("listing_spaces").update(payload).eq("id", space.id);
      if (error) throw fromSupabase(error, "update space");
    } else {
      const { data, error } = await supabase.from("listing_spaces").insert(payload).select("id").single();
      if (error || !data) throw fromSupabase(error || { message: "Insert failed" }, "insert space");
      keep.add(String((data as Row).id));
    }
  }
  const remove = existing.map((space) => space.id).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("listing_spaces").delete().in("id", remove);
    if (error) throw fromSupabase(error, "delete space");
  }
}

export async function setOverride(input: {
  listingId: string;
  spaceIds: string[];
  tenantId: string;
  decision: OverrideDecision;
  reason: string;
  createdBy: string;
}): Promise<void> {
  if (!input.reason.trim()) throw new DemandError("Add a reason.", 400);
  if (input.decision !== "include" && input.decision !== "exclude") throw new DemandError("Unknown decision.", 400);
  for (const spaceId of input.spaceIds) {
    const { error } = await supabase.from("demand_overrides").upsert(
      {
        listing_id: input.listingId,
        listing_space_id: spaceId,
        tenant_id: input.tenantId,
        decision: input.decision,
        reason: input.reason.trim(),
        created_by: input.createdBy,
        created_at: new Date().toISOString(),
      },
      { onConflict: "listing_space_id,tenant_id" }
    );
    if (error) throw fromSupabase(error, "override");
  }
}

export async function clearOverride(spaceIds: string[], tenantId: string): Promise<void> {
  if (!spaceIds.length) return;
  const { error } = await supabase.from("demand_overrides").delete().eq("tenant_id", tenantId).in("listing_space_id", spaceIds);
  if (error) throw fromSupabase(error, "clear override");
}

export async function setInterest(input: {
  listingId: string;
  spaceIds: string[];
  tenantId: string;
  status: InterestStatus | null;
  notes: string | null;
}): Promise<void> {
  if (input.status && !INTEREST.has(input.status)) throw new DemandError("Unknown interest status.", 400);
  if (!input.status) {
    const { error } = await supabase.from("demand_interest").delete().eq("tenant_id", input.tenantId).in("listing_space_id", input.spaceIds);
    if (error) throw fromSupabase(error, "clear interest");
    return;
  }
  for (const spaceId of input.spaceIds) {
    const { error } = await supabase.from("demand_interest").upsert(
      {
        listing_id: input.listingId,
        listing_space_id: spaceId,
        tenant_id: input.tenantId,
        status: input.status,
        notes: input.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "listing_space_id,tenant_id" }
    );
    if (error) throw fromSupabase(error, "interest");
  }
}

export async function getCatalog(): Promise<CatalogResponse> {
  const bundle = await loadBundle();
  const logRows = await many(
    supabase
      .from("tenant_research_log")
      .select("id, tenant_id, field, old_value, new_value, source, confidence, researched_at, researched_by")
      .order("researched_at", { ascending: false })
      .limit(40),
    "research log"
  );
  const firmRows = bundle.firms;
  const tenants: TenantAdminView[] = bundle.tenants.map((tenant) => {
    const extra = bundle.admin.get(tenant.id);
    return {
      ...tenant,
      requirementSource: extra?.source || null,
      requirementDate: extra?.date || null,
      notes: extra?.notes || null,
      contacts: bundle.contacts.get(tenant.id) || [],
      relationships: bundle.relationships
        .filter((rel) => rel.tenantId === tenant.id)
        .map((rel) => ({ id: rel.id, relatedTenantId: rel.relatedTenantId, relation: rel.relation })),
    };
  });
  const categories: CategoryAdminView[] = bundle.defaults.map((item) => ({
    category: item.category,
    formats: item.formats,
    sfMin: item.sfMin,
    sfMax: item.sfMax,
    acresMin: item.acresMin,
    acresMax: item.acresMax,
    tierIds: item.tierIds,
    driveThruTypical: item.driveThruTypical,
    spacingMiles: item.spacingMiles,
  }));
  return {
    tenants,
    firms: firmRows.map((row) => ({
      id: String(row.id),
      name: String(row.name || ""),
      website: asString(row.website),
      notes: asString(row.notes),
    })),
    categories,
    tiers: bundle.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      kind: tier.kind,
      minValue: tier.minValue,
      maxValue: tier.maxValue,
      sortOrder: tier.sortOrder,
    })),
    recentResearch: logRows.map((row) => researchLogView(row, bundle.tenants)),
  };
}

function researchLogView(row: Row, tenants: TenantInput[]): ResearchLogView {
  const tenantId = row.tenant_id ? String(row.tenant_id) : null;
  return {
    id: String(row.id),
    tenantId,
    brandName: tenants.find((tenant) => tenant.id === tenantId)?.brandName || "Tenant",
    field: String(row.field || ""),
    oldValue: asString(row.old_value),
    newValue: asString(row.new_value),
    source: asString(row.source),
    confidence: asString(row.confidence),
    researchedAt: asString(row.researched_at),
    researchedBy: asString(row.researched_by),
  };
}

export interface TenantWrite {
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
  dealTypesConfidence: ResearchConfidence | null;
  contacts: {
    contactType: ContactType;
    firmName: string | null;
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
    confidence: string | null;
  }[];
  relationships: { relatedTenantId: string; relation: Relation }[];
}

function tenantPayload(input: TenantWrite) {
  const formats = normalizeFormats(input.formats);
  if (input.formats.length && formats.length !== input.formats.length) {
    throw new DemandError("Unknown format. Use pad, inline, endcap, junior box, big box, ground lease, or BTS.", 400);
  }
  if (!input.brandName.trim() || !input.category.trim()) throw new DemandError("Name and category are required.", 400);
  return {
    brand_name: input.brandName.trim(),
    category: input.category.trim(),
    subcategory: input.subcategory,
    formats,
    sf_min: input.sfMin,
    sf_max: input.sfMax,
    acres_min: input.acresMin,
    acres_max: input.acresMax,
    drive_thru_required: input.driveThruRequired,
    az_markets: input.azMarkets,
    spacing_miles: input.spacingMiles,
    requirement_source: input.requirementSource,
    requirement_date: input.requirementDate,
    notes: input.notes,
    active: input.active,
    deal_lease: input.dealLease,
    deal_buy: input.dealBuy,
    deal_ground_lease: input.dealGroundLease,
    deal_bts: input.dealBts,
    freestanding: input.freestanding,
    inline: input.inline,
    deal_types_source: input.dealTypesSource,
    deal_types_confidence: input.dealTypesConfidence,
  };
}

const RESEARCH_COLUMNS: { column: string; key: keyof DealFlags; tri: boolean }[] = [
  { column: "deal_lease", key: "dealLease", tri: true },
  { column: "deal_buy", key: "dealBuy", tri: true },
  { column: "deal_ground_lease", key: "dealGroundLease", tri: true },
  { column: "deal_bts", key: "dealBts", tri: true },
  { column: "freestanding", key: "freestanding", tri: true },
  { column: "inline", key: "inline", tri: true },
  { column: "deal_types_source", key: "dealTypesSource", tri: false },
  { column: "deal_types_confidence", key: "dealTypesConfidence", tri: false },
];

function researchValue(row: Row, column: string, tri: boolean): string {
  if (!tri) return asString(row[column]) || "";
  return triText(asBoolean(row[column]));
}

function nextResearchValue(input: DealFlags, key: keyof DealFlags, tri: boolean): string {
  const value = input[key];
  if (!tri) return typeof value === "string" ? value : "";
  return triText(value as boolean | null);
}

async function writeResearchLog(tenantId: string, input: DealFlags, at: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("tenants")
    .select("deal_lease, deal_buy, deal_ground_lease, deal_bts, freestanding, inline, deal_types_source, deal_types_confidence")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw fromSupabase(error, "read research");
  if (!data) throw new DemandError("Tenant not found.", 404);
  const current = data as Row;
  const changes = RESEARCH_COLUMNS.flatMap((field) => {
    const oldValue = researchValue(current, field.column, field.tri);
    const newValue = nextResearchValue(input, field.key, field.tri);
    return oldValue === newValue ? [] : [{ field: field.column, old_value: oldValue, new_value: newValue }];
  });
  if (!changes.length) return false;
  const { error: logError } = await supabase.from("tenant_research_log").insert(
    changes.map((change) => ({
      tenant_id: tenantId,
      field: change.field,
      old_value: change.old_value,
      new_value: change.new_value,
      source: input.dealTypesSource,
      confidence: input.dealTypesConfidence,
      researched_by: "manual",
      researched_at: at,
    }))
  );
  if (logError) throw fromSupabase(logError, "research log");
  return true;
}

async function replaceTenantChildren(tenantId: string, input: TenantWrite): Promise<void> {
  const { error: tierError } = await supabase.from("tenant_size_tiers").delete().eq("tenant_id", tenantId);
  if (tierError) throw fromSupabase(tierError, "clear tiers");
  if (input.tierIds.length) {
    const { error } = await supabase.from("tenant_size_tiers").insert(input.tierIds.map((id) => ({ tenant_id: tenantId, size_tier_id: id })));
    if (error) throw fromSupabase(error, "tiers");
  }
  const { error: contactError } = await supabase.from("tenant_contacts").delete().eq("tenant_id", tenantId);
  if (contactError) throw fromSupabase(contactError, "clear contacts");
  if (input.contacts.length) {
    const firms = await fetchAll("rep_firms", "id, name", ["name", "id"]);
    const firmId = new Map(firms.map((row) => [String(row.name).toLowerCase(), String(row.id)]));
    const { error } = await supabase.from("tenant_contacts").insert(
      input.contacts.filter((contact) => contact.name.trim()).map((contact) => ({
        tenant_id: tenantId,
        contact_type: contact.contactType === "broker" ? "broker" : "in_house",
        firm_id: contact.firmName ? firmId.get(contact.firmName.trim().toLowerCase()) || null : null,
        name: contact.name.trim(),
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        is_primary: contact.isPrimary,
        confidence: contact.confidence === "High" || contact.confidence === "Medium" || contact.confidence === "Low" ? contact.confidence : null,
      }))
    );
    if (error) throw fromSupabase(error, "contacts");
  }
  const { error: relError } = await supabase.from("tenant_relationships").delete().eq("tenant_id", tenantId);
  if (relError) throw fromSupabase(relError, "clear relationships");
  const rels = input.relationships.filter((rel) => rel.relatedTenantId && rel.relatedTenantId !== tenantId);
  if (rels.length) {
    const { error } = await supabase.from("tenant_relationships").insert(
      rels.map((rel) => ({
        tenant_id: tenantId,
        related_tenant_id: rel.relatedTenantId,
        relation: rel.relation,
      }))
    );
    if (error) throw fromSupabase(error, "relationships");
  }
}

function assertConfidence(value: ResearchConfidence | null): void {
  if (value && value !== "High" && value !== "Medium" && value !== "Low") {
    throw new DemandError("Confidence must be High, Medium, or Low.", 400);
  }
}

export async function createTenant(input: TenantWrite): Promise<string> {
  assertConfidence(input.dealTypesConfidence);
  const at = new Date().toISOString();
  const changes = RESEARCH_COLUMNS.flatMap((field) => {
    const newValue = nextResearchValue(input, field.key, field.tri);
    const oldValue = field.tri ? "unknown" : "";
    return newValue === oldValue ? [] : [{ field: field.column, old_value: oldValue, new_value: newValue }];
  });
  const payload = changes.length ? { ...tenantPayload(input), last_researched: at, research_status: "researched" } : tenantPayload(input);
  const { data, error } = await supabase.from("tenants").insert(payload).select("id").single();
  if (error || !data) throw fromSupabase(error || { message: "Insert failed" }, "create tenant");
  const id = String((data as Row).id);
  if (changes.length) {
    const { error: logError } = await supabase.from("tenant_research_log").insert(
      changes.map((change) => ({
        tenant_id: id,
        field: change.field,
        old_value: change.old_value,
        new_value: change.new_value,
        source: input.dealTypesSource,
        confidence: input.dealTypesConfidence,
        researched_by: "manual",
        researched_at: at,
      }))
    );
    if (logError) throw fromSupabase(logError, "research log");
  }
  await replaceTenantChildren(id, input);
  invalidateBundle();
  return id;
}

export async function updateTenant(id: string, input: TenantWrite): Promise<void> {
  assertConfidence(input.dealTypesConfidence);
  const at = new Date().toISOString();
  const changed = await writeResearchLog(id, input, at);
  const payload = changed ? { ...tenantPayload(input), last_researched: at, research_status: "researched" } : tenantPayload(input);
  const { error } = await supabase.from("tenants").update(payload).eq("id", id);
  if (error) throw fromSupabase(error, "update tenant");
  await replaceTenantChildren(id, input);
  invalidateBundle();
}

export async function saveDealResearch(id: string, input: DealFlags): Promise<void> {
  assertConfidence(input.dealTypesConfidence);
  const at = new Date().toISOString();
  const changed = await writeResearchLog(id, input, at);
  if (!changed) return;
  const { error } = await supabase
    .from("tenants")
    .update({
      deal_lease: input.dealLease,
      deal_buy: input.dealBuy,
      deal_ground_lease: input.dealGroundLease,
      deal_bts: input.dealBts,
      freestanding: input.freestanding,
      inline: input.inline,
      deal_types_source: input.dealTypesSource,
      deal_types_confidence: input.dealTypesConfidence,
      last_researched: at,
      research_status: "researched",
    })
    .eq("id", id);
  if (error) throw fromSupabase(error, "save research");
  invalidateBundle();
}

export async function deleteTenant(id: string): Promise<void> {
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) throw fromSupabase(error, "delete tenant");
  invalidateBundle();
}

export async function saveFirm(input: { id?: string; name: string; website: string | null; notes: string | null }): Promise<void> {
  if (!input.name.trim()) throw new DemandError("Firm name is required.", 400);
  const payload = { name: input.name.trim(), website: input.website, notes: input.notes };
  const { error } = input.id
    ? await supabase.from("rep_firms").update(payload).eq("id", input.id)
    : await supabase.from("rep_firms").insert(payload);
  if (error) throw fromSupabase(error, "firm");
  invalidateBundle();
}

export async function deleteFirm(id: string): Promise<void> {
  const { error } = await supabase.from("rep_firms").delete().eq("id", id);
  if (error) throw fromSupabase(error, "delete firm");
  invalidateBundle();
}

export async function saveCategories(categories: CategoryAdminView[]): Promise<void> {
  for (const category of categories) {
    const formats = normalizeFormats(category.formats);
    const payload = {
      category: category.category.trim(),
      formats,
      sf_min: category.sfMin,
      sf_max: category.sfMax,
      acres_min: category.acresMin,
      acres_max: category.acresMax,
      drive_thru_typical: category.driveThruTypical,
      spacing_miles: category.spacingMiles,
    };
    const { data: existing } = await supabase.from("category_defaults").select("category").eq("category", payload.category).maybeSingle();
    const { error } = existing
      ? await supabase.from("category_defaults").update(payload).eq("category", payload.category)
      : await supabase.from("category_defaults").insert(payload);
    if (error) throw fromSupabase(error, "category");
    const { error: clearError } = await supabase.from("category_size_tiers").delete().eq("category", payload.category);
    if (clearError) throw fromSupabase(clearError, "category tiers");
    if (category.tierIds.length) {
      const { error: linkError } = await supabase
        .from("category_size_tiers")
        .insert(category.tierIds.map((id) => ({ category: payload.category, size_tier_id: id })));
      if (linkError) throw fromSupabase(linkError, "category tiers");
    }
  }
  invalidateBundle();
}

export async function saveTiers(tiers: TierAdminView[]): Promise<void> {
  const existing = await fetchAll("size_tiers", "id", ["id"]);
  const keep = new Set<string>();
  for (const tier of tiers) {
    if (!tier.name.trim()) throw new DemandError("Every tier needs a name.", 400);
    if (tier.kind !== "sf" && tier.kind !== "acres") throw new DemandError("Tier kind must be sf or acres.", 400);
    const payload = {
      name: tier.name.trim(),
      kind: tier.kind,
      min_value: tier.minValue,
      max_value: tier.maxValue,
      sort_order: tier.sortOrder,
    };
    if (tier.id && existing.some((row) => String(row.id) === tier.id)) {
      keep.add(tier.id);
      const { error } = await supabase.from("size_tiers").update(payload).eq("id", tier.id);
      if (error) throw fromSupabase(error, "update tier");
    } else {
      const { data, error } = await supabase.from("size_tiers").insert(payload).select("id").single();
      if (error || !data) throw fromSupabase(error || { message: "Insert failed" }, "insert tier");
      keep.add(String((data as Row).id));
    }
  }
  const remove = existing.map((row) => String(row.id)).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("size_tiers").delete().in("id", remove);
    if (error) throw fromSupabase(error, "delete tier");
  }
  invalidateBundle();
}

export async function importCsv(kind: "tenants" | "contacts", csv: string): Promise<{ created: number; updated: number; errors: { row: number; message: string }[] }> {
  if (kind === "tenants") return importTenants(csv);
  if (kind === "contacts") return importContacts(csv);
  throw new DemandError("Import kind must be tenants or contacts.", 400);
}

async function importTenants(csv: string) {
  const parsed = parseTenantCsv(csv);
  if (!parsed.rows.length) return { created: 0, updated: 0, errors: parsed.errors };
  const [tenants, tiers] = await Promise.all([
    fetchAll("tenants", "id, brand_name", ["brand_name", "id"]),
    fetchAll("size_tiers", "id, name", ["name", "id"]),
  ]);
  const byName = new Map(tenants.map((row) => [String(row.brand_name).toLowerCase(), String(row.id)]));
  const tierId = new Map(tiers.map((row) => [String(row.name).toLowerCase(), String(row.id)]));
  let created = 0;
  let updated = 0;
  const errors = [...parsed.errors];
  for (let index = 0; index < parsed.rows.length; index++) {
    const row = parsed.rows[index];
    const missing = row.sizeTiers.filter((name) => !tierId.has(name.toLowerCase()));
    if (missing.length) {
      errors.push({ row: index + 2, message: `Unknown size tier: ${missing.join(", ")}` });
      continue;
    }
    const payload = {
      brand_name: row.brandName,
      category: row.category,
      subcategory: row.subcategory,
      formats: normalizeFormats(row.formats),
      sf_min: row.sfMin,
      sf_max: row.sfMax,
      acres_min: row.acresMin,
      acres_max: row.acresMax,
      drive_thru_required: row.driveThruRequired,
      az_markets: row.azMarkets,
      spacing_miles: row.spacingMiles,
      requirement_source: row.requirementSource,
      requirement_date: row.requirementDate,
      notes: row.notes,
      active: row.active,
    };
    const existingId = byName.get(row.brandName.toLowerCase());
    let id = existingId;
    if (existingId) {
      const { error } = await supabase.from("tenants").update(payload).eq("id", existingId);
      if (error) {
        errors.push({ row: index + 2, message: error.message });
        continue;
      }
      updated += 1;
    } else {
      const { data, error } = await supabase.from("tenants").insert(payload).select("id").single();
      if (error || !data) {
        errors.push({ row: index + 2, message: error?.message || "Insert failed" });
        continue;
      }
      id = String((data as Row).id);
      byName.set(row.brandName.toLowerCase(), id);
      created += 1;
    }
    if (!id || !row.sizeTiers.length) continue;
    await supabase.from("tenant_size_tiers").delete().eq("tenant_id", id);
    const { error } = await supabase.from("tenant_size_tiers").insert(
      row.sizeTiers.map((name) => ({ tenant_id: id, size_tier_id: tierId.get(name.toLowerCase()) }))
    );
    if (error) errors.push({ row: index + 2, message: error.message });
  }
  invalidateBundle();
  return { created, updated, errors };
}

async function importContacts(csv: string) {
  const parsed = parseContactCsv(csv);
  if (!parsed.rows.length) return { created: 0, updated: 0, errors: parsed.errors };
  const [tenants, firms] = await Promise.all([
    fetchAll("tenants", "id, brand_name", ["brand_name", "id"]),
    fetchAll("rep_firms", "id, name", ["name", "id"]),
  ]);
  const tenantId = new Map(tenants.map((row) => [String(row.brand_name).toLowerCase(), String(row.id)]));
  const firmId = new Map(firms.map((row) => [String(row.name).toLowerCase(), String(row.id)]));
  let created = 0;
  let updated = 0;
  const errors = [...parsed.errors];
  for (let index = 0; index < parsed.rows.length; index++) {
    const row = parsed.rows[index];
    const owner = tenantId.get(row.brandName.toLowerCase());
    if (!owner) {
      errors.push({ row: index + 2, message: `No tenant named ${row.brandName}.` });
      continue;
    }
    let firm: string | null = null;
    if (row.firmName) {
      firm = firmId.get(row.firmName.toLowerCase()) || null;
      if (!firm) {
        const { data, error } = await supabase.from("rep_firms").insert({ name: row.firmName }).select("id").single();
        if (error || !data) {
          errors.push({ row: index + 2, message: error?.message || "Could not add the firm." });
          continue;
        }
        firm = String((data as Row).id);
        firmId.set(row.firmName.toLowerCase(), firm);
      }
    }
    const payload = {
      tenant_id: owner,
      contact_type: row.contactType,
      firm_id: firm,
      name: row.name,
      title: row.title,
      email: row.email,
      phone: row.phone,
      is_primary: row.isPrimary,
      source: row.source,
      confidence: row.confidence,
      last_verified: row.lastVerified,
    };
    let existing: string | null = null;
    if (row.email) {
      const { data } = await supabase
        .from("tenant_contacts")
        .select("id")
        .eq("tenant_id", owner)
        .eq("contact_type", row.contactType)
        .ilike("email", escapeLikePattern(row.email))
        .maybeSingle();
      existing = data ? String((data as Row).id) : null;
    }
    if (existing) {
      const { error } = await supabase.from("tenant_contacts").update(payload).eq("id", existing);
      if (error) errors.push({ row: index + 2, message: error.message });
      else updated += 1;
    } else {
      const { error } = await supabase.from("tenant_contacts").insert(payload);
      if (error) errors.push({ row: index + 2, message: error.message });
      else created += 1;
    }
  }
  invalidateBundle();
  return { created, updated, errors };
}

export interface BrandRow {
  id: string;
  brandName: string;
  category: string;
  /** The tenant's own spacing, or the category default when the tenant's is blank. */
  spacingMiles: number | null;
  locationCount: number;
}

function embeddedCount(value: unknown): number {
  if (typeof value === "number") return value;
  const row = Array.isArray(value) ? (value[0] as Row | undefined) : (value as Row | null);
  return asNumber(row?.count) ?? 0;
}

export async function listBrands(): Promise<BrandRow[]> {
  const [rows, defaults] = await Promise.all([
    fetchAll("tenants", "id, brand_name, category, spacing_miles, active, tenant_locations(count)", ["brand_name", "id"]),
    fetchAll("category_defaults", "category, spacing_miles", ["category"]),
  ]);
  const byCategory = indexByCategory(
    defaults.map((row) => ({ category: String(row.category), spacingMiles: asNumber(row.spacing_miles) }))
  );
  return rows
    .filter((row) => row.active !== false)
    .map((row) => {
      const category = String(row.category || "other");
      return {
        id: String(row.id),
        brandName: String(row.brand_name || "Tenant"),
        category,
        spacingMiles: effectiveSpacing(asNumber(row.spacing_miles), byCategory.get(categoryKey(category))?.spacingMiles ?? null),
        locationCount: embeddedCount(row.tenant_locations),
      };
    });
}

export interface CategorySpacing {
  category: string;
  spacingMiles: number | null;
}

/** Every category on file, plus any tenant category that does not have a row yet. */
export async function listCategorySpacing(): Promise<CategorySpacing[]> {
  const [defaults, tenants] = await Promise.all([
    fetchAll("category_defaults", "category, spacing_miles", ["category"]),
    fetchAll("tenants", "category", ["category"]),
  ]);
  const map = new Map<string, number | null>();
  for (const row of defaults) map.set(String(row.category), asNumber(row.spacing_miles));
  for (const row of tenants) {
    const category = String(row.category || "").trim();
    if (category && !map.has(category)) map.set(category, null);
  }
  return Array.from(map.entries())
    .map(([category, spacingMiles]) => ({ category, spacingMiles }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** Writes spacing only. Other category columns stay as they are. */
export async function saveCategorySpacing(category: string, spacingMiles: number | null): Promise<void> {
  const name = category.trim();
  if (!name) throw new DemandError("Category is required.", 400);
  if (spacingMiles != null && (!Number.isFinite(spacingMiles) || spacingMiles < 0)) {
    throw new DemandError("Spacing must be zero or more.", 400);
  }
  const { data: existing, error: readError } = await supabase.from("category_defaults").select("category").eq("category", name).maybeSingle();
  if (readError) throw fromSupabase(readError, "category");
  const { error } = existing
    ? await supabase.from("category_defaults").update({ spacing_miles: spacingMiles }).eq("category", name)
    : await supabase.from("category_defaults").insert({ category: name, spacing_miles: spacingMiles });
  if (error) throw fromSupabase(error, "category spacing");
  invalidateBundle();
}

export interface StoreLocation {
  id: string;
  tenantId: string;
  name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  status: LocationStatus;
}

function storeFrom(row: Row): StoreLocation | null {
  const lat = asNumber(row.lat);
  const lng = asNumber(row.lng);
  if (lat == null || lng == null) return null;
  if (/closed|dead|former|relocated/i.test(String(row.status || ""))) return null;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: asString(row.name),
    address: asString(row.address),
    lat,
    lng,
    status: locationStatus(asString(row.status)),
  };
}

export async function listLocations(tenantId: string): Promise<StoreLocation[]> {
  return listLocationsFor([tenantId]);
}

export async function listLocationsFor(tenantIds: string[]): Promise<StoreLocation[]> {
  const out: StoreLocation[] = [];
  for (let index = 0; index < tenantIds.length; index += 80) {
    const chunk = tenantIds.slice(index, index + 80);
    if (!chunk.length) continue;
    const rows = await fetchAll("tenant_locations", "id, tenant_id, name, address, lat, lng, status", ["id"], (query) =>
      query.in("tenant_id", chunk)
    );
    for (const row of rows) {
      const store = storeFrom(row);
      if (store) out.push(store);
    }
  }
  return out;
}

async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  if (!token) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${lng},${lat}`)}.json?access_token=${encodeURIComponent(token)}&limit=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: { place_name?: string }[] };
    const place = data.features?.[0]?.place_name;
    return place ? String(place) : null;
  } catch {
    return null;
  }
}

export async function createLocation(input: {
  tenantId: string;
  lat: number;
  lng: number;
  status: LocationStatus;
  address: string | null;
}): Promise<StoreLocation> {
  const address = input.address?.trim() || (await reverseGeocode(input.lng, input.lat));
  const { data, error } = await supabase
    .from("tenant_locations")
    .insert({
      tenant_id: input.tenantId,
      lat: input.lat,
      lng: input.lng,
      status: input.status,
      address,
      source: "manual",
    })
    .select("id, tenant_id, name, address, lat, lng, status")
    .single();
  if (error || !data) throw fromSupabase(error || { message: "Could not save the location." }, "location");
  invalidateBundle();
  const store = storeFrom(data as Row);
  if (!store) throw new DemandError("Could not save the location.", 500);
  return store;
}

export async function deleteLocation(id: string): Promise<void> {
  const { data, error } = await supabase.from("tenant_locations").delete().eq("id", id).select("id");
  if (error) throw fromSupabase(error, "delete location");
  if (!data?.length) throw new DemandError("Location not found.", 404);
  invalidateBundle();
}

export async function updateLocationStatus(id: string, status: LocationStatus): Promise<StoreLocation> {
  const { data, error } = await supabase
    .from("tenant_locations")
    .update({ status })
    .eq("id", id)
    .select("id, tenant_id, name, address, lat, lng, status")
    .maybeSingle();
  if (error) throw fromSupabase(error, "update location");
  if (!data) throw new DemandError("Location not found.", 404);
  invalidateBundle();
  const store = storeFrom(data as Row);
  if (!store) throw new DemandError("Could not update the location.", 500);
  return store;
}

export async function listingFocus(id: string): Promise<{
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  parcel: { type: string; coordinates: unknown } | null;
}> {
  const row = await oneListing(id);
  let parcel: { type: string; coordinates: unknown } | null = null;
  if (row.latitude != null && row.longitude != null) {
    const hit = await parcelAtPoint(row.longitude, row.latitude);
    if (hit) parcel = hit.geometry;
  }
  return { id: row.id, name: row.name, lat: row.latitude ?? null, lng: row.longitude ?? null, parcel };
}

export interface ContactWrite {
  contactType: ContactType;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
}

async function firmIdFor(company: string | null): Promise<string | null> {
  const name = company?.trim();
  if (!name) return null;
  const firms = await fetchAll("rep_firms", "id, name", ["name", "id"]);
  const found = firms.find((row) => String(row.name).toLowerCase() === name.toLowerCase());
  if (found) return String(found.id);
  const { data, error } = await supabase.from("rep_firms").insert({ name }).select("id, name").single();
  if (error || !data) throw fromSupabase(error || { message: "Could not add the company." }, "firm");
  return String((data as Row).id);
}

function contactFromRow(row: Row, firmName: string | null): ContactView {
  return {
    id: String(row.id),
    contactType: row.contact_type === "broker" ? "broker" : "in_house",
    name: String(row.name || ""),
    title: asString(row.title),
    firmName,
    email: asString(row.email),
    phone: asString(row.phone),
    isPrimary: row.is_primary === true,
    confidence: asString(row.confidence),
  };
}

async function contactById(tenantId: string, contactId: string): Promise<ContactView> {
  const { data, error } = await supabase.from("tenant_contacts").select("*").eq("id", contactId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw fromSupabase(error, "contact");
  if (!data) throw new DemandError("Contact not found.", 404);
  const row = data as Row;
  let firmName: string | null = null;
  if (row.firm_id) {
    const { data: firm } = await supabase.from("rep_firms").select("name").eq("id", String(row.firm_id)).maybeSingle();
    firmName = firm ? asString((firm as Row).name) : null;
  }
  return contactFromRow(row, firmName);
}

export async function createContact(tenantId: string, input: ContactWrite): Promise<ContactView> {
  if (!input.name.trim()) throw new DemandError("Name is required.", 400);
  const { data: tenant, error: tenantError } = await supabase.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (tenantError) throw fromSupabase(tenantError, "tenant");
  if (!tenant) throw new DemandError("Tenant not found.", 404);
  const firmId = await firmIdFor(input.company);
  const { data, error } = await supabase
    .from("tenant_contacts")
    .insert({
      tenant_id: tenantId,
      contact_type: input.contactType === "broker" ? "broker" : "in_house",
      firm_id: firmId,
      name: input.name.trim(),
      title: input.title,
      email: input.email,
      phone: input.phone,
      is_primary: false,
    })
    .select("id")
    .single();
  if (error || !data) throw fromSupabase(error || { message: "Could not add the contact." }, "contact");
  invalidateBundle();
  return contactById(tenantId, String((data as Row).id));
}

export async function updateContact(tenantId: string, contactId: string, input: ContactWrite): Promise<ContactView> {
  if (!input.name.trim()) throw new DemandError("Name is required.", 400);
  const firmId = await firmIdFor(input.company);
  const { data, error } = await supabase
    .from("tenant_contacts")
    .update({
      contact_type: input.contactType === "broker" ? "broker" : "in_house",
      firm_id: firmId,
      name: input.name.trim(),
      title: input.title,
      email: input.email,
      phone: input.phone,
    })
    .eq("id", contactId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) throw fromSupabase(error, "contact");
  if (!data?.length) throw new DemandError("Contact not found.", 404);
  invalidateBundle();
  return contactById(tenantId, contactId);
}

export async function deleteContact(tenantId: string, contactId: string): Promise<void> {
  const { data, error } = await supabase.from("tenant_contacts").delete().eq("id", contactId).eq("tenant_id", tenantId).select("id");
  if (error) throw fromSupabase(error, "delete contact");
  if (!data?.length) throw new DemandError("Contact not found.", 404);
  invalidateBundle();
}

const TENANT_LIST_COLS =
  "id, brand_name, category, sf_min, sf_max, acres_min, acres_max, spacing_miles, deal_lease, deal_buy, deal_ground_lease, deal_bts, freestanding, inline, deal_types_source, deal_types_confidence";
const CONTACT_LIST_COLS = "id, tenant_id, contact_type, firm_id, name, title, email, phone, is_primary, confidence";

/** The Demand list. Tenants, the contacts on them, and firm names — not the location table. */
export async function listDemandRows(): Promise<DemandListTenant[]> {
  const [tenants, contacts, firms] = await Promise.all([
    fetchAll("tenants", TENANT_LIST_COLS, ["brand_name", "id"]),
    fetchAll("tenant_contacts", CONTACT_LIST_COLS, ["id"]),
    fetchAll("rep_firms", "id, name", ["name", "id"]),
  ]);
  const firmName = new Map(firms.map((row) => [String(row.id), String(row.name || "")]));
  const byTenant = new Map<string, ContactView[]>();
  for (const row of contacts) {
    if (!row.tenant_id) continue;
    const tenantId = String(row.tenant_id);
    const view = contactFromRow(row, row.firm_id ? firmName.get(String(row.firm_id)) || null : null);
    const list = byTenant.get(tenantId) || [];
    list.push(view);
    byTenant.set(tenantId, list);
  }
  Array.from(byTenant.values()).forEach((list) => list.sort(contactOrder));
  return tenants.map((row) => ({
    id: String(row.id),
    brandName: String(row.brand_name || ""),
    category: String(row.category || "other"),
    sfMin: asNumber(row.sf_min),
    sfMax: asNumber(row.sf_max),
    acresMin: asNumber(row.acres_min),
    acresMax: asNumber(row.acres_max),
    spacingMiles: asNumber(row.spacing_miles),
    dealLease: asBoolean(row.deal_lease),
    dealBuy: asBoolean(row.deal_buy),
    dealGroundLease: asBoolean(row.deal_ground_lease),
    dealBts: asBoolean(row.deal_bts),
    freestanding: asBoolean(row.freestanding),
    inline: asBoolean(row.inline),
    dealTypesSource: asString(row.deal_types_source),
    dealTypesConfidence: confidenceOf(row.deal_types_confidence),
    contacts: byTenant.get(String(row.id)) || [],
  }));
}

export interface DemandEditContact {
  id: string | null;
  contactType: ContactType;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
}

export interface DemandEdit {
  brandName: string;
  category: string;
  sfMin: number | null;
  sfMax: number | null;
  acresMin: number | null;
  acresMax: number | null;
  spacingMiles: number | null;
  dealLease: boolean | null;
  dealBuy: boolean | null;
  dealGroundLease: boolean | null;
  dealBts: boolean | null;
  freestanding: boolean | null;
  inline: boolean | null;
  dealTypesSource: string | null;
  dealTypesConfidence: ResearchConfidence | null;
  contacts: DemandEditContact[];
}

async function ensureFirm(firms: Map<string, string>, company: string | null): Promise<string | null> {
  const name = company?.trim();
  if (!name) return null;
  const key = name.toLowerCase();
  const found = firms.get(key);
  if (found) return found;
  const { data, error } = await supabase.from("rep_firms").insert({ name }).select("id").single();
  if (error || !data) throw fromSupabase(error || { message: "Could not add the company." }, "firm");
  const id = String((data as Row).id);
  firms.set(key, id);
  return id;
}

async function syncEditContacts(tenantId: string, contacts: DemandEditContact[]): Promise<void> {
  const firmRows = await fetchAll("rep_firms", "id, name", ["name", "id"]);
  const firms = new Map(firmRows.map((row) => [String(row.name).toLowerCase(), String(row.id)]));
  const existing = await fetchAll("tenant_contacts", "id", ["id"], (query) => query.eq("tenant_id", tenantId));
  const keep = new Set<string>();
  for (const contact of contacts) {
    const name = contact.name.trim();
    if (!name) {
      if ((contact.email || "").trim() || (contact.phone || "").trim() || (contact.company || "").trim()) {
        throw new DemandError("Add a name for each contact.", 400);
      }
      continue;
    }
    const firmId = await ensureFirm(firms, contact.company);
    const payload = {
      contact_type: contact.contactType === "broker" ? "broker" : "in_house",
      firm_id: firmId,
      name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
    };
    if (contact.id && !contact.id.startsWith("new-")) {
      const { data, error } = await supabase.from("tenant_contacts").update(payload).eq("id", contact.id).eq("tenant_id", tenantId).select("id");
      if (error) throw fromSupabase(error, "contact");
      if (!data?.length) throw new DemandError("Contact not found.", 404);
      keep.add(contact.id);
    } else {
      const { data, error } = await supabase
        .from("tenant_contacts")
        .insert({ ...payload, tenant_id: tenantId, is_primary: false })
        .select("id")
        .single();
      if (error || !data) throw fromSupabase(error || { message: "Could not add the contact." }, "contact");
      keep.add(String((data as Row).id));
    }
  }
  const remove = existing.map((row) => String(row.id)).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("tenant_contacts").delete().in("id", remove).eq("tenant_id", tenantId);
    if (error) throw fromSupabase(error, "delete contact");
  }
}

/** Saves the list editor. Tiers, formats, and relationships are left as they are. */
export async function saveDemandEdit(id: string, input: DemandEdit): Promise<void> {
  const name = input.brandName.trim();
  const category = input.category.trim();
  if (!name || !category) throw new DemandError("Name and category are required.", 400);
  if (input.sfMin != null && input.sfMax != null && input.sfMin > input.sfMax) throw new DemandError("SF min cannot be above SF max.", 400);
  if (input.acresMin != null && input.acresMax != null && input.acresMin > input.acresMax) {
    throw new DemandError("Acres min cannot be above acres max.", 400);
  }
  assertConfidence(input.dealTypesConfidence);
  const { data, error } = await supabase.from("tenants").select("id, category").eq("id", id).maybeSingle();
  if (error) throw fromSupabase(error, "tenant");
  if (!data) throw new DemandError("Tenant not found.", 404);
  const currentCategory = String((data as Row).category || "");
  if (!isDemandCategory(category) && category !== currentCategory) throw new DemandError("Unknown category.", 400);
  const flags: DealFlags = {
    dealLease: input.dealLease,
    dealBuy: input.dealBuy,
    dealGroundLease: input.dealGroundLease,
    dealBts: input.dealBts,
    freestanding: input.freestanding,
    inline: input.inline,
    dealTypesSource: input.dealTypesSource,
    dealTypesConfidence: input.dealTypesConfidence,
  };
  const at = new Date().toISOString();
  const changed = await writeResearchLog(id, flags, at);
  const payload: Row = {
    brand_name: name,
    category,
    sf_min: input.sfMin,
    sf_max: input.sfMax,
    acres_min: input.acresMin,
    acres_max: input.acresMax,
    spacing_miles: input.spacingMiles,
    deal_lease: input.dealLease,
    deal_buy: input.dealBuy,
    deal_ground_lease: input.dealGroundLease,
    deal_bts: input.dealBts,
    freestanding: input.freestanding,
    inline: input.inline,
    deal_types_source: input.dealTypesSource,
    deal_types_confidence: input.dealTypesConfidence,
  };
  if (changed) {
    payload.last_researched = at;
    payload.research_status = "researched";
  }
  const { error: updateError } = await supabase.from("tenants").update(payload).eq("id", id);
  if (updateError) throw fromSupabase(updateError, "update tenant");
  await syncEditContacts(id, input.contacts);
  invalidateBundle();
}
