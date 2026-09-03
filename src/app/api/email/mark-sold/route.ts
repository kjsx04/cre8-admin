import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { cancelSend } from "@/lib/email/provider";
import { scheduleCampaign } from "@/lib/email/scheduler";

// POST /api/email/mark-sold — stop all campaigns for a listing, optionally send a Just Sold announcement
// Called by the publish flow (sold = true) and by listing delete.
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json();
  const { listing_id, sendAnnouncement } = body;

  if (!listing_id) {
    return NextResponse.json({ error: "Missing listing_id" }, { status: 400 });
  }

  // Find all campaigns for this listing that should be stopped
  const { data: campaigns, error: fetchErr } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("listing_id", listing_id)
    .in("status", ["scheduled", "active", "draft", "paused"]);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const stopped: string[] = [];

  // Cancel each campaign's pending Resend send and mark as completed
  for (const campaign of campaigns || []) {
    await cancelSend(campaign.provider_send_id);

    await supabase
      .from("email_campaigns")
      .update({
        status: "completed",
        provider_send_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    stopped.push(campaign.id);
  }

  // Optionally create a Just Sold announcement campaign
  let announcement = null;
  if (sendAnnouncement && campaigns && campaigns.length > 0) {
    // Use the first campaign's broker info as a template
    const template = campaigns[0];

    const { data: newCampaign, error: insertErr } = await supabase
      .from("email_campaigns")
      .insert({
        listing_id,
        listing_name: template.listing_name,
        campaign_type: "one-time",
        email_label: "Just Sold",
        heading_text: `SOLD: ${template.listing_name}`,
        body_text: template.body_text || null,
        photo_url: template.photo_url || null,
        highlights: template.highlights || [],
        listing_page_url: template.listing_page_url || null,
        broker_id: template.broker_id,
        broker_name: template.broker_name,
        broker_email: template.broker_email,
        broker_phone: template.broker_phone,
        segment_id: template.segment_id,
        segment_name: template.segment_name,
        frequency: "one-time",
        status: "draft",
      })
      .select()
      .single();

    if (!insertErr && newCampaign) {
      announcement = newCampaign;
      // AI slot → save → push to Resend
      try {
        const baseUrl = new URL(request.url).origin;
        const { campaign: scheduled } = await scheduleCampaign(baseUrl, newCampaign);
        if (scheduled) announcement = scheduled;
      } catch (err) {
        console.error("[MarkSold] AI scheduling for announcement failed:", err);
      }
    }
  }

  return NextResponse.json({
    stopped_campaigns: stopped,
    announcement,
  });
}
