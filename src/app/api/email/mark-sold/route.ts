import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

// POST /api/email/mark-sold — stop all campaigns for a listing, optionally send Just Sold announcement
export async function POST(request: NextRequest) {
  const email = request.headers.get("x-user-email");
  if (!email) {
    return NextResponse.json({ error: "Missing x-user-email header" }, { status: 401 });
  }

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
  const apiKey = process.env.SENDGRID_API_KEY;

  // Cancel each campaign's pending SendGrid send and mark as completed
  for (const campaign of campaigns || []) {
    if (campaign.sendgrid_single_send_id && apiKey) {
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
        console.error(`[MarkSold] SendGrid cleanup error for ${campaign.id}:`, err);
      }
    }

    await supabase
      .from("email_campaigns")
      .update({
        status: "completed",
        sendgrid_single_send_id: null,
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
      // Trigger AI scheduling for the announcement
      try {
        const { data: existing } = await supabase
          .from("email_campaigns")
          .select("id, listing_name, email_label, scheduled_date, status, campaign_type, frequency")
          .in("status", ["scheduled", "active"]);

        const baseUrl = new URL(request.url).origin;
        const scheduleRes = await fetch(`${baseUrl}/api/email/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id: newCampaign.id,
            email_label: "Just Sold",
            campaign_type: "one-time",
            listing_name: template.listing_name,
            frequency: "one-time",
            existing_campaigns: existing || [],
          }),
        });

        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json();
          const scheduledDate = `${scheduleData.new_campaign_slot.date}T${scheduleData.new_campaign_slot.time}:00-07:00`;

          await supabase
            .from("email_campaigns")
            .update({
              scheduled_date: scheduledDate,
              status: "scheduled",
              ai_reasoning: scheduleData.new_campaign_slot.reasoning,
              updated_at: new Date().toISOString(),
            })
            .eq("id", newCampaign.id);
        }
      } catch (err) {
        console.error("[MarkSold] AI scheduling for announcement failed:", err);
      }

      announcement = newCampaign;
    }
  }

  return NextResponse.json({
    stopped_campaigns: stopped,
    announcement,
  });
}
