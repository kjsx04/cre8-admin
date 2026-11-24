/**
 * The tools the assistant can call. The model never writes SQL: each tool runs
 * one fixed, parameterized query as the read-only database role, with a hard row
 * cap, and returns a short shape plus the sources to show under the answer.
 *
 * Phase B covers listings, deals and the how-to guide. Documents come next.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEAL_SEARCH_COLUMNS,
  LISTING_COLUMNS,
  ROW_CAP,
  asEnum,
  asString,
  capRows,
  clampText,
  cleanSearchTerm,
  findGuideSections,
  isUuid,
  shapeDeal,
  shapeListing,
  type DealRow,
  type ListingRow,
} from "./shape";

export type Source = { label: string; href?: string };
export type ToolResult = { data: unknown; sources: Source[] };
export type ToolContext = { db: SupabaseClient; email: string; isOwner: boolean; guide: string };

export type AssistantTool = {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

const LISTING_STATUSES = ["draft", "live", "under_contract", "sold"] as const;
const DEAL_STATUSES = ["active", "due_diligence", "closing", "closed", "cancelled"] as const;
const DEAL_TYPES = ["sale", "lease"] as const;

function fail(error: { message: string } | null): never {
  throw new Error(`Database error: ${error?.message ?? "unknown"}`);
}

/** broker id -> name, for the ids that appear in these rows. */
async function brokerNamesFor(db: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await db.from("brokers").select("id, name").in("id", unique);
  if (error) fail(error);
  return Object.fromEntries((data ?? []).map((b: { id: string; name: string | null }) => [b.id, b.name ?? ""]));
}

/** ids of brokers whose name matches. */
async function brokerIdsByName(db: SupabaseClient, name: string): Promise<string[]> {
  const term = cleanSearchTerm(name);
  if (!term) return [];
  const { data, error } = await db.from("brokers").select("id").ilike("name", `%${term}%`).limit(5);
  if (error) fail(error);
  return (data ?? []).map((b: { id: string }) => b.id);
}

// ── Listings ────────────────────────────────────────────────

const searchListings: AssistantTool = {
  name: "search_listings",
  description:
    "Find CRE8 listings. Filter by words in the name or address, a city, a status, a property type or a broker. " +
    "Returns at most 10, newest first, and says if more matched.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words in the listing name or address." },
      city: { type: "string" },
      status: { type: "string", enum: [...LISTING_STATUSES] },
      property_type: { type: "string", description: "For example Land, Retail, Industrial." },
      broker: { type: "string", description: "A broker's name." },
    },
    additionalProperties: false,
  },
  async run(args, { db }) {
    let q = db.from("listings").select(LISTING_COLUMNS, { count: "exact" });

    const query = cleanSearchTerm(args.query);
    if (query) q = q.or(`name.ilike.%${query}%,full_address.ilike.%${query}%`);

    const city = cleanSearchTerm(args.city);
    if (city) q = q.or(`full_address.ilike.%${city}%,city_county.ilike.%${city}%`);

    const propertyType = cleanSearchTerm(args.property_type);
    if (propertyType) q = q.ilike("property_type", `%${propertyType}%`);

    switch (asEnum(args.status, LISTING_STATUSES)) {
      case "sold":
        q = q.eq("sold", true);
        break;
      case "under_contract":
        q = q.eq("under_contract", true).eq("sold", false);
        break;
      case "draft":
        q = q.is("published_at", null).eq("sold", false);
        break;
      case "live":
        q = q.not("published_at", "is", null).eq("sold", false).eq("under_contract", false);
        break;
      default:
        break;
    }

    const brokerName = asString(args.broker);
    if (brokerName) {
      const ids = await brokerIdsByName(db, brokerName);
      if (ids.length === 0) {
        return { data: { listings: [], matchCount: 0, truncated: false, note: `No broker named "${brokerName}".` }, sources: [] };
      }
      q = q.overlaps("broker_ids", ids);
    }

    const { data, count, error } = await q.order("updated_at", { ascending: false }).limit(ROW_CAP);
    if (error) fail(error);

    const rows = (data ?? []) as unknown as ListingRow[];
    const capped = capRows(rows, count);
    const names = await brokerNamesFor(db, capped.rows.flatMap((r) => r.broker_ids ?? []));
    const listings = capped.rows.map((r) => shapeListing(r, names));
    return {
      data: { listings, matchCount: capped.matchCount, truncated: capped.truncated },
      sources: listings.map((l) => ({ label: `Listing: ${l.name ?? l.address ?? l.id}`, href: `/listings/${l.id}` })),
    };
  },
};

const getListing: AssistantTool = {
  name: "get_listing",
  description:
    "Full detail for one listing: fields, spaces and the internal notes brokers keep (asking price, zoning and uses). " +
    "Give an id, or a name to look up.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" }, name: { type: "string" } },
    additionalProperties: false,
  },
  async run(args, { db }) {
    const id = asString(args.id);
    const name = cleanSearchTerm(args.name);
    if (!id && !name) throw new Error("Give an id or a name.");

    let q = db.from("listings").select(LISTING_COLUMNS);
    q = id && isUuid(id) ? q.eq("id", id) : q.ilike("name", `%${name || cleanSearchTerm(id)}%`);
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(2);
    if (error) fail(error);
    const rows = (data ?? []) as unknown as ListingRow[];
    if (rows.length === 0) return { data: { found: false }, sources: [] };

    const row = rows[0];
    const names = await brokerNamesFor(db, row.broker_ids ?? []);

    const [spaces, notes] = await Promise.all([
      db
        .from("listing_spaces")
        .select("label, space_type, acres, sf, drive_thru, deal, price_rate, status, notes")
        .eq("listing_id", row.id)
        .order("sort_order", { ascending: true })
        .limit(ROW_CAP),
      // Internal notes are keyed by the Webflow id (text), not the listing's uuid.
      row.webflow_id
        ? db
            .from("listing_internal_notes")
            .select("asking_price, zoning_uses, other, updated_at")
            .eq("listing_id", row.webflow_id)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (spaces.error) fail(spaces.error);
    if (notes.error) fail(notes.error);

    const note = (notes.data ?? [])[0] as { asking_price: string | null; zoning_uses: string | null; other: string | null; updated_at: string | null } | undefined;
    return {
      data: {
        found: true,
        listing: { ...shapeListing(row, names), overview: clampText(row.property_overview), spacesAvailable: row.spaces_available },
        otherMatches: rows.length > 1 ? "More than one listing matched; this is the most recently updated." : undefined,
        spaces: spaces.data ?? [],
        internalNotes: note
          ? { askingPrice: note.asking_price, zoningAndUses: clampText(note.zoning_uses), other: clampText(note.other), updatedAt: note.updated_at, visibility: "staff only" }
          : null,
      },
      sources: [{ label: `Listing: ${row.name ?? row.id}`, href: `/listings/${row.id}` }],
    };
  },
};

// ── Deals ───────────────────────────────────────────────────
// The database only returns deals the asker is a member of, or all of them for the
// owner. These tools do not filter by person on purpose: that rule lives in one place.

const searchDeals: AssistantTool = {
  name: "search_deals",
  description:
    "Find deals in Flow that the asker can see (their own; the owner sees all). Filter by words in the deal name or address, " +
    "status, sale or lease, or a broker's name. Returns at most 10, newest first, with key dates and brokers.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      status: { type: "string", enum: [...DEAL_STATUSES] },
      deal_type: { type: "string", enum: [...DEAL_TYPES] },
      broker: { type: "string", description: "A broker's name." },
    },
    additionalProperties: false,
  },
  async run(args, { db }) {
    let q = db.from("deals").select(DEAL_SEARCH_COLUMNS, { count: "exact" });

    const query = cleanSearchTerm(args.query);
    if (query) q = q.or(`deal_name.ilike.%${query}%,property_address.ilike.%${query}%`);

    const status = asEnum(args.status, DEAL_STATUSES);
    if (status) q = q.eq("status", status);
    const dealType = asEnum(args.deal_type, DEAL_TYPES);
    if (dealType) q = q.eq("deal_type", dealType);

    const brokerName = asString(args.broker);
    if (brokerName) {
      const brokerIds = await brokerIdsByName(db, brokerName);
      if (brokerIds.length === 0) {
        return { data: { deals: [], matchCount: 0, truncated: false, note: `No broker named "${brokerName}".` }, sources: [] };
      }
      const { data: members, error } = await db.from("deal_members").select("deal_id").in("broker_id", brokerIds).limit(200);
      if (error) fail(error);
      const dealIds = Array.from(new Set((members ?? []).map((m: { deal_id: string }) => m.deal_id)));
      if (dealIds.length === 0) return { data: { deals: [], matchCount: 0, truncated: false }, sources: [] };
      q = q.in("id", dealIds);
    }

    const { data, count, error } = await q.order("created_at", { ascending: false }).limit(ROW_CAP);
    if (error) fail(error);
    const capped = capRows((data ?? []) as unknown as DealRow[], count);
    const deals = capped.rows.map(shapeDeal);
    return {
      data: { deals, matchCount: capped.matchCount, truncated: capped.truncated },
      sources: deals.length ? [{ label: "Flow: deals", href: "/flow" }] : [],
    };
  },
};

const getDeal: AssistantTool = {
  name: "get_deal",
  description:
    "Full detail for one deal the asker can see: terms, key dates, brokers and splits, escrow details, lease payments and notes. " +
    "Give an id, or a deal name or address to look up.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" }, name: { type: "string" } },
    additionalProperties: false,
  },
  async run(args, { db }) {
    const id = asString(args.id);
    const name = cleanSearchTerm(args.name);
    if (!id && !name) throw new Error("Give an id or a name.");

    let q = db
      .from("deals")
      .select(
        "id, deal_name, property_address, deal_type, status, price, commission_rate, broker_split, additional_splits, " +
          "effective_date, escrow_open_date, feasibility_days, dd_extension_date, inside_close_days, outside_close_days, " +
          "actual_close_date, cancel_reason, notes, listing_id, parcel_number, sharepoint_folder_url, escrow_number, " +
          "escrow_company, lease_stage, w9_status, deal_dates(label, date, sort_order), " +
          "deal_members(split_percent, brokers(name)), lease_payments(sort_order, percent, payment_date, received, received_date)",
      );
    q = id && isUuid(id) ? q.eq("id", id) : q.or(`deal_name.ilike.%${name || cleanSearchTerm(id)}%,property_address.ilike.%${name || cleanSearchTerm(id)}%`);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(2);
    if (error) fail(error);
    const rows = (data ?? []) as unknown as (DealRow & Record<string, unknown>)[];
    if (rows.length === 0) {
      return { data: { found: false, note: "No deal matched, or it is not one you can see." }, sources: [] };
    }
    const row = rows[0];
    return {
      data: {
        found: true,
        deal: {
          ...shapeDeal(row),
          commissionRate: row.commission_rate,
          brokerSplit: row.broker_split,
          additionalSplits: row.additional_splits,
          feasibilityDays: row.feasibility_days,
          ddExtensionDate: row.dd_extension_date,
          insideCloseDays: row.inside_close_days,
          outsideCloseDays: row.outside_close_days,
          escrowCompany: row.escrow_company,
          escrowNumber: row.escrow_number,
          w9Status: row.w9_status,
          parcelNumber: row.parcel_number,
          cancelReason: row.cancel_reason,
          notes: clampText(row.notes),
          sharepointFolder: row.sharepoint_folder_url,
          leasePayments: row.lease_payments ?? [],
        },
        otherMatches: rows.length > 1 ? "More than one deal matched; this is the most recent." : undefined,
      },
      sources: [{ label: `Flow: ${row.deal_name ?? row.id}`, href: "/flow" }],
    };
  },
};

// ── The guide ───────────────────────────────────────────────

const lookupGuide: AssistantTool = {
  name: "lookup_how_cre8_works",
  description:
    "Look up how the CRE8 admin works: where to find a screen, how to do a task, what a tab does, where files live. " +
    "The guide is already in your instructions, so use this only when you need more of it than you can see there.",
  parameters: {
    type: "object",
    properties: { topic: { type: "string", description: "What the person wants to do or find." } },
    required: ["topic"],
    additionalProperties: false,
  },
  async run(args, { guide }) {
    const topic = asString(args.topic) ?? "";
    const sections = findGuideSections(guide, topic);
    return {
      data: sections.length
        ? { sections: sections.map((s) => ({ heading: s.heading, text: s.body })) }
        : { sections: [], note: "The guide has nothing on that. Say so rather than guessing." },
      sources: sections.map((s) => ({ label: `Guide: ${s.heading}` })),
    };
  },
};

export const ASSISTANT_TOOLS: AssistantTool[] = [searchListings, getListing, searchDeals, getDeal, lookupGuide];

export function toolByName(name: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}

/** Run one tool call from the model. A bad call becomes an error message the model can read, not a crash. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult> {
  const tool = toolByName(name);
  if (!tool) return { data: { error: `There is no tool called ${name}.` }, sources: [] };
  let args: Record<string, unknown> = {};
  try {
    const parsed = rawArgs ? JSON.parse(rawArgs) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    return { data: { error: "The arguments were not valid JSON." }, sources: [] };
  }
  try {
    return await tool.run(args, ctx);
  } catch (err) {
    return { data: { error: err instanceof Error ? err.message : "The tool failed." }, sources: [] };
  }
}
