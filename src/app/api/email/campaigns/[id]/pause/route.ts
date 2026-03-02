import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

// POST /api/email/campaigns/[id]/pause — pause a recurring campaign
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  // Cancel pending SendGrid send if one exists
  if (campaign.sendgrid_single_send_id) {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      try {
        await fetch(
          `https://api.sendgrid.com/v3/marketing/singlesends/${campaign.sendgrid_single_send_id}/schedule`,
          { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } }
        );
        await fetch(
          `https://api.sendgrid.com/v3/marketing/singlesends/${campaign.sendgrid_single_send_id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } }
        );
      } catch (err) {
        console.error("[Pause] SendGrid cleanup error:", err);
      }
    }
  }

  // Update campaign status to paused
  const { data: updated, error: updateErr } = await supabase
    .from("email_campaigns")
    .update({
      status: "paused",
      sendgrid_single_send_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
