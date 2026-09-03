import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { scheduleCampaign } from "@/lib/email/scheduler";

// POST /api/email/campaigns/[id]/resume — resume a paused recurring campaign
// Asks the AI for the next slot, saves it, and creates a fresh Resend broadcast.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  // Fetch campaign
  const { data: campaign, error: fetchErr } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (fetchErr || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status !== "paused") {
    return NextResponse.json({ error: "Campaign is not paused" }, { status: 400 });
  }

  // Re-trigger AI scheduling to pick the next optimal slot + push to Resend
  try {
    const baseUrl = new URL(request.url).origin;
    const { campaign: scheduled, sync } = await scheduleCampaign(baseUrl, campaign);

    if (scheduled) {
      return NextResponse.json({
        ...scheduled,
        highlights: scheduled.highlights || [],
        provider_sync: sync,
      });
    }
  } catch (err) {
    console.error("[Resume] AI scheduling failed:", err);
  }

  // Fallback: set to active without a send time. The daily cron will schedule it.
  const { data: updated, error: updateErr } = await supabase
    .from("email_campaigns")
    .update({
      status: "active",
      next_send_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ...updated, highlights: updated.highlights || [] });
}
