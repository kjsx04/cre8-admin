/**
 * Email Provider — Resend
 *
 * The ONE place the app talks to the email service. Every route that needs to
 * create, update, cancel, or check a scheduled send goes through here.
 *
 * How it works:
 *   - The campaign row in Supabase is the source of truth for every email.
 *   - We render the HTML ourselves (renderEmailHtml) and push it to Resend as a
 *     "Broadcast" scheduled for the campaign's send time. Resend holds it and
 *     delivers on time — our app is not involved at send time.
 *   - When a campaign is edited, syncCampaignToProvider() cancels the pending
 *     broadcast and creates a fresh one from the current row. (Resend only lets
 *     you edit DRAFT broadcasts, so a scheduled one can't be changed in place.)
 *
 * Env vars (set in .env.local + Vercel):
 *   RESEND_API_KEY         — API key
 *   RESEND_SEGMENT_ID_ALL  — optional leftover mapping for old "all" campaigns
 *   RESEND_SEGMENT_ID_TEST — optional leftover mapping for old "test" campaigns
 *
 * Audience is live Resend segments (GET /segments). A campaign may target
 * several of them (one broadcast each — Resend accepts one segment_id per
 * broadcast) plus optional extra contact emails (transactional /emails).
 */

import { buildTemplateVars, renderEmailHtml } from "./constants";
import { EMAIL_RE, parseAudienceTokens, splitProviderIds } from "./audience-tokens";
import {
  contactMatchesQuery,
  isUnsubscribed,
  parseContactListBody,
  unwrapContact,
  type MatchedContact,
} from "./contact-match";

const RESEND_API = "https://api.resend.com";

// Campaign-shaped record — loose on purpose so raw Supabase rows work directly
export type CampaignLike = Record<string, unknown>;

export type ResendSegment = {
  id: string;
  name: string;
  created_at?: string;
};

/** True when the provider is configured (API key present) */
export function isProviderConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Map leftover internal ids ("all", "test") to env-configured Resend ids. */
function legacyEnvSegmentIds(legacy: string[]): string[] {
  const out: string[] = [];
  if (legacy.includes("all") && process.env.RESEND_SEGMENT_ID_ALL) {
    out.push(process.env.RESEND_SEGMENT_ID_ALL);
  }
  if (legacy.includes("test") && process.env.RESEND_SEGMENT_ID_TEST) {
    out.push(process.env.RESEND_SEGMENT_ID_TEST);
  }
  return out;
}

/**
 * Resolve every Resend segment id a campaign should send to.
 * Live UUIDs win; leftover "all"/"test" values use env vars when set.
 */
export async function resolveSegmentIds(segmentId: unknown): Promise<string[]> {
  const parsed = parseAudienceTokens(segmentId);
  const ids = [...parsed.segmentIds];

  // Old "test" list was renamed to Brokers — if env isn't set, match by name.
  if (parsed.legacy.includes("test") && !process.env.RESEND_SEGMENT_ID_TEST) {
    try {
      const live = await listSegments();
      const brokers = live.find((s) => /^(brokers|test)$/i.test(s.name));
      if (brokers) ids.push(brokers.id);
    } catch (err) {
      console.warn("[Resend] Could not resolve legacy 'test' segment:", err);
    }
  }

  for (const id of legacyEnvSegmentIds(parsed.legacy)) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** First resolved segment id (broadcasts that still need a single id). */
export function resolveSegmentId(segmentId: unknown): string | null {
  const parsed = parseAudienceTokens(segmentId);
  if (parsed.segmentIds[0]) return parsed.segmentIds[0];
  return legacyEnvSegmentIds(parsed.legacy)[0] || null;
}

/** Live Resend segments (name + id). Empty when the API key isn't set. */
export async function listSegments(): Promise<ResendSegment[]> {
  const out: ResendSegment[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const qs = `limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const res = await resendFetch(`/segments?${qs}`);
    if (!res.ok) throw new Error(`Resend list segments failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { data?: ResendSegment[]; has_more?: boolean };
    const rows = body.data || [];
    out.push(...rows);
    if (!body.has_more || rows.length === 0) break;
    after = rows[rows.length - 1].id;
  }
  return out;
}

/** Subject line: "Just Listed: 6933 N 7th St" */
export function buildSubject(campaign: CampaignLike): string {
  // Group emails: the heading IS the subject ("Land Opportunities in the West Valley")
  if (campaign.campaign_kind === "group") return String(campaign.email_label || campaign.listing_name || "Featured Listings");
  return `${campaign.email_label || "Just Listed"}: ${campaign.listing_name || "Property"}`;
}

/** From header: "Andy Kroot <andy@cre8advisors.com>" — any address on the verified domain works */
export function buildFrom(campaign: CampaignLike): string {
  const name = (campaign.broker_name as string) || "CRE8 Advisors";
  const email = ((campaign.broker_email as string) || "info@cre8advisors.com").toLowerCase();
  return `${name} <${email}>`;
}

/** Render the campaign's full HTML from the campaign row */
export function renderCampaignHtml(campaign: CampaignLike): string {
  return renderEmailHtml(buildTemplateVars(campaign));
}

// ── Low-level Resend calls ──

async function resendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  let last: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    // Next.js 14 caches GET fetch by default — never cache Resend reads
    // (a failed/empty first page would otherwise stick as 0 counts).
    const res = await fetch(`${RESEND_API}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    last = res;
    if (res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, Math.min(8000, 400 * 2 ** attempt)));
  }
  return last!;
}

/** Build the broadcast payload for one Resend segment */
function buildBroadcastBody(campaign: CampaignLike, segmentId: string, nameSuffix = "") {
  return {
    segment_id: segmentId,
    from: buildFrom(campaign),
    reply_to: ((campaign.broker_email as string) || "").toLowerCase() || undefined,
    subject: buildSubject(campaign),
    html: renderCampaignHtml(campaign),
    name: `${buildSubject(campaign)}${nameSuffix}`,
  };
}

/**
 * Create one Resend broadcast per selected segment, plus a transactional email
 * per extra recipient. Returns the ids joined with commas (fits provider_send_id).
 */
async function deliverCampaign(
  campaign: CampaignLike,
  opts: { send: boolean; scheduledAt?: string; nameSuffix: string }
): Promise<string> {
  const segmentIds = await resolveSegmentIds(campaign.segment_id);
  const extraEmails = parseAudienceTokens(campaign.segment_id).extraEmails;
  if (segmentIds.length === 0 && extraEmails.length === 0) {
    throw new Error("No audience selected — pick a Resend list or add a contact");
  }

  const created: string[] = [];
  try {
    for (const segmentId of segmentIds) {
      const body: Record<string, unknown> = {
        ...buildBroadcastBody(campaign, segmentId, opts.nameSuffix),
        send: opts.send,
      };
      if (opts.scheduledAt) body.scheduled_at = opts.scheduledAt;
      const res = await resendFetch("/broadcasts", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        throw new Error(`Resend broadcast failed (${res.status}): ${await res.text()}`);
      }
      const data = (await res.json()) as { id?: string };
      if (data.id) created.push(data.id);
    }

    for (const email of extraEmails) {
      const id = await sendToRecipient(email, campaign, opts.scheduledAt);
      if (id) created.push(id);
    }
  } catch (err) {
    // Don't leave half a multi-list send sitting in Resend
    await Promise.all(created.map((id) => cancelSend(id)));
    throw err;
  }

  if (created.length === 0) {
    throw new Error("Resend created no sends — check the selected audience");
  }
  return created.join(",");
}

/**
 * Create a broadcast and schedule it for sendAtIso.
 * Returns the Resend broadcast id(s), or throws with the API error.
 */
export async function createScheduledSend(
  campaign: CampaignLike,
  sendAtIso: string
): Promise<string> {
  const dateLabel = new Date(sendAtIso).toLocaleDateString("en-US", { timeZone: "America/Phoenix" });
  return deliverCampaign(campaign, { send: true, scheduledAt: sendAtIso, nameSuffix: ` (${dateLabel})` });
}

/**
 * Send a broadcast immediately (no schedule). Used by "Send now".
 * Returns the Resend broadcast id(s).
 */
export async function sendNow(campaign: CampaignLike): Promise<string> {
  return deliverCampaign(campaign, { send: true, nameSuffix: " (sent now)" });
}

/** Cancel pending broadcasts / scheduled emails. Safe if they're already gone. */
export async function cancelSend(broadcastId: string | null | undefined): Promise<void> {
  if (!broadcastId || !isProviderConfigured()) return;
  for (const id of splitProviderIds(broadcastId)) {
    try {
      const res = await resendFetch(`/broadcasts/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        if (res.status === 404) {
          // Might be a scheduled transactional email (extra recipient)
          const emailRes = await resendFetch(`/emails/${id}/cancel`, { method: "POST" });
          if (!emailRes.ok && emailRes.status !== 404 && emailRes.status !== 422) {
            console.warn(`[Resend] Email cancel failed (${emailRes.status}): ${await emailRes.text()}`);
          }
        }
        continue;
      }
      console.warn(`[Resend] Cancel failed (${res.status}): ${await res.text()}`);
    } catch (err) {
      console.error("[Resend] Cancel error:", err);
    }
  }
}

export type SendStatus = {
  state: "pending" | "sent" | "missing" | "unknown";
  scheduledAt: string | null;
  sentAt: string | null;
};

async function getOneSendStatus(id: string): Promise<SendStatus> {
  try {
    const res = await resendFetch(`/broadcasts/${id}`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      const status = String(data.status || "").toLowerCase();
      const sentAt = (data.sent_at as string) || null;
      const scheduledAt = (data.scheduled_at as string) || null;
      if (status === "sent" || sentAt) return { state: "sent", scheduledAt, sentAt };
      if (status === "canceled" || status === "cancelled") return { state: "missing", scheduledAt, sentAt };
      return { state: "pending", scheduledAt, sentAt };
    }
    if (res.status !== 404) return { state: "unknown", scheduledAt: null, sentAt: null };

    // Extra recipients are transactional emails, not broadcasts
    const emailRes = await resendFetch(`/emails/${id}`, { method: "GET" });
    if (emailRes.status === 404) return { state: "missing", scheduledAt: null, sentAt: null };
    if (!emailRes.ok) return { state: "unknown", scheduledAt: null, sentAt: null };
    const data = await emailRes.json();
    const lastEvent = String(data.last_event || "").toLowerCase();
    const scheduledAt = (data.scheduled_at as string) || null;
    if (lastEvent === "canceled" || lastEvent === "cancelled") {
      return { state: "missing", scheduledAt, sentAt: null };
    }
    if (lastEvent && lastEvent !== "scheduled") {
      return { state: "sent", scheduledAt, sentAt: (data.created_at as string) || null };
    }
    if (scheduledAt && new Date(scheduledAt).getTime() > Date.now()) {
      return { state: "pending", scheduledAt, sentAt: null };
    }
    return { state: lastEvent ? "sent" : "pending", scheduledAt, sentAt: null };
  } catch (err) {
    console.error("[Resend] Status error:", err);
    return { state: "unknown", scheduledAt: null, sentAt: null };
  }
}

/** Check whether pending send(s) are still waiting, already sent, or gone */
export async function getSendStatus(broadcastId: string): Promise<SendStatus> {
  const ids = splitProviderIds(broadcastId);
  if (ids.length === 0) return { state: "missing", scheduledAt: null, sentAt: null };
  const statuses = await Promise.all(ids.map(getOneSendStatus));
  const scheduledAt = statuses.find((s) => s.scheduledAt)?.scheduledAt || null;
  const sentAt = statuses.find((s) => s.sentAt)?.sentAt || null;
  if (statuses.some((s) => s.state === "unknown")) return { state: "unknown", scheduledAt, sentAt };
  if (statuses.some((s) => s.state === "pending")) return { state: "pending", scheduledAt, sentAt };
  if (statuses.some((s) => s.state === "sent")) return { state: "sent", scheduledAt, sentAt };
  return { state: "missing", scheduledAt, sentAt };
}

/**
 * Send a one-off test email to a single recipient (transactional, no segment).
 * Subject is prefixed with [TEST]. The unsubscribe link is replaced with "#".
 */
export async function sendTest(recipientEmail: string, campaign: CampaignLike): Promise<void> {
  await sendToRecipient(recipientEmail, campaign, undefined, { test: true });
}

/**
 * Transactional send to one extra recipient (not a Resend segment).
 * Merge tags like {{{RESEND_UNSUBSCRIBE_URL}}} only work on broadcasts, so we
 * strip them here. Returns the Resend email id.
 */
async function sendToRecipient(
  recipientEmail: string,
  campaign: CampaignLike,
  scheduledAt?: string,
  opts: { test?: boolean } = {}
): Promise<string> {
  const html = renderCampaignHtml(campaign).replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, "#");
  const body: Record<string, unknown> = {
    from: buildFrom(campaign),
    to: [recipientEmail],
    reply_to: ((campaign.broker_email as string) || "").toLowerCase() || undefined,
    subject: opts.test ? `[TEST] ${buildSubject(campaign)}` : buildSubject(campaign),
    html,
  };
  if (scheduledAt) body.scheduled_at = scheduledAt;

  const res = await resendFetch("/emails", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`Resend ${opts.test ? "test " : ""}send failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id || "";
}

export type ResendContact = MatchedContact;

/** Contact counts for one Resend segment */
export type SegmentCount = {
  total: number;         // every contact in the segment
  subscribed: number;    // will receive broadcasts (what the composer chips show)
  unsubscribed: number;  // opted out — Resend skips them automatically
};

const CONTACT_PAGE = 100;
const CONTACT_MAX_PAGES = 200;
const CONTACT_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_LIMIT = 12;

type ContactListCache = { at: number; rows: ResendContact[] };

let allContactsCache: ContactListCache | null = null;
const segmentContactsCache = new Map<string, ContactListCache>();

/** Drop in-memory contact lists (used by ?refresh=1). */
export function invalidateContactCaches(): void {
  allContactsCache = null;
  segmentContactsCache.clear();
}

function countFromRows(rows: ResendContact[]): SegmentCount {
  const out: SegmentCount = { total: 0, subscribed: 0, unsubscribed: 0 };
  for (const c of rows) {
    out.total += 1;
    if (isUnsubscribed(c.unsubscribed)) out.unsubscribed += 1;
    else out.subscribed += 1;
  }
  return out;
}

/**
 * One page of contacts.
 * Segment filter: GET /contacts?segment_id= (the path Resend MCP uses) first,
 * then GET /segments/{id}/contacts (Node SDK path) if that 404s or comes back empty.
 */
async function fetchContactsPage(opts: {
  segmentId?: string;
  after?: string | null;
  limit?: number;
}): Promise<{ rows: ResendContact[]; hasMore: boolean }> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.after) qs.set("after", opts.after);

  const paths: string[] = [];
  if (opts.segmentId) {
    const withSeg = new URLSearchParams(qs);
    withSeg.set("segment_id", opts.segmentId);
    paths.push(`/contacts?${withSeg}`);
    paths.push(`/segments/${opts.segmentId}/contacts${qs.toString() ? `?${qs}` : ""}`);
  } else {
    paths.push(`/contacts${qs.toString() ? `?${qs}` : ""}`);
  }

  let lastErr: Error | null = null;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const res = await resendFetch(path);
    if (!res.ok) {
      lastErr = new Error(`Resend list contacts failed (${res.status}): ${await res.text()}`);
      if (res.status === 404 || res.status === 400) continue;
      throw lastErr;
    }
    const parsed = parseContactListBody(await res.json());
    // First page empty + another path left → try the fallback (don't trust a 404-as-200)
    if (parsed.rows.length === 0 && !opts.after && i < paths.length - 1) continue;
    return parsed;
  }
  throw lastErr || new Error("Resend list contacts failed");
}

/** Page every contact, optionally filtered to one segment. */
export async function listAllContacts(segmentId?: string): Promise<ResendContact[]> {
  const out: ResendContact[] = [];
  let after: string | null = null;
  for (let page = 0; page < CONTACT_MAX_PAGES; page++) {
    const { rows, hasMore } = await fetchContactsPage({
      segmentId,
      after,
      limit: CONTACT_PAGE,
    });
    out.push(...rows);
    if (!hasMore || rows.length === 0) break;
    after = rows[rows.length - 1]?.id || null;
    if (!after) break;
  }
  return out;
}

async function cachedContactList(segmentId?: string, force = false): Promise<ResendContact[]> {
  const now = Date.now();
  if (!segmentId) {
    if (!force && allContactsCache && now - allContactsCache.at < CONTACT_CACHE_TTL_MS) {
      return allContactsCache.rows;
    }
    const rows = await listAllContacts();
    allContactsCache = { at: now, rows };
    return rows;
  }
  const hit = segmentContactsCache.get(segmentId);
  if (!force && hit && now - hit.at < CONTACT_CACHE_TTL_MS) return hit.rows;
  const rows = await listAllContacts(segmentId);
  segmentContactsCache.set(segmentId, { at: now, rows });
  return rows;
}

async function hydrateCompanies(rows: ResendContact[]): Promise<ResendContact[]> {
  const need = rows.filter((r) => !r.company && r.email);
  if (need.length === 0) return rows;
  const got = await Promise.all(
    need.map(async (c) => {
      try {
        const res = await resendFetch(`/contacts/${encodeURIComponent(c.email)}`);
        if (!res.ok) return c;
        return unwrapContact(await res.json()) || c;
      } catch {
        return c;
      }
    })
  );
  const byEmail = new Map(got.map((g) => [g.email.toLowerCase(), g]));
  return rows.map((r) => byEmail.get(r.email.toLowerCase()) || r);
}

/**
 * Search Resend contacts by email, name, or company/brokerage (case-insensitive
 * partial match). Pages the live contact list (cached 10 min) so matches are
 * not limited to the first few hundred rows.
 */
export async function searchContacts(query: string): Promise<ResendContact[]> {
  const q = query.trim();
  if (!q) return [];

  const exact: ResendContact[] = [];
  if (EMAIL_RE.test(q.toLowerCase())) {
    const res = await resendFetch(`/contacts/${encodeURIComponent(q.toLowerCase())}`);
    if (res.ok) {
      const row = unwrapContact(await res.json());
      if (row) exact.push(row);
    } else if (res.status !== 404) {
      throw new Error(`Resend contact lookup failed (${res.status}): ${await res.text()}`);
    }
  }

  let rows: ResendContact[] = [];
  try {
    rows = await cachedContactList();
  } catch (err) {
    // Global list failed — still return an exact email hit if we have one
    console.error("[Resend] contact list for search failed:", err);
    if (exact.length) return exact;
    throw err;
  }

  const seen = new Set(exact.map((c) => c.email.toLowerCase()));
  const matches = [...exact];
  for (const c of rows) {
    if (!contactMatchesQuery(c, q)) continue;
    const key = c.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(c);
    if (matches.length >= SEARCH_LIMIT) break;
  }

  return hydrateCompanies(matches);
}

// ── High-level sync ──

/**
 * Count every contact in a Resend segment (full pagination).
 * Prefers GET /contacts?segment_id=; falls back to /segments/{id}/contacts.
 * Resend does not expose a segment.total field — this is the official count.
 * Chips show `subscribed` (broadcast recipients). `total` includes unsubscribed.
 */
export async function countSegmentContacts(segmentId: string, force = false): Promise<SegmentCount> {
  const rows = await cachedContactList(segmentId, force);
  return countFromRows(rows);
}

export type SyncResult = {
  ok: boolean;
  provider_send_id: string | null;
  action: string;
  error?: string;
};

/**
 * Make the provider match the campaign row. Call this after ANY change to a
 * campaign that has (or should have) a pending send.
 *
 * Decision table:
 *   - provider not configured            → no-op, keep whatever id we have
 *   - campaign not scheduled/active,
 *     or has no scheduled_date           → cancel pending send, id = null
 *   - no pending send yet                → create
 *   - pending send (any edit)            → cancel + create from the current row
 *                                          (Resend can't edit scheduled broadcasts)
 *   - send already went out              → leave it alone (one-time is done;
 *                                          recurring gets its next send from the cron)
 */
export async function syncCampaignToProvider(campaign: CampaignLike): Promise<SyncResult> {
  const existingId = (campaign.provider_send_id as string) || null;

  if (!isProviderConfigured()) {
    return { ok: true, provider_send_id: existingId, action: "skipped (provider not configured)" };
  }

  const status = campaign.status as string;
  const scheduledDate = campaign.scheduled_date as string | null;
  const shouldHaveSend = (status === "scheduled" || status === "active") && !!scheduledDate;

  try {
    // Campaign should NOT have a pending send (draft, paused, completed, cancelled)
    if (!shouldHaveSend) {
      if (existingId) {
        const st = await getSendStatus(existingId);
        if (st.state === "pending") await cancelSend(existingId);
      }
      return { ok: true, provider_send_id: null, action: existingId ? "cancelled" : "nothing to sync" };
    }

    // Don't try to schedule something in the past — Resend will reject it
    if (new Date(scheduledDate!).getTime() < Date.now() + 60_000) {
      return {
        ok: false,
        provider_send_id: existingId,
        action: "not synced",
        error: "Scheduled time is in the past — reschedule the campaign",
      };
    }

    // No pending send yet → create one
    if (!existingId) {
      const id = await createScheduledSend(campaign, scheduledDate!);
      return { ok: true, provider_send_id: id, action: "created" };
    }

    // There is a send on file — figure out what state it's in
    const st = await getSendStatus(existingId);

    if (st.state === "sent") {
      return { ok: true, provider_send_id: existingId, action: "already sent" };
    }

    if (st.state === "missing" || st.state === "unknown") {
      // Gone (or Resend unreachable for status) — recreate to be safe
      await cancelSend(existingId);
      const id = await createScheduledSend(campaign, scheduledDate!);
      return { ok: true, provider_send_id: id, action: "recreated" };
    }

    // Pending: Resend won't let us edit a scheduled broadcast, so replace it.
    // Cancel first, then create from the current campaign row (content + time).
    const timeChanged =
      !st.scheduledAt ||
      Math.abs(new Date(st.scheduledAt).getTime() - new Date(scheduledDate!).getTime()) > 60_000;

    await cancelSend(existingId);
    const id = await createScheduledSend(campaign, scheduledDate!);
    return { ok: true, provider_send_id: id, action: timeChanged ? "rescheduled" : "updated" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provider sync failed";
    console.error("[Resend] Sync error:", message);
    return { ok: false, provider_send_id: existingId, action: "failed", error: message };
  }
}
