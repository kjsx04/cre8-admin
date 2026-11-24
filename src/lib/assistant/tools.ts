/**
 * The tools the assistant can call. The model never writes SQL: each tool runs
 * one fixed, parameterized query as the read-only database role, with a hard row
 * cap, and returns a short shape plus the sources to show under the answer.
 *
 * Phase B covers listings, deals and the how-to guide. Documents come next.
 * One tool, open_page, takes the person to an admin page. It only accepts
 * pages from a fixed list (shape.ts, openablePath), and it moves the browser,
 * nothing else: it still cannot change any data.
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
  anyWordFilter,
  cleanSearchTerm,
  dealAdminUrl,
  everyWordFilters,
  searchWords,
  wordScore,
  findGuideSections,
  htmlToText,
  listingAdminUrl,
  listingPublicUrl,
  openablePath,
  shapeSpace,
  type SpaceRow,
  isUuid,
  shapeDeal,
  shapeListing,
  type DealRow,
  type ListingRow,
} from "./shape";

export type Source = { label: string; href?: string };
/** Set when the tool could not do its job. The data then says so; it is never an empty result. */
export type ToolFailure = { tool: string; message: string; code?: string };
export type ToolResult = {
  data: unknown;
  sources: Source[];
  failure?: ToolFailure;
  /** An admin path the browser should go to (open_page only). */
  navigate?: string;
};
export type ToolContext = { db: SupabaseClient; email: string; isOwner: boolean; guide: string };

export type AssistantTool = {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

const LISTING_STATUSES = ["draft", "live", "under_contract", "sold"] as const;
// "under_contract" is not a stored deal status: it means due diligence or closing.
const DEAL_STATUSES = ["active", "due_diligence", "closing", "closed", "cancelled", "under_contract"] as const;
const UNDER_CONTRACT_DEAL_STATUSES = ["due_diligence", "closing"];
const DEAL_TYPES = ["sale", "lease"] as const;

/** A database read failed. Carries PostgREST's code (for example PGRST301, a rejected token). */
export class ToolDbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ToolDbError";
    this.code = code;
  }
}

type DbError = { message?: string; code?: string; details?: string | null; hint?: string | null };

function fail(error: DbError | null): never {
  const code = error?.code || undefined;
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303") {
    throw new ToolDbError(`Database rejected the assistant's sign-in token (${code}: ${error?.message ?? "no message"})`, code);
  }
  throw new ToolDbError(`Database error${code ? ` ${code}` : ""}: ${error?.message ?? "unknown"}`, code);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

/**
 * Run a word search. First every word must match (in any field); if that finds
 * nothing and there was more than one word, fall back to rows matching ANY word,
 * ranked by how many words they contain. `base()` builds the query with every
 * other filter, so both passes apply them.
 */
async function wordSearch<T extends { id: string }>(opts: {
  base: () => AnyQuery;
  words: string[];
  fields: string[];
  orderBy: string;
  limit: number;
  score: (row: T) => number;
}): Promise<{ rows: T[]; count: number | null; closestMatches: boolean }> {
  let q = opts.base();
  for (const f of everyWordFilters(opts.words, opts.fields)) q = q.or(f);
  const { data, count, error } = await q.order(opts.orderBy, { ascending: false }).limit(opts.limit);
  if (error) fail(error);
  const rows = (data ?? []) as T[];
  if (rows.length > 0 || opts.words.length < 2) return { rows, count: count ?? null, closestMatches: false };

  const loose = await opts
    .base()
    .or(anyWordFilter(opts.words, opts.fields))
    .order(opts.orderBy, { ascending: false })
    .limit(40);
  if (loose.error) fail(loose.error);
  const ranked = ((loose.data ?? []) as T[])
    .map((row) => ({ row, score: opts.score(row) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.row);
  return { rows: ranked.slice(0, opts.limit), count: ranked.length, closestMatches: ranked.length > 0 };
}

const CLOSEST_NOTE = "Nothing matched every word, so these are the closest matches (most words in common first). Say they are close matches.";

const LISTING_TEXT_FIELDS = ["name", "full_address", "property_overview", "spaces_available"];
const DEAL_TEXT_FIELDS = ["deal_name", "property_address"];

/** broker id -> name, for the ids that appear in these rows. */
async function brokerNamesFor(db: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await db.from("brokers").select("id, name").in("id", unique);
  if (error) fail(error);
  return Object.fromEntries((data ?? []).map((b: { id: string; name: string | null }) => [b.id, b.name ?? ""]));
}

const SPACE_COLUMNS = "listing_id, label, space_type, acres, sf, drive_thru, deal, price_rate, status, notes, sort_order";

/** listing id -> its pads/spaces, for the listings in these rows. */
async function spacesFor(db: SupabaseClient, listingIds: string[]): Promise<Record<string, ReturnType<typeof shapeSpace>[]>> {
  if (listingIds.length === 0) return {};
  const { data, error } = await db.from("listing_spaces").select(SPACE_COLUMNS).in("listing_id", listingIds).order("sort_order", { ascending: true }).limit(200);
  if (error) fail(error);
  const out: Record<string, ReturnType<typeof shapeSpace>[]> = {};
  for (const row of (data ?? []) as SpaceRow[]) {
    if (!row.listing_id) continue;
    (out[row.listing_id] = out[row.listing_id] ?? []).push(shapeSpace(row));
  }
  return out;
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
    "Find CRE8 listings. Filter by words (matched in the name, address AND description, so 'pad' or 'fully improved' work), " +
    "a city, a status, a property type or a broker. Each result includes its pads/spaces with acreage, a short description, " +
    "and links: adminUrl (the admin page) and publicUrl (the public website page, live listings only). " +
    "Pads are often typed Land or Improved Land, not Retail, so for pad or size questions leave property_type out and read the pads and description. " +
    "Returns at most 10, newest first, and says if more matched.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words in the listing name, address or description." },
      city: { type: "string" },
      status: { type: "string", enum: [...LISTING_STATUSES] },
      property_type: { type: "string", description: "A loose label such as Land, Retail, Industrial. Leave out for pad or size questions." },
      broker: { type: "string", description: "A broker's name." },
    },
    additionalProperties: false,
  },
  async run(args, { db }) {
    const words = searchWords(args.query);
    const city = cleanSearchTerm(args.city);
    const propertyType = cleanSearchTerm(args.property_type);
    const status = asEnum(args.status, LISTING_STATUSES);

    let brokerIds: string[] | null = null;
    const brokerName = asString(args.broker);
    if (brokerName) {
      brokerIds = await brokerIdsByName(db, brokerName);
      if (brokerIds.length === 0) {
        return { data: { listings: [], matchCount: 0, truncated: false, note: `No broker named "${brokerName}".` }, sources: [] };
      }
    }

    // Every filter except the search words.
    const base = () => {
      let q = db.from("listings").select(LISTING_COLUMNS, { count: "exact" });
      if (city) q = q.or(`full_address.ilike.%${city}%,city_county.ilike.%${city}%`);
      if (propertyType) q = q.ilike("property_type", `%${propertyType}%`);
      switch (status) {
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
      if (brokerIds) q = q.overlaps("broker_ids", brokerIds);
      return q;
    };

    const found = await wordSearch<ListingRow>({
      base,
      words,
      fields: LISTING_TEXT_FIELDS,
      orderBy: "updated_at",
      limit: ROW_CAP,
      score: (r) => wordScore(words, r.name, r.full_address, r.property_overview, r.spaces_available),
    });

    const rows = found.rows;
    const capped = capRows(rows, found.count);
    const [names, spaces] = await Promise.all([
      brokerNamesFor(db, capped.rows.flatMap((r) => r.broker_ids ?? [])),
      spacesFor(db, capped.rows.map((r) => r.id)),
    ]);
    const listings = capped.rows.map((r) => ({
      ...shapeListing(r, names),
      pads: spaces[r.id] ?? [],
      // Many pads are only described in the text, so the model gets a short plain-text version.
      spacesText: htmlToText(r.spaces_available, 400),
      description: htmlToText(r.property_overview, 400),
    }));
    return {
      data: {
        listings,
        matchCount: capped.matchCount,
        truncated: capped.truncated,
        ...(found.closestMatches ? { closestMatches: true, note: CLOSEST_NOTE } : {}),
      },
      sources: listings.map((l) => ({ label: `Listing: ${l.name ?? l.address ?? l.id}`, href: l.adminUrl })),
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

    let rows: ListingRow[];
    let closestMatches = false;
    if (id && isUuid(id)) {
      const { data, error } = await db.from("listings").select(LISTING_COLUMNS).eq("id", id).limit(1);
      if (error) fail(error);
      rows = (data ?? []) as unknown as ListingRow[];
    } else {
      const words = searchWords(name || id);
      if (words.length === 0) throw new Error("Give an id or a name.");
      const found = await wordSearch<ListingRow>({
        base: () => db.from("listings").select(LISTING_COLUMNS),
        words,
        fields: ["name", "full_address"],
        orderBy: "updated_at",
        limit: 2,
        score: (r) => wordScore(words, r.name, r.full_address),
      });
      rows = found.rows;
      closestMatches = found.closestMatches;
    }
    if (rows.length === 0) return { data: { found: false }, sources: [] };

    const row = rows[0];
    const names = await brokerNamesFor(db, row.broker_ids ?? []);

    const [spaces, notes] = await Promise.all([
      db
        .from("listing_spaces")
        .select(SPACE_COLUMNS)
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
        listing: { ...shapeListing(row, names), overview: htmlToText(row.property_overview), spacesAvailable: htmlToText(row.spaces_available) },
        otherMatches: rows.length > 1 ? "More than one listing matched; this is the best match." : undefined,
        closestMatch: closestMatches ? "Not every word matched; this is the closest listing. Say so." : undefined,
        spaces: ((spaces.data ?? []) as SpaceRow[]).map(shapeSpace),
        internalNotes: note
          ? { askingPrice: note.asking_price, zoningAndUses: clampText(note.zoning_uses), other: clampText(note.other), updatedAt: note.updated_at, visibility: "staff only" }
          : null,
      },
      sources: [
        { label: `Listing: ${row.name ?? row.id}`, href: listingAdminUrl(row.id) },
        ...(listingPublicUrl(row) ? [{ label: "Public page", href: listingPublicUrl(row)! }] : []),
      ],
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
    "status, sale or lease, or a broker's name. Status under_contract means due diligence or closing. " +
    "Returns at most 10, newest first, with key dates and brokers.",
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
    const words = searchWords(args.query);
    const status = asEnum(args.status, DEAL_STATUSES);
    const dealType = asEnum(args.deal_type, DEAL_TYPES);
    let dealIds: string[] | null = null;

    const brokerName = asString(args.broker);
    if (brokerName) {
      const brokerIds = await brokerIdsByName(db, brokerName);
      if (brokerIds.length === 0) {
        return { data: { deals: [], matchCount: 0, truncated: false, note: `No broker named "${brokerName}".` }, sources: [] };
      }
      const { data: members, error } = await db.from("deal_members").select("deal_id").in("broker_id", brokerIds).limit(200);
      if (error) fail(error);
      dealIds = Array.from(new Set((members ?? []).map((m: { deal_id: string }) => m.deal_id)));
      if (dealIds.length === 0) return { data: { deals: [], matchCount: 0, truncated: false }, sources: [] };
    }

    const base = () => {
      let q = db.from("deals").select(DEAL_SEARCH_COLUMNS, { count: "exact" });
      if (status === "under_contract") q = q.in("status", UNDER_CONTRACT_DEAL_STATUSES);
      else if (status) q = q.eq("status", status);
      if (dealType) q = q.eq("deal_type", dealType);
      if (dealIds) q = q.in("id", dealIds);
      return q;
    };
    const found = await wordSearch<DealRow>({
      base,
      words,
      fields: DEAL_TEXT_FIELDS,
      orderBy: "created_at",
      limit: ROW_CAP,
      score: (r) => wordScore(words, r.deal_name, r.property_address),
    });
    const capped = capRows(found.rows, found.count);
    const deals = capped.rows.map(shapeDeal);
    return {
      data: {
        deals,
        matchCount: capped.matchCount,
        truncated: capped.truncated,
        ...(found.closestMatches ? { closestMatches: true, note: CLOSEST_NOTE } : {}),
      },
      sources: deals.map((d) => ({ label: `Deal: ${d.name ?? d.address ?? d.id}`, href: d.adminUrl })),
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

    const DETAIL_COLUMNS = (
        "id, deal_name, property_address, deal_type, status, price, commission_rate, broker_split, additional_splits, " +
          "effective_date, escrow_open_date, feasibility_days, dd_extension_date, inside_close_days, outside_close_days, " +
          "actual_close_date, cancel_reason, notes, listing_id, parcel_number, sharepoint_folder_url, escrow_number, " +
          "escrow_company, lease_stage, w9_status, deal_dates(label, date, sort_order), " +
          "deal_members(split_percent, brokers(name)), lease_payments(sort_order, percent, payment_date, received, received_date)"
    );
    type DetailRow = DealRow & Record<string, unknown>;
    let rows: DetailRow[];
    if (id && isUuid(id)) {
      const { data, error } = await db.from("deals").select(DETAIL_COLUMNS).eq("id", id).limit(1);
      if (error) fail(error);
      rows = (data ?? []) as unknown as DetailRow[];
    } else {
      const words = searchWords(name || id);
      if (words.length === 0) throw new Error("Give an id or a name.");
      const found = await wordSearch<DetailRow>({
        base: () => db.from("deals").select(DETAIL_COLUMNS),
        words,
        fields: DEAL_TEXT_FIELDS,
        orderBy: "created_at",
        limit: 2,
        score: (r) => wordScore(words, r.deal_name, r.property_address),
      });
      rows = found.rows;
    }
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
      sources: [{ label: `Deal: ${row.deal_name ?? row.id}`, href: dealAdminUrl(row.id) }],
    };
  },
};

// ── Taking the person somewhere ─────────────────────────────

const openPage: AssistantTool = {
  name: "open_page",
  description:
    "Take the person to a page in the admin, when they ask you to (\"take me there\", \"open it\", \"go to Flow\"). " +
    "Allowed: / (Listings), /listings/new, /flow, /docs, /marketing, /logos, /demand, /intel, " +
    "a listing's adminUrl (/listings/<id>/edit) or a deal's adminUrl (/flow?deal=<id>). Use the id from a lookup; never guess one. " +
    "This cannot open public website pages: give those as a link instead.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "The admin path, for example /listings/new." } },
    required: ["path"],
    additionalProperties: false,
  },
  async run(args) {
    const target = openablePath(args.path);
    if (!target) {
      return {
        data: { opened: false, note: "That is not an admin page I can open. Give the person a link or say where it is instead." },
        sources: [],
      };
    }
    return { data: { opened: true, page: target.label, path: target.path }, sources: [], navigate: target.path };
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

export const ASSISTANT_TOOLS: AssistantTool[] = [searchListings, getListing, searchDeals, getDeal, openPage, lookupGuide];

export function toolByName(name: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}

/**
 * What the model reads when a tool fails. Worded so it cannot be mistaken for
 * "nothing matched": a failed lookup says nothing about whether the thing exists.
 */
export function failedToolData(message: string) {
  return {
    status: "error",
    lookupFailed: true,
    error: message,
    instruction:
      "This lookup FAILED. It returned no data, so it says nothing about whether the item exists. " +
      "Tell the person the lookup failed and to try again or tell Kevin. Do not say it was not found or does not exist.",
  };
}

function failure(tool: string, message: string, code?: string): ToolResult {
  return { data: failedToolData(message), sources: [], failure: { tool, message, code } };
}

/**
 * Run one tool call from the model. A bad call or a failed read becomes an
 * explicit error the model can read (never an empty result), and is logged.
 */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult> {
  const tool = toolByName(name);
  if (!tool) return { data: { status: "error", error: `There is no tool called ${name}.` }, sources: [], failure: { tool: name, message: "unknown tool" } };
  let args: Record<string, unknown> = {};
  try {
    const parsed = rawArgs ? JSON.parse(rawArgs) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    return { data: { status: "error", error: "The arguments were not valid JSON." }, sources: [], failure: { tool: name, message: "invalid arguments" } };
  }
  try {
    return await tool.run(args, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The tool failed.";
    const code = err instanceof ToolDbError ? err.code : undefined;
    // Loud on purpose: a failed read must show up in Vercel's logs, not only in the chat.
    console.error(`[assistant] tool ${name} failed for ${ctx.email}${code ? ` [${code}]` : ""}: ${message}`);
    return failure(name, message, code);
  }
}
