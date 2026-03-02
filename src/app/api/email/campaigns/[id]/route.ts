import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

// GET /api/email/campaigns/[id] — fetch a single campaign
export async function GET(
  request: NextRequest,
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

// PATCH /api/email/campaigns/[id] — update campaign fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
  if (body.sendgrid_single_send_id !== undefined) updates.sendgrid_single_send_id = body.sendgrid_single_send_id;

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("email_campaigns")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    highlights: data.highlights || [],
  });
}

// DELETE /api/email/campaigns/[id] — delete a campaign + cancel SendGrid send
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Fetch campaign first to cancel any pending SendGrid send
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("sendgrid_single_send_id")
    .eq("id", params.id)
    .single();

  if (campaign?.sendgrid_single_send_id) {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      try {
        // Unschedule
        await fetch(
          `https://api.sendgrid.com/v3/marketing/singlesends/${campaign.sendgrid_single_send_id}/schedule`,
          { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } }
        );
        // Delete
        await fetch(
          `https://api.sendgrid.com/v3/marketing/singlesends/${campaign.sendgrid_single_send_id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } }
        );
      } catch (err) {
        console.error("[DELETE campaign] SendGrid cleanup error:", err);
      }
    }
  }

  const { error } = await supabase
    .from("email_campaigns")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
