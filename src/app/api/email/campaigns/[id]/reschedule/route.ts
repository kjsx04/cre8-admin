import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { scheduleCampaign } from "@/lib/email/scheduler";

/**
 * POST /api/email/campaigns/[id]/reschedule — ask the AI for a fresh slot and push it to Resend.
 * Optional body: { priority: "high" | "normal" } to change priority in the same call.
 * Used by the Priorities panel so a change takes effect immediately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));

  // Optional priority change first
  if (body.priority === "high" || body.priority === "normal") {
    await supabase
      .from("email_campaigns")
      .update({ priority: body.priority, updated_at: new Date().toISOString() })
      .eq("id", params.id);
  }

  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "scheduled" && campaign.status !== "active") {
    return NextResponse.json({ error: "Only scheduled or active campaigns can be rescheduled" }, { status: 400 });
  }

  try {
    const baseUrl = new URL(request.url).origin;
    const { campaign: scheduled, sync } = await scheduleCampaign(baseUrl, campaign);
    if (!scheduled) {
      return NextResponse.json({ error: "The scheduler didn't return a slot" }, { status: 502 });
    }
    return NextResponse.json({ ...scheduled, highlights: scheduled.highlights || [], provider_sync: sync });
  } catch (err) {
    console.error("[reschedule] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reschedule failed" }, { status: 500 });
  }
}
