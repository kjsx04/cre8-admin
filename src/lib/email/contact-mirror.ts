/**
 * Contact mirror — a local copy of the Resend contact book in Supabase.
 *
 * Why this exists:
 *   Resend's contact API is paginated 100 at a time, rate-limits back-to-back
 *   walks, and its global `GET /contacts` stops at 1,000 rows. Searching the
 *   audience box against it meant ~60 requests per cold search and only ever
 *   looked at the first 1,000 of ~5,900 contacts.
 *
 *   So a nightly job walks every segment (which does return full membership)
 *   and writes the result to `email_contacts`. The audience search then hits
 *   one indexed Postgres query — fast, complete, and no Resend calls.
 *
 * Freshness: the mirror is rebuilt nightly by /api/email/cron. Contacts added
 * in Resend during the day are still reachable because the search route falls
 * back to a direct Resend lookup for an exact email address.
 */

import { supabase } from "@/lib/flow/supabase";
import { listAllContacts, listSegments, lookupContactByEmail } from "./provider";
import type { MatchedContact } from "./contact-match";

/** One row of the mirror */
export type MirroredContact = MatchedContact & {
  segment_ids: string[];
};

const UPSERT_CHUNK = 500;
const HYDRATE_TIMEOUT_MS = 500;        // search never waits longer than this for company
const COMPANY_BACKFILL_PER_NIGHT = 800; // nightly top-up so the mirror fills in over time
const COMPANY_BATCH = 20;              // parallel lookups per batch during the backfill

/**
 * Rebuild the mirror from Resend.
 * Walks each segment (segment endpoints return full membership, unlike the
 * capped global list), merges them by email, then upserts in chunks.
 */
export async function syncContactMirror(): Promise<{
  contacts: number;
  segments: number;
  removed: number;
}> {
  const segments = await listSegments();
  const byEmail = new Map<string, MirroredContact>();

  for (const seg of segments) {
    const rows = await listAllContacts(seg.id);
    for (const c of rows) {
      const key = (c.email || "").toLowerCase();
      if (!key) continue;
      const existing = byEmail.get(key);
      if (existing) {
        // Already seen in another segment — just record this membership
        if (!existing.segment_ids.includes(seg.id)) existing.segment_ids.push(seg.id);
        // Prefer whichever copy actually has a name / company
        if (!existing.first_name && c.first_name) existing.first_name = c.first_name;
        if (!existing.last_name && c.last_name) existing.last_name = c.last_name;
        if (!existing.company && c.company) existing.company = c.company;
        continue;
      }
      byEmail.set(key, {
        id: c.id,
        email: key,
        first_name: c.first_name ?? null,
        last_name: c.last_name ?? null,
        company: c.company || undefined,
        unsubscribed: !!c.unsubscribed,
        segment_ids: [seg.id],
      });
    }
  }

  const all = Array.from(byEmail.values());
  const syncedAt = new Date().toISOString();

  // Upsert in chunks so one huge payload never trips a request limit
  for (let i = 0; i < all.length; i += UPSERT_CHUNK) {
    const chunk = all.slice(i, i + UPSERT_CHUNK).map((c) => ({
      email: c.email,
      resend_id: c.id || null,
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      company: c.company || null,
      unsubscribed: !!c.unsubscribed,
      segment_ids: c.segment_ids,
      synced_at: syncedAt,
    }));
    const { error } = await supabase.from("email_contacts").upsert(chunk, { onConflict: "email" });
    if (error) throw new Error(`contact mirror upsert failed: ${error.message}`);
  }

  // Anything not touched by this run no longer exists in Resend — drop it.
  // Guarded: never wipe the table if the walk came back suspiciously empty.
  let removed = 0;
  if (all.length > 0) {
    const { data: stale } = await supabase
      .from("email_contacts")
      .delete()
      .lt("synced_at", syncedAt)
      .select("email");
    removed = (stale || []).length;
  }

  return { contacts: all.length, segments: segments.length, removed };
}

/**
 * Search the mirror. One indexed query, ordered by how well each row matches.
 * Returns [] when the mirror is empty so the caller can fall back to Resend.
 */
export async function searchMirror(query: string, limit = 12): Promise<MirroredContact[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const { data, error } = await supabase
    .from("email_contacts")
    .select("email, resend_id, first_name, last_name, company, unsubscribed, segment_ids")
    .or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`)
    .limit(limit * 6); // over-fetch, then rank in memory

  if (error) {
    console.error("[contact mirror] search failed:", error.message);
    return [];
  }

  return (data || []).map((r) => ({
    id: r.resend_id || r.email,
    email: r.email,
    first_name: r.first_name,
    last_name: r.last_name,
    // "" means "checked, Resend has no company"; undefined means "not looked up yet"
    company: r.company ?? undefined,
    unsubscribed: !!r.unsubscribed,
    segment_ids: r.segment_ids || [],
  }));
}

/**
 * Fill in company for rows that don't have it yet.
 *
 * Resend's list endpoints omit custom properties (company only comes back from
 * the single-contact GET), and there are ~2,300 distinct domains, so hydrating
 * everything nightly isn't worth ~5,000 API calls. Instead we hydrate only the
 * handful of rows a search is about to display and write them back, so each
 * contact costs one lookup the first time anyone searches it and is free after.
 */
export async function hydrateCompanies(
  rows: MirroredContact[],
  timeoutMs = HYDRATE_TIMEOUT_MS
): Promise<MirroredContact[]> {
  const need = rows.filter((r) => r.company === undefined && r.email);
  if (need.length === 0) return rows;

  const lookups = fetchCompanies(need.map((r) => r.email));

  // Never let a slow Resend call hold up the dropdown. Whatever arrives in time
  // is shown; the rest is still written back for the next search.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const winner = await Promise.race([lookups, timeout]);

  // Persist whatever finishes, even after the timeout
  void lookups.then(persistCompanies);

  if (!winner || winner.size === 0) return rows;
  return rows.map((r) => (winner.has(r.email) ? { ...r, company: winner.get(r.email) || undefined } : r));
}

/** Look up company for a list of emails, in parallel. Failures are skipped. */
async function fetchCompanies(emails: string[]): Promise<Map<string, string>> {
  const got = await Promise.all(
    emails.map(async (email) => {
      try {
        const live = await lookupContactByEmail(email);
        // "" records "checked, none" so this contact is never looked up again
        return [email, live?.company || ""] as const;
      } catch {
        return null; // a failed request — leave it unchecked and retry another time
      }
    })
  );
  return new Map(got.filter(Boolean) as (readonly [string, string])[]);
}

/** Write learned company values back so nobody pays for them again. */
async function persistCompanies(byEmail: Map<string, string>): Promise<void> {
  if (byEmail.size === 0) return;
  const { error } = await supabase
    .from("email_contacts")
    .upsert(
      Array.from(byEmail.entries()).map(([email, company]) => ({ email, company })),
      { onConflict: "email" }
    );
  if (error) console.error("[contact mirror] company write-back failed:", error.message);
}

/**
 * Fill in company for contacts that still don't have one, a batch at a time.
 * Runs nightly after the sync so the mirror gets progressively complete without
 * ever making one job do ~5,000 lookups.
 */
export async function backfillCompanies(limit = COMPANY_BACKFILL_PER_NIGHT): Promise<{ attempted: number; filled: number }> {
  const { data } = await supabase
    .from("email_contacts")
    .select("email")
    .is("company", null)
    .limit(limit);

  const emails = (data || []).map((r) => r.email as string);
  if (emails.length === 0) return { attempted: 0, filled: 0 };

  // Small parallel batches so Resend isn't hit with hundreds of calls at once
  const found = new Map<string, string>();
  for (let i = 0; i < emails.length; i += COMPANY_BATCH) {
    const batch = await fetchCompanies(emails.slice(i, i + COMPANY_BATCH));
    batch.forEach((v, k) => found.set(k, v));
  }
  await persistCompanies(found);
  return { attempted: emails.length, filled: found.size };
}

/** How many contacts the mirror holds, and when it was last rebuilt. */
export async function mirrorStatus(): Promise<{ count: number; syncedAt: string | null }> {
  const { count } = await supabase.from("email_contacts").select("email", { count: "exact", head: true });
  const { data } = await supabase
    .from("email_contacts")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1);
  return { count: count || 0, syncedAt: data?.[0]?.synced_at || null };
}
