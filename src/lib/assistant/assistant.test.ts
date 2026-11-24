/**
 * Run: npx tsx src/lib/assistant/assistant.test.ts   (or `npm test assistant`)
 *
 * The shaping helpers, the signed database token, the owner check and the tools,
 * run against a fake database that records the queries it is asked to make. No
 * network.
 */

import { createHash } from "crypto";
import { jwtVerify } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "./access";
import { AssistantDbConfigError, buildClaims, cleanJwtSecret, createAssistantDb, secretFingerprint, signAssistantToken, TOKEN_TTL_SECONDS } from "./db";
import {
  ROW_CAP,
  asEnum,
  capRows,
  cleanSearchTerm,
  clampText,
  findGuideSections,
  listingStatus,
  splitGuide,
} from "./shape";
import { ASSISTANT_TOOLS, runTool, type ToolContext } from "./tools";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

// ── A fake database that records every call ─────────────────

type Call = [string, unknown[]];
type Canned = { data: unknown; count?: number | null; error?: { message: string; code?: string } | null };

function fakeDb(tables: Record<string, Canned>) {
  const log: Record<string, Call[]> = {};
  const db = {
    from(table: string) {
      const calls: Call[] = (log[table] = log[table] ?? []);
      const proxy: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              const canned = tables[table] ?? { data: [] };
              return (resolve: (v: unknown) => void) =>
                resolve({ data: canned.data, count: canned.count ?? null, error: canned.error ?? null });
            }
            return (...args: unknown[]) => {
              calls.push([prop, args]);
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
  return { db: db as unknown as SupabaseClient, log };
}

const calledWith = (log: Record<string, Call[]>, table: string, method: string) =>
  (log[table] ?? []).filter(([m]) => m === method).map(([, a]) => a);

const GUIDE = "# Title\n\nintro\n\n## 3. Listings\nCreate or publish a listing.\n\n## 4. Flow: deals\nThe deal board and escrow dates.\n\n## 11. Where files live\nSharePoint folders.\n";

// ── shape helpers ───────────────────────────────────────────

assert(cleanSearchTerm("mesa, dr)") === "mesa dr", "search words lose commas and parentheses");
assert(cleanSearchTerm("100%_off*") === "100 off", "search words lose wildcards");
assert(cleanSearchTerm("a),name.eq.x") === "a name.eq.x", "a filter-injection attempt cannot close the or() group");
assert(cleanSearchTerm(42) === "", "a non-string search word is empty");
assert(cleanSearchTerm("x".repeat(500)).length === 80, "search words are cut at 80 characters");

const capped = capRows(Array.from({ length: 25 }, (_, i) => i), 64);
assert(capped.rows.length === ROW_CAP && capped.truncated && capped.matchCount === 64, "rows are capped at 10 and the true match count is kept");
assert(!capRows([1, 2, 3], 3).truncated, "three rows are not truncated");
assert(capRows([1, 2], null).matchCount === 2, "a missing count falls back to the row count");

assert(asEnum("sold", ["sold", "live"] as const) === "sold", "a known value passes asEnum");
assert(asEnum("DROP TABLE", ["sold", "live"] as const) === undefined, "an unknown value is dropped by asEnum");
assert(clampText("a".repeat(5000))!.length < 1700, "long notes are cut down");
assert(clampText("   ") === null, "blank text is null");

assert(listingStatus({ sold: true, under_contract: true, published_at: null }) === "Sold", "sold wins over everything");
assert(listingStatus({ sold: false, under_contract: true, published_at: null }) === "Draft", "unpublished is a draft");
assert(listingStatus({ sold: false, under_contract: true, published_at: "2026-01-01" }) === "Under Contract", "published and under contract");
assert(listingStatus({ sold: false, under_contract: false, published_at: "2026-01-01" }) === "Live", "published is live");

assert(splitGuide(GUIDE).length === 3, "the guide splits on its ## headings");
assert(findGuideSections(GUIDE, "where do I find the escrow dates")[0]?.heading === "4. Flow: deals", "an escrow question finds the Flow section");
assert(findGuideSections(GUIDE, "zzz qqq").length === 0, "an unknown topic finds nothing");

// ── the owner check ─────────────────────────────────────────

assert(isOwnerEmail("Kevin@CRE8Advisors.com"), "Kevin is the owner, whatever the case");
assert(!isOwnerEmail("andy@cre8advisors.com"), "another broker is not the owner");
assert(isOwnerEmail("andy@cre8advisors.com", "andy@cre8advisors.com"), "ASSISTANT_OWNER_EMAILS adds owners");
assert(!isOwnerEmail(null), "no email is not the owner");

// ── the signed database token ───────────────────────────────

(async () => {
  const claims = buildClaims("  Andy@CRE8Advisors.com ", false);
  assert(claims.role === "assistant_readonly", "the token names the read-only role");
  assert(claims.email === "andy@cre8advisors.com", "the email claim is lower-cased and trimmed");
  assert(claims.cre8_owner === "false" && buildClaims("k@x.com", true).cre8_owner === "true", "the owner flag is a string claim");

  const secret = "test-secret-test-secret-test-secret!!";
  const token = await signAssistantToken(secret, "andy@cre8advisors.com", false, 1_000_000);
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { currentDate: new Date(1_000_100 * 1000) });
  assert(payload.role === "assistant_readonly" && payload.email === "andy@cre8advisors.com", "the token verifies and carries the role and email");
  assert(payload.exp === 1_000_000 + TOKEN_TTL_SECONDS, `the token lives ${TOKEN_TTL_SECONDS} seconds`);
  let wrongSecretRejected = false;
  try {
    await jwtVerify(token, new TextEncoder().encode("another-secret-another-secret-123456"));
  } catch {
    wrongSecretRejected = true;
  }
  assert(wrongSecretRejected, "a token signed with one secret is refused by another");

  // A secret pasted with a newline, spaces or an invisible character signs the same token as the clean one.
  assert(cleanJwtSecret(`  ${secret}\n`) === secret, "the JWT secret loses surrounding whitespace and newlines");
  assert(cleanJwtSecret(`\uFEFF${secret}\u200B`) === secret, "the JWT secret loses a byte-order mark and zero-width characters");
  const dirty = await signAssistantToken(cleanJwtSecret(`${secret}\r\n`), "andy@cre8advisors.com", false, 1_000_000);
  assert(dirty === token, "a cleaned secret signs exactly the same token");
  const fp = secretFingerprint(secret);
  assert(fp.length === secret.length, "the fingerprint reports the length");
  assert(fp.sha256Prefix === createHash("sha256").update(secret).digest("hex").slice(0, 8), "the fingerprint is the first 8 hex of the SHA-256");
  assert(!JSON.stringify(fp).includes(secret.slice(0, 6)), "the fingerprint never contains the secret");

  const saved = { ...process.env };
  delete process.env.SUPABASE_JWT_SECRET;
  let configError = false;
  try {
    await createAssistantDb("andy@cre8advisors.com", false);
  } catch (err) {
    configError = err instanceof AssistantDbConfigError;
  }
  process.env = saved;
  assert(configError, "with no JWT secret the assistant refuses to start instead of using the service key");

  // ── the tools ─────────────────────────────────────────────

  assert(ASSISTANT_TOOLS.every((t) => /^[a-z0-9_]+$/.test(t.name) && t.description.length > 20), "every tool has a plain name and a description");
  assert(!ASSISTANT_TOOLS.some((t) => /insert|update|delete|send|write/i.test(t.name)), "no tool name suggests a write");

  const listingRow = {
    id: "11111111-1111-4111-8111-111111111111", name: "Mesa Dr", full_address: "1849 S Mesa Dr", city_county: "Mesa, Maricopa",
    acres: 2.2, building_sqft: null, list_price: "$1,200,000", listing_type: "Sale", property_type: "Land", zoning: "C-2",
    zoning_municipality: "Mesa", cross_streets: null, traffic_count: null, latitude: null, longitude: null,
    property_overview: "o", spaces_available: null, available: true, sold: false, under_contract: false, featured: false,
    broker_ids: ["b1"], webflow_id: "wf-1", published_at: "2026-01-01", updated_at: "2026-11-01",
  };

  {
    const { db, log } = fakeDb({
      listings: { data: Array.from({ length: 10 }, () => listingRow), count: 37 },
      brokers: { data: [{ id: "b1", name: "Kevin Smith" }] },
    });
    const ctx: ToolContext = { db, email: "andy@cre8advisors.com", isOwner: false, guide: GUIDE };
    const out = await runTool("search_listings", JSON.stringify({ query: "mesa, dr)", status: "under_contract", city: "Mesa" }), ctx);
    const data = out.data as { listings: { brokers: string[] }[]; matchCount: number; truncated: boolean };
    assert(data.listings.length === 10 && data.truncated && data.matchCount === 37, "listing search reports 10 of 37 and says it was truncated");
    assert(data.listings[0].brokers[0] === "Kevin Smith", "listing search resolves broker names");
    assert(calledWith(log, "listings", "limit")[0][0] === ROW_CAP, "listing search asks the database for at most 10 rows");
    assert(calledWith(log, "listings", "or")[0][0] === "name.ilike.%mesa dr%,full_address.ilike.%mesa dr%", "the search words are cleaned before they reach the filter");
    assert(JSON.stringify(calledWith(log, "listings", "eq")) === JSON.stringify([["under_contract", true], ["sold", false]]), "under-contract status filters on the right columns");
    assert(out.sources[0].href === "/listings/11111111-1111-4111-8111-111111111111", "each listing links to its edit page");
  }

  {
    const { db } = fakeDb({ brokers: { data: [] } });
    const out = await runTool("search_listings", JSON.stringify({ broker: "Nobody" }), { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    assert((out.data as { listings: unknown[] }).listings.length === 0, "an unknown broker gives no listings, not all of them");
  }

  {
    const { db, log } = fakeDb({
      listings: { data: [listingRow] },
      brokers: { data: [{ id: "b1", name: "Kevin Smith" }] },
      listing_spaces: { data: [{ label: "Pad A", sf: 3000 }] },
      listing_internal_notes: { data: [{ asking_price: "$1.1M", zoning_uses: "retail", other: "x".repeat(4000), updated_at: "2026-11-02" }] },
    });
    const out = await runTool("get_listing", JSON.stringify({ name: "Mesa Dr" }), { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    const data = out.data as { found: boolean; spaces: unknown[]; internalNotes: { askingPrice: string; other: string } };
    assert(data.found && data.spaces.length === 1, "get_listing returns the listing and its spaces");
    assert(data.internalNotes.askingPrice === "$1.1M" && data.internalNotes.other.length < 1700, "internal notes come back, cut to a sane length");
    assert(calledWith(log, "listing_internal_notes", "eq")[0][1] === "wf-1", "internal notes are looked up by the Webflow id, not the uuid");
    assert(calledWith(log, "listing_spaces", "eq")[0][1] === listingRow.id, "spaces are looked up by the listing's uuid");
  }

  {
    const { db } = fakeDb({ listings: { data: [] } });
    const out = await runTool("get_listing", JSON.stringify({ name: "Nowhere" }), { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    assert((out.data as { found: boolean }).found === false, "get_listing says so when nothing matches");
    const bad = await runTool("get_listing", "{}", { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    assert(typeof (bad.data as { error?: string }).error === "string", "get_listing with no id or name returns an error message, not a crash");
  }

  {
    const dealRow = { id: "d1", deal_name: "SR85", property_address: "x", deal_type: "sale", status: "active", price: 1, effective_date: null, escrow_open_date: null, actual_close_date: null, lease_stage: null, listing_id: null,
      deal_dates: [{ label: "Close", date: "2026-12-01", sort_order: 2 }, { label: "Escrow", date: "2026-11-01", sort_order: 1 }],
      deal_members: [{ split_percent: 50, brokers: { name: "Kevin Smith" } }] };
    const { db, log } = fakeDb({ deals: { data: [dealRow], count: 1 }, brokers: { data: [{ id: "b1" }] }, deal_members: { data: [{ deal_id: "d1" }] } });
    const out = await runTool("search_deals", JSON.stringify({ status: "active", broker: "Kevin", deal_type: "robbery" }), { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    const data = out.data as { deals: { keyDates: { label: string }[]; brokers: { name: string }[] }[] };
    assert(data.deals[0].keyDates[0].label === "Escrow", "key dates come back in order");
    assert(data.deals[0].brokers[0].name === "Kevin Smith", "deal brokers are named");
    assert(calledWith(log, "deals", "eq").every(([col]) => col !== "deal_type"), "an invalid deal type is ignored, not passed to the database");
    assert(JSON.stringify(calledWith(log, "deals", "in")[0]) === JSON.stringify(["id", ["d1"]]), "a broker filter narrows by that broker's deals");
    assert(calledWith(log, "deals", "limit")[0][0] === ROW_CAP, "deal search asks for at most 10 rows");
  }

  {
    const { db } = fakeDb({ deals: { data: [] } });
    const out = await runTool("get_deal", JSON.stringify({ name: "Not mine" }), { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    assert((out.data as { found: boolean }).found === false, "a deal the asker cannot see looks the same as one that does not exist");
  }

  {
    const { db } = fakeDb({ listings: { data: [], error: { message: "permission denied for table x" } } });
    const out = await runTool("search_listings", "{}", { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    assert(/permission denied/.test((out.data as { error: string }).error), "a database error becomes a readable tool error");
    assert((out.data as { status: string }).status === "error" && out.failure?.tool === "search_listings", "a database error is marked as a failure, not an empty result");
    assert(!("listings" in (out.data as object)), "a failed search does not look like a search that found nothing");
  }

  {
    // The Nov 24 failure: PostgREST refuses the token. It must read as a failed lookup.
    const { db } = fakeDb({ listings: { data: null, error: { message: "JWSError JWSInvalidSignature", code: "PGRST301" } } });
    const errors: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(" "));
    const out = await runTool("get_listing", JSON.stringify({ name: "Mesa Dr" }), { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE });
    console.error = realError;
    const data = out.data as { found?: boolean; lookupFailed: boolean; error: string; instruction: string };
    assert(data.found === undefined && data.lookupFailed, "a rejected token is a failed lookup, not found:false");
    assert(/sign-in token/.test(data.error) && out.failure?.code === "PGRST301", "the error names the rejected token and keeps the code");
    assert(/Do not say it was not found/.test(data.instruction), "the model is told not to report a failure as not found");
    assert(errors.some((e) => /tool get_listing failed/.test(e) && /PGRST301/.test(e)), "the failure is written to the server log with its code");
  }

  {
    const { db, log } = fakeDb({ deals: { data: [], count: 0 } });
    await runTool("search_deals", JSON.stringify({ status: "under_contract" }), { db, email: "a@cre8advisors.com", isOwner: true, guide: GUIDE });
    assert(JSON.stringify(calledWith(log, "deals", "in")[0]) === JSON.stringify(["status", ["due_diligence", "closing"]]), "deals under contract means due diligence or closing");
    assert(calledWith(log, "deals", "eq").length === 0, "under_contract is never sent as a literal deal status");
  }

  {
    const { db } = fakeDb({});
    const ctx: ToolContext = { db, email: "a@cre8advisors.com", isOwner: false, guide: GUIDE };
    const guide = await runTool("lookup_how_cre8_works", JSON.stringify({ topic: "escrow dates" }), ctx);
    assert((guide.data as { sections: unknown[] }).sections.length === 1, "the guide tool finds the Flow section");
    assert((await runTool("drop_everything", "{}", ctx)).sources.length === 0 && /no tool/i.test(JSON.stringify((await runTool("drop_everything", "{}", ctx)).data)), "an unknown tool is refused");
    assert(/not valid JSON/.test(JSON.stringify((await runTool("search_listings", "{not json", ctx)).data)), "bad JSON arguments are reported, not thrown");
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks passed");
})();
