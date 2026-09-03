import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { cancelSend } from "@/lib/email/provider";

// POST /api/email/campaigns/[id]/pause — pause a recurring campaign
// Cancels the pending Resend broadcast so nothing goes out while paused.
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

  if (campaign.campaign_type !== "recurring") {
    return NextResponse.json({ error: "Only recurring campaigns can be paused" }, { status: 400 });
  }

  if (campaign.status !== "active" && campaign.status !== "scheduled") {
    return NextResponse.json({ error: "Campaign is not active" }, { status: 400 });
  }

  // Cancel the pending send at Resend
  await cancelSend(campaign.provider_send_id);

  // Update campaign status to paused
  const { data: updated, error: updateErr } = await supabase
    .from("email_campaigns")
    .update({
      status: "paused",
      provider_send_id: null,
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
