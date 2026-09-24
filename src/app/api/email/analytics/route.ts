import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { supabase } from "@/lib/flow/supabase";
import { buildAnalytics, type AnalyticsEvent, type AnalyticsCampaign, type AnalyticsSummary } from "@/lib/email/analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/** Supabase caps a select at 1,000 rows. Every read of email_events has to page. */
const PAGE = 1000;

/** How long a computed summary is reused. Events arrive in bursts around a send, not continuously. */
const CACHE_MS = 60_000;

let cached: { at: number; events: AnalyticsEvent[]; campaigns: AnalyticsCampaign[] } | null = null;

interface EventRow {
  id: string;
  event_type: string;
  campaign_id: string | null;
  email_id: string | null;
  broadcast_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown> | null;
}

/**
 * Pull the fields the classifier and the maths need out of Resend's payload.
 *
 * Opens and clicks nest their metadata differently (`payload.click` vs
 * `payload.open`), and a bounce hides its severity under `payload.bounce.type`.
 * Everything else in the payload — including the recipient address, which the
 * webhook strips before storing — is deliberately left behind.
 */
function toAnalyticsEvent(row: EventRow): AnalyticsEvent {
  // `any` is unavoidable here: this is untyped provider JSON, and the whole
  // point of the function is to narrow it down to typed fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (row.payload || {}) as any;
  const detail = p.click || p.open || {};
  const bounce = p.bounce || {};

  return {
    id: row.id,
    event_type: row.event_type,
    campaign_id: row.campaign_id,
    email_id: row.email_id,
    broadcast_id: row.broadcast_id,
    occurred_at: row.occurred_at,
    link: typeof detail.link === "string" ? detail.link : null,
    userAgent: typeof detail.userAgent === "string" ? detail.userAgent : null,
    ipAddress: typeof detail.ipAddress === "string" ? detail.ipAddress : null,
    bounce_type: typeof bounce.type === "string" ? bounce.type : null,
  };
}

/** Every attributed event, paged past the 1,000-row cap. */
async function loadEvents(): Promise<AnalyticsEvent[]> {
  const out: AnalyticsEvent[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("email_events")
      .select("id, event_type, campaign_id, email_id, broadcast_id, occurred_at, payload")
      // Unattributed events are test sends to colleagues. Counting them as
      // campaign performance would put a 100% open rate on an empty campaign.
      .not("campaign_id", "is", null)
      .order("occurred_at", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const rows = (data || []) as EventRow[];
    out.push(...rows.map(toAnalyticsEvent));
    if (rows.length < PAGE) break;
  }
  return out;
}

async function loadCampaigns(): Promise<AnalyticsCampaign[]> {
  const { data, error } = await supabase
    .from("email_campaigns")
    .select("id, listing_name, email_label, status, campaign_type, campaign_kind, frequency, segment_id, created_at, last_sent_at");
  if (error) throw new Error(error.message);
  return (data || []) as AnalyticsCampaign[];
}

/**
 * GET /api/email/analytics[?campaign=<id>][&refresh=1]
 *
 * Returns one shape whether the scope is every campaign or a single one, so the
 * dashboard renders the same panels either way.
 *
 * Classification runs here rather than in a table: there are only a few thousand
 * events, and keeping it in code means a threshold in analytics-config.ts takes
 * effect on the next page load instead of needing a migration and a reclassify.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const campaignId = request.nextUrl.searchParams.get("campaign");
    const force = request.nextUrl.searchParams.get("refresh") === "1";

    if (force || !cached || Date.now() - cached.at > CACHE_MS) {
      const [events, campaigns] = await Promise.all([loadEvents(), loadCampaigns()]);
      cached = { at: Date.now(), events, campaigns };
    }

    const summary: AnalyticsSummary = buildAnalytics(
      cached.events,
      cached.campaigns,
      campaignId && campaignId !== "all" ? campaignId : null
    );

    return NextResponse.json(
      { data: summary },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build analytics" },
      { status: 500 }
    );
  }
}
