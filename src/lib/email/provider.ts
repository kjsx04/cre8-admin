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
 *   RESEND_SEGMENT_ID_ALL  — Resend segment id that holds every CRE8 contact
 *   RESEND_SEGMENT_ID_TEST — Resend segment id with just the brokers (for test blasts)
 */

import { buildTemplateVars, renderEmailHtml } from "./constants";

const RESEND_API = "https://api.resend.com";

// Campaign-shaped record — loose on purpose so raw Supabase rows work directly
export type CampaignLike = Record<string, unknown>;

/** True when the provider is configured (API key present) */
export function isProviderConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Map our internal segment ids ("all", "test") to real Resend segment ids */
export function resolveSegmentId(segmentId: unknown): string | null {
  const key = typeof segmentId === "string" && segmentId ? segmentId : "all";
  const map: Record<string, string | undefined> = {
    all: process.env.RESEND_SEGMENT_ID_ALL,
    test: process.env.RESEND_SEGMENT_ID_TEST,
  };
  // Unknown internal ids fall back to "All Contacts"
  return map[key] || process.env.RESEND_SEGMENT_ID_ALL || null;
}

/** Subject line: "Just Listed: 6933 N 7th St" */
export function buildSubject(campaign: CampaignLike): string {
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
  return fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

/** Build the broadcast payload shared by create + update */
function buildBroadcastBody(campaign: CampaignLike, nameSuffix = "") {
  const segmentId = resolveSegmentId(campaign.segment_id);
  if (!segmentId) throw new Error("No Resend segment configured (RESEND_SEGMENT_ID_ALL)");

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
 * Create a broadcast and schedule it for sendAtIso.
 * Returns the Resend broadcast id, or throws with the API error.
 */
export async function createScheduledSend(
  campaign: CampaignLike,
  sendAtIso: string
): Promise<string> {
  const dateLabel = new Date(sendAtIso).toLocaleDateString("en-US", { timeZone: "America/Phoenix" });
  const body = {
    ...buildBroadcastBody(campaign, ` (${dateLabel})`),
    send: true,
    scheduled_at: sendAtIso,
  };

  const res = await resendFetch("/broadcasts", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`Resend create failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.id as string;
}

/** Cancel a pending broadcast. Safe to call if it's already gone (404 ignored). */
export async function cancelSend(broadcastId: string | null | undefined): Promise<void> {
  if (!broadcastId || !isProviderConfigured()) return;
  try {
    const res = await resendFetch(`/broadcasts/${broadcastId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      console.warn(`[Resend] Cancel failed (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error("[Resend] Cancel error:", err);
  }
}

export type SendStatus = {
  state: "pending" | "sent" | "missing" | "unknown";
  scheduledAt: string | null;
  sentAt: string | null;
};

/** Check whether a broadcast is still pending, already sent, or gone */
export async function getSendStatus(broadcastId: string): Promise<SendStatus> {
  try {
    const res = await resendFetch(`/broadcasts/${broadcastId}`, { method: "GET" });
    if (res.status === 404) return { state: "missing", scheduledAt: null, sentAt: null };
    if (!res.ok) return { state: "unknown", scheduledAt: null, sentAt: null };

    const data = await res.json();
    const status = String(data.status || "").toLowerCase();
    const sentAt = (data.sent_at as string) || null;
    const scheduledAt = (data.scheduled_at as string) || null;

    if (status === "sent" || sentAt) return { state: "sent", scheduledAt, sentAt };
    if (status === "canceled" || status === "cancelled") return { state: "missing", scheduledAt, sentAt };
    // draft / scheduled / queued → still waiting to go out
    return { state: "pending", scheduledAt, sentAt };
  } catch (err) {
    console.error("[Resend] Status error:", err);
    return { state: "unknown", scheduledAt: null, sentAt: null };
  }
}

/**
 * Send a one-off test email to a single recipient (transactional, no segment).
 * Subject is prefixed with [TEST]. The unsubscribe link is replaced with "#".
 */
export async function sendTest(recipientEmail: string, campaign: CampaignLike): Promise<void> {
  const html = renderCampaignHtml(campaign).replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, "#");

  const res = await resendFetch("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: buildFrom(campaign),
      to: [recipientEmail],
      reply_to: ((campaign.broker_email as string) || "").toLowerCase() || undefined,
      subject: `[TEST] ${buildSubject(campaign)}`,
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend test send failed (${res.status}): ${await res.text()}`);
  }
}

// ── High-level sync ──

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
