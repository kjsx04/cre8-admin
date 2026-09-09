import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";

/**
 * GET  /api/email/alerts            — open alerts (not dismissed), with campaign name/label
 * POST /api/email/alerts            — { id, action: "dismiss" } snoozes for 14 days
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("email_alerts")
    .select("id, campaign_id, type, message, created_at, dismissed_until, email_campaigns(listing_name, email_label, status)")
    .or(`dismissed_until.is.null,dismissed_until.lt.${nowIso}`)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const alerts = (data || [])
    .filter((a) => {
      const c = a.email_campaigns as unknown as { status?: string } | null;
      return c && (c.status === "scheduled" || c.status === "active" || c.status === "draft");
    })
    .map((a) => {
      const c = a.email_campaigns as unknown as { listing_name?: string; email_label?: string } | null;
      return {
        id: a.id,
        campaign_id: a.campaign_id,
        type: a.type,
        message: a.message,
        created_at: a.created_at,
        listing_name: c?.listing_name || "",
        email_label: c?.email_label || "",
      };
    });

  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (!body.id || body.action !== "dismiss") {
    return NextResponse.json({ error: "id and action=dismiss required" }, { status: 400 });
  }
  const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const { error } = await supabase.from("email_alerts").update({ dismissed_until: until }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dismissed_until: until });
}
