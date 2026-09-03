import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { syncCampaignToProvider, cancelSend } from "@/lib/email/provider";
import { scheduleCampaign } from "@/lib/email/scheduler";

// GET /api/email/campaigns/[id] — fetch a single campaign
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    highlights: data.highlights || [],
  });
}

// PATCH /api/email/campaigns/[id] — update campaign fields, then push the change to Resend
//
// This is the "edit it here and it's live at the provider" path:
//   - Save the new fields to Supabase
//   - If the campaign has a pending send → update the Resend broadcast in place
//   - If it's still a draft and auto_schedule is set → get an AI slot and schedule it
// The response includes `provider_sync` so the UI can show a warning if Resend failed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json();

  // Build update object — only include present fields
  const updates: Record<string, unknown> = {};

  if (body.listing_id !== undefined) updates.listing_id = body.listing_id;
  if (body.listing_name !== undefined) updates.listing_name = body.listing_name;
  if (body.campaign_type !== undefined) updates.campaign_type = body.campaign_type;
  if (body.email_label !== undefined) updates.email_label = body.email_label;
  if (body.heading_text !== undefined) updates.heading_text = body.heading_text || null;
  if (body.body_text !== undefined) updates.body_text = body.body_text || null;
  if (body.photo_url !== undefined) updates.photo_url = body.photo_url || null;
  if (body.highlights !== undefined) updates.highlights = body.highlights;
  if (body.listing_page_url !== undefined) updates.listing_page_url = body.listing_page_url || null;
  if (body.broker_id !== undefined) updates.broker_id = body.broker_id;
  if (body.broker_name !== undefined) updates.broker_name = body.broker_name;
  if (body.broker_email !== undefined) updates.broker_email = body.broker_email;
  if (body.broker_phone !== undefined) updates.broker_phone = body.broker_phone || null;
  if (body.segment_id !== undefined) updates.segment_id = body.segment_id || null;
  if (body.segment_name !== undefined) updates.segment_name = body.segment_name;
  if (body.frequency !== undefined) updates.frequency = body.frequency;
  if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date;
  if (body.next_send_date !== undefined) updates.next_send_date = body.next_send_date;
  if (body.end_date !== undefined) updates.end_date = body.end_date || null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.ai_reasoning !== undefined) updates.ai_reasoning = body.ai_reasoning;

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("email_campaigns")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
  }

  let campaign = data;
  let providerSync = null;

  try {
    if (campaign.status === "draft" && body.auto_schedule) {
      // Never scheduled yet — treat this like a create
      const baseUrl = new URL(request.url).origin;
      const result = await scheduleCampaign(baseUrl, campaign);
      if (result.campaign) campaign = result.campaign;
      providerSync = result.sync;
    } else if (campaign.status === "scheduled" || campaign.status === "active") {
      // Has (or should have) a pending send — make Resend match the new content
      providerSync = await syncCampaignToProvider(campaign);
      if (providerSync.provider_send_id !== campaign.provider_send_id) {
        await supabase
          .from("email_campaigns")
          .update({ provider_send_id: providerSync.provider_send_id })
          .eq("id", params.id);
        campaign.provider_send_id = providerSync.provider_send_id;
      }
    }
  } catch (err) {
    console.error("[PATCH campaign] provider sync error:", err);
    providerSync = {
      ok: false,
      provider_send_id: campaign.provider_send_id,
      action: "failed",
      error: err instanceof Error ? err.message : "Provider sync failed",
    };
  }

  return NextResponse.json({
    ...campaign,
    highlights: campaign.highlights || [],
    provider_sync: providerSync,
  });
}

// DELETE /api/email/campaigns/[id] — delete a campaign + cancel its pending Resend send
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  // Fetch campaign first to cancel any pending send
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("provider_send_id")
    .eq("id", params.id)
    .single();

  await cancelSend(campaign?.provider_send_id);

  const { error } = await supabase
    .from("email_campaigns")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
