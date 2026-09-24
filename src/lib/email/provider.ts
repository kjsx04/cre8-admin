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
 *   - Listing fields freeze on the campaign row at Schedule. Send / re-push
 *     uses that snapshot. Draft preview still overlays live CMS. Template
 *     chrome stays pinned on template_version until Sync template.
 *   - Sent broadcasts are never rewritten. When a pending send is refreshed,
 *     syncCampaignToProvider() cancels it and creates a fresh broadcast from
 *     the current row. (Resend only lets you edit DRAFT broadcasts.)
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
import { hydrateCampaignListing, listingStaysLive } from "./listing-hydrate";
import { EMAIL_RE, parseAudienceTokens, splitProviderIds } from "./audience-tokens";
import {
  contactMatchesQuery,
  contactSearchScore,
  isUnsubscribed,
  parseContactListBody,
  unwrapContact,
  type MatchedContact,
} from "./contact-match";
import { nextContactPageCursor, retryAfterMs } from "./audience-count";
import { unionSegmentName, unionMembers, membershipDiff, membersCsv } from "./union-segment";
import { buildSubjectLine } from "./subject";

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

/**
 * Subject line. A subject typed in the composer wins; otherwise it is built as
 * "Just Listed: 6933 N 7th St" (or, for a group email, the heading alone).
 */
export function buildSubject(campaign: CampaignLike): string {
  return buildSubjectLine(campaign as Parameters<typeof buildSubjectLine>[0]);
}

/** From header: "Andy Kroot <andy@cre8advisors.com>" — any address on the verified domain works */
export function buildFrom(campaign: CampaignLike): string {
  const name = (campaign.broker_name as string) || "CRE8 Advisors";
  const email = ((campaign.broker_email as string) || "info@cre8advisors.com").toLowerCase();
  return `${name} <${email}>`;
}

/** Render the campaign's full HTML from the campaign row. */
export function renderCampaignHtml(campaign: CampaignLike): string {
  return renderEmailHtml(buildTemplateVars(campaign));
}

// ── Low-level Resend calls ──

const RESEND_MAX_ATTEMPTS = 8;
const RESEND_CONCURRENCY = 2;

let resendInflight = 0;
const resendWaiters: Array<() => void> = [];

async function withResendSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (resendInflight >= RESEND_CONCURRENCY) {
    await new Promise<void>((resolve) => resendWaiters.push(resolve));
  }
  resendInflight += 1;
  try {
    return await fn();
  } finally {
    resendInflight -= 1;
    resendWaiters.shift()?.();
  }
}

async function resendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  return withResendSlot(async () => {
    let last: Response | null = null;
    for (let attempt = 0; attempt < RESEND_MAX_ATTEMPTS; attempt++) {
      // Next.js 14 caches GET fetch by default — never cache Resend reads
      // (a failed/empty first page would otherwise stick as 0 counts).
      // FormData sets its own multipart Content-Type (with the boundary) —
      // forcing application/json on it breaks the upload.
      const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
      const res = await fetch(`${RESEND_API}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(isForm ? {} : { "Content-Type": "application/json" }),
          ...(init.headers || {}),
        },
      });
      last = res;
      if (res.status !== 429) return res;
      await new Promise((r) => setTimeout(r, retryAfterMs(attempt, res.headers.get("retry-after"))));
    }
    return last!;
  });
}

/** Build the broadcast payload for one Resend segment */
/** Resend caps a broadcast's `name` field. Anything longer is a 422 for the whole request. */
const BROADCAST_NAME_MAX = 70;

/** Resend refuses to cancel an email for a moment after it is created */
const CANCEL_MAX_ATTEMPTS = 4;
const CANCEL_RETRY_MS = 1500;

/**
 * The label a broadcast shows in Resend's dashboard.
 *
 * `name` is internal only — recipients never see it — but Resend rejects the
 * entire create call when it runs long ("Field `name` has a maximum of 70 items"),
 * which silently blocked every campaign with a long subject from going to a
 * segment. So the name gets trimmed here while `subject` is left untouched.
 *
 * The suffix (" (sent now)", " (9/23/2026)") is what tells two broadcasts of the
 * same campaign apart, so it is always kept whole and the subject is cut instead.
 * The marker is ASCII "..." on purpose: Resend says "items", and if it is counting
 * bytes rather than characters a multi-byte ellipsis could still trip the limit.
 */
export function buildBroadcastName(subject: string, suffix = ""): string {
  const full = `${subject}${suffix}`;
  if (full.length <= BROADCAST_NAME_MAX) return full;

  const room = BROADCAST_NAME_MAX - suffix.length - 3; // 3 for "..."
  if (room <= 0) return full.slice(0, BROADCAST_NAME_MAX); // absurd suffix — just cut
  return `${subject.slice(0, room).trimEnd()}...${suffix}`;
}

function buildBroadcastBody(campaign: CampaignLike, segmentId: string, nameSuffix = "") {
  return {
    segment_id: segmentId,
    from: buildFrom(campaign),
    reply_to: ((campaign.broker_email as string) || "").toLowerCase() || undefined,
    subject: buildSubject(campaign),
    html: renderCampaignHtml(campaign),
    // Subject goes out in full; only this internal label is trimmed to Resend's limit
    name: buildBroadcastName(buildSubject(campaign), nameSuffix),
  };
}

/**
 * Create one Resend broadcast per selected segment, plus a transactional email
 * per extra recipient. Returns the ids joined with commas (fits provider_send_id).
 */
/**
 * Block until a bulk contact import has finished.
 *
 * Resend queues imports and returns immediately. In practice a few thousand
 * contacts land in well under a second, but a broadcast created against a
 * still-filling list would go to whoever happened to be in it at that moment.
 */
async function waitForImport(importId: string, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  let wait = 250;
  while (Date.now() - started < timeoutMs) {
    const res = await resendFetch(`/contacts/imports/${importId}`);
    if (res.ok) {
      const job = (await res.json()) as { status?: string; counts?: { failed?: number } };
      if (job.status === "completed") return;
      if (job.status === "failed" || job.status === "canceled") {
        throw new Error(`Filling the combined list ${job.status}`);
      }
    }
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(2000, Math.round(wait * 1.5));
  }
  throw new Error("Filling the combined list timed out — try again in a moment");
}

/**
 * Find (or create) the managed segment for a combination of lists, and make its
 * membership match the de-duplicated union.
 *
 * Why this exists: a broadcast targets one segment, so picking two lists used to
 * send two emails — and 883 contacts are on both Buyers and Sellers. Segments are
 * static with no filter support, so the union has to be materialised.
 *
 * Adds go through the bulk CSV import (one request, thousands of contacts).
 * Removals are per-contact but rare — only when someone drops off every source list.
 */
export async function ensureUnionSegment(segmentIds: string[]): Promise<string> {
  const ids = Array.from(new Set(segmentIds));
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error("No lists selected");

  const all = await listSegments();
  const byId = new Map(all.map((s) => [s.id, s]));
  const sourceNames = ids.map((id) => byId.get(id)?.name || id);
  const name = unionSegmentName(sourceNames);

  // Find or create
  let target = all.find((s) => s.name === name);
  if (!target) {
    const res = await resendFetch("/segments", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) throw new Error(`Could not create the combined list (${res.status}): ${await res.text()}`);
    const created = (await res.json()) as { id?: string };
    if (!created.id) throw new Error("Resend created no combined list");
    target = { id: created.id, name };
  }

  // Make membership match the mirror
  const want = await unionMembers(ids);
  if (want.length === 0) throw new Error("The selected lists have no contacts in the mirror — run a contact sync first");

  const have = (await listAllContacts(target.id)).map((c) => c.email);
  const { add, remove } = membershipDiff(have, want);

  if (add.length > 0) {
    const form = new FormData();
    form.append("file", new Blob([membersCsv(add)], { type: "text/csv" }), "union.csv");
    form.append("column_map", JSON.stringify({ email: "email" }));
    form.append("on_conflict", "upsert");
    form.append("segments", JSON.stringify([{ id: target.id }]));
    const res = await resendFetch("/contacts/imports", { method: "POST", body: form });
    if (!res.ok) throw new Error(`Could not fill the combined list (${res.status}): ${await res.text()}`);
    const job = (await res.json()) as { id?: string };
    // The import runs in the background. Returning before it finishes would
    // create the broadcast against a half-filled list.
    if (job.id) await waitForImport(job.id);
  }

  // Anyone who left every source list
  for (const email of remove) {
    try {
      await resendFetch(`/contacts/${encodeURIComponent(email)}/segments/${target.id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[union] could not remove", email, err);
    }
  }

  return target.id;
}

/**
 * Drop hand-typed recipients who are already inside the selected lists.
 * Falls back to the full list if the mirror is empty or unreachable.
 */
async function withoutSegmentMembers(emails: string[], segmentIds: string[]): Promise<string[]> {
  if (emails.length === 0 || segmentIds.length === 0) return emails;
  try {
    const members = new Set(await unionMembers(segmentIds));
    if (members.size === 0) return emails;
    return emails.filter((e) => !members.has(e.trim().toLowerCase()));
  } catch (err) {
    console.error("[audience] could not check for duplicate recipients:", err);
    return emails;
  }
}

async function deliverCampaign(
  campaign: CampaignLike,
  opts: { send: boolean; scheduledAt?: string; nameSuffix: string }
): Promise<string> {
  const segmentIds = await resolveSegmentIds(campaign.segment_id);
  const extraEmails = parseAudienceTokens(campaign.segment_id).extraEmails;
  if (segmentIds.length === 0 && extraEmails.length === 0) {
    throw new Error("No audience selected — pick a Resend list or add a contact");
  }

  // Several lists → one de-duplicated list, so nobody on two lists gets two copies
  const targets = segmentIds.length > 1 ? [await ensureUnionSegment(segmentIds)] : segmentIds;

  // A typed-in contact who is already on a selected list is already getting the
  // broadcast. Sending them a transactional copy as well would be a second email
  // and a billed send. If the mirror can't answer, send to everyone typed in —
  // a duplicate is better than silently dropping someone who was added by hand.
  const extras = await withoutSegmentMembers(extraEmails, segmentIds);

  // Scheduled rows already hold the listing snapshot. Never pull live CMS here.
  const created: string[] = [];
  try {
    for (const segmentId of targets) {
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

    for (const email of extras) {
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
      if (res.ok) continue;
      if (res.status === 404) {
        // Might be a scheduled transactional email (extra recipient)
        await cancelScheduledEmail(id);
        continue;
      }
      console.warn(`[Resend] Cancel failed (${res.status}): ${await res.text()}`);
    } catch (err) {
      console.error("[Resend] Cancel error:", err);
    }
  }
}

/**
 * Cancel one scheduled transactional email, and make sure it actually took.
 *
 * Resend answers 422 for a few seconds after an email is created, while it is
 * still "queued" rather than "scheduled". The old code treated 422 as success,
 * so a cancel could silently do nothing and the app would carry on believing
 * the send was gone. Retry, then verify against last_event.
 */
async function cancelScheduledEmail(id: string): Promise<boolean> {
  for (let attempt = 0; attempt < CANCEL_MAX_ATTEMPTS; attempt++) {
    const res = await resendFetch(`/emails/${id}/cancel`, { method: "POST" });
    if (res.ok) return true;
    if (res.status === 404) return true; // already gone
    if (res.status !== 422) {
      console.warn(`[Resend] Email cancel failed (${res.status}): ${await res.text()}`);
      return false;
    }
    // 422 = too early to cancel. Wait for it to settle, then try again.
    await new Promise((r) => setTimeout(r, CANCEL_RETRY_MS * (attempt + 1)));
  }

  // Last word goes to the provider, not to us
  const check = await resendFetch(`/emails/${id}`, { method: "GET" });
  if (check.ok) {
    const data = (await check.json()) as { last_event?: string };
    const ev = String(data.last_event || "").toLowerCase();
    if (ev === "canceled" || ev === "cancelled") return true;
    console.error(`[Resend] Could not cancel scheduled email ${id} — still ${ev || "unknown"}`);
  }
  return false;
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
  const payload = opts.test && listingStaysLive(campaign.status)
    ? await hydrateCampaignListing(campaign)
    : campaign;
  const html = renderCampaignHtml(payload).replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, "#");
  const body: Record<string, unknown> = {
    from: buildFrom(payload),
    to: [recipientEmail],
    reply_to: ((payload.broker_email as string) || "").toLowerCase() || undefined,
    subject: opts.test ? `[TEST] ${buildSubject(payload)}` : buildSubject(payload),
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
 *
 * Segment lists MUST use GET /segments/{id}/contacts — that keeps `after`
 * inside the segment. GET /contacts?segment_id= is undocumented and Resend
 * ignores the filter (production returned the same 5,210 global contacts on
 * Brokers, Buyers, and Sellers).
 */
async function fetchContactsPage(opts: {
  segmentId?: string;
  after?: string | null;
  limit?: number;
}): Promise<{ rows: ResendContact[]; hasMore: boolean }> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.after) qs.set("after", opts.after);
  const suffix = qs.toString() ? `?${qs}` : "";

  const path = opts.segmentId
    ? `/segments/${opts.segmentId}/contacts${suffix}`
    : `/contacts${suffix}`;

  const res = await resendFetch(path);
  if (!res.ok) {
    throw new Error(`Resend list contacts failed (${res.status}): ${await res.text()}`);
  }
  return parseContactListBody(await res.json());
}

/** Page every contact, optionally filtered to one segment. Dedupes by id. */
export async function listAllContacts(segmentId?: string): Promise<ResendContact[]> {
  const out: ResendContact[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < CONTACT_MAX_PAGES; page++) {
    const { rows, hasMore } = await fetchContactsPage({
      segmentId,
      after,
      limit: CONTACT_PAGE,
    });
    let added = 0;
    for (const row of rows) {
      const key = row.id || row.email;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      added += 1;
    }
    const next = nextContactPageCursor({ rows, hasMore, after, added });
    if (!next) break;
    after = next;
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
 * Look up ONE contact by email address. Used by the audience search as a
 * fallback so a contact added to Resend today is findable before the nightly
 * mirror sync picks it up. Returns null when Resend has no such contact.
 */
export async function lookupContactByEmail(email: string): Promise<ResendContact | null> {
  const res = await resendFetch(`/contacts/${encodeURIComponent(email.toLowerCase())}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Resend contact lookup failed (${res.status}): ${await res.text()}`);
  return unwrapContact(await res.json());
}

/**
 * Stop mailing an address, permanently.
 *
 * Resend does not do this on its own — after the first broker send every one of
 * the 112 hard-bounced contacts was still marked subscribed. Unsubscribing
 * rather than deleting means a later CSV import cannot quietly resurrect a dead
 * address, and the record stays for the audit trail.
 */
export async function markContactUnsubscribed(email: string): Promise<void> {
  const res = await resendFetch(`/contacts/${encodeURIComponent(email.toLowerCase())}`, {
    method: "PATCH",
    body: JSON.stringify({ unsubscribed: true }),
  });
  // A contact that is already gone needs no suppressing
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not suppress the contact (${res.status}): ${await res.text()}`);
  }
  invalidateContactCaches();
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
  }
  const needle = q.toLowerCase();
  const toHydrate = matches
    .filter((c) => {
      const first = (c.first_name || "").trim().toLowerCase();
      const last = (c.last_name || "").trim().toLowerCase();
      return !c.company && (first === needle || last === needle || `${first} ${last}` === needle);
    })
    .slice(0, 20);
  if (toHydrate.length) {
    const filled = await hydrateCompanies(toHydrate);
    const byEmail = new Map(filled.map((c) => [c.email.toLowerCase(), c]));
    for (let i = 0; i < matches.length; i++) {
      const swap = byEmail.get(matches[i].email.toLowerCase());
      if (swap) matches[i] = swap;
    }
  }
  matches.sort((a, b) => contactSearchScore(b, q) - contactSearchScore(a, q));
  return hydrateCompanies(matches.slice(0, SEARCH_LIMIT));
}

// ── High-level sync ──

/**
 * Count every contact in a Resend segment (full pagination).
 * Official path only: GET /segments/{id}/contacts with limit/after/has_more.
 * Never uses GET /contacts?segment_id= (that returns the global list).
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

    // Pending: Resend won't let us edit a scheduled send, so it has to be replaced.
    //
    // Create the replacement BEFORE cancelling the old one. The old order —
    // cancel, then create — destroyed the send outright whenever the create hit
    // a transient error, and the campaign was left on the calendar with nothing
    // queued at Resend. That is how the 2026-09-24 09:00 send was lost: the
    // cancel succeeded, the create did not, and nobody found out until the email
    // failed to arrive.
    //
    // The worst case of this order is a brief overlap where two sends exist. That
    // only turns into a duplicate if the process dies in the next few
    // milliseconds, and a duplicate is recoverable in a way that a silently
    // missing send is not.
    const timeChanged =
      !st.scheduledAt ||
      Math.abs(new Date(st.scheduledAt).getTime() - new Date(scheduledDate!).getTime()) > 60_000;

    let id: string;
    try {
      id = await createScheduledSend(campaign, scheduledDate!);
    } catch (err) {
      // Keep the existing send. Nothing has been cancelled, so the campaign is
      // still going to go out on its original schedule.
      const message = err instanceof Error ? err.message : "Could not create the replacement send";
      console.error("[Resend] Replacement send failed, keeping the existing one:", message);
      return {
        ok: false,
        provider_send_id: existingId,
        action: "kept existing send",
        error: message,
      };
    }

    await cancelSend(existingId);
    return { ok: true, provider_send_id: id, action: timeChanged ? "rescheduled" : "updated" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provider sync failed";
    console.error("[Resend] Sync error:", message);
    return { ok: false, provider_send_id: existingId, action: "failed", error: message };
  }
}
