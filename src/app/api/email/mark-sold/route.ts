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
        partner_logo_url: template.partner_logo_url || null,
        partner_logo_width: template.partner_logo_width || null,
        partner_logo_height: template.partner_logo_height || null,
        highlights: template.highlights || [],
        listing_page_url: template.listing_page_url || null,
        broker_id: template.broker_id,
        broker_name: template.broker_name,
        broker_email: template.broker_email,
        broker_phone: template.broker_phone,
        broker_ids: template.broker_ids || [template.broker_id],
        priority: template.priority || "normal",
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

  // Group emails that include this listing: drop the card (pause the group if it falls under 2)
  const groupsTouched: string[] = [];
  const { data: groups } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("campaign_kind", "group")
    .in("status", ["scheduled", "active", "draft", "paused"])
    .contains("group_listings", JSON.stringify([{ listing_id }]));
  for (const g of groups || []) {
    const remaining = (g.group_listings || []).filter((x: { listing_id: string }) => x.listing_id !== listing_id);
    const updates: Record<string, unknown> = { group_listings: remaining, updated_at: new Date().toISOString() };
    if (remaining.length < 2 && (g.status === "scheduled" || g.status === "active")) {
      await cancelSend(g.provider_send_id);
      updates.status = "paused";
      updates.provider_send_id = null;
    }
    await supabase.from("email_campaigns").update(updates).eq("id", g.id);
    groupsTouched.push(g.id);
  }
  // Re-sync groups that are still live so the sold listing disappears from the pending email
  for (const g of groups || []) {
    const { data: fresh } = await supabase.from("email_campaigns").select("*").eq("id", g.id).single();
    if (fresh && (fresh.status === "scheduled" || fresh.status === "active")) {
      const { syncCampaignToProvider } = await import("@/lib/email/provider");
      const sync = await syncCampaignToProvider(fresh);
      if (sync.provider_send_id !== fresh.provider_send_id) {
        await supabase.from("email_campaigns").update({ provider_send_id: sync.provider_send_id }).eq("id", g.id);
      }
    }
  }

  return NextResponse.json({
    stopped_campaigns: stopped,
    groups_updated: groupsTouched,
    announcement,
  });
}
