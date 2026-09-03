import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { scheduleCampaign } from "@/lib/email/scheduler";

// GET /api/email/campaigns — list campaigns, optionally filtered by listing_id or status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get("listing_id");
  const status = searchParams.get("status");

  let query = supabase
    .from("email_campaigns")
    .select("*")
    .order("scheduled_date", { ascending: true, nullsFirst: false });

  if (listingId) {
    query = query.eq("listing_id", listingId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Parse JSONB highlights for each campaign
  const campaigns = (data || []).map((c) => ({
    ...c,
    highlights: c.highlights || [],
  }));

  return NextResponse.json({ campaigns });
}

// POST /api/email/campaigns — create a new campaign, optionally trigger AI scheduling
//
// Flow when auto_schedule is true:
//   1. Insert the campaign as a draft (snapshot of listing data + user inputs)
//   2. Ask the AI for a send slot
//   3. Save the slot, push the rendered email to Resend as a scheduled broadcast
//   4. Apply any calendar shifts the AI suggested (those get re-pushed too)
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json();

  // Validate required fields
  if (!body.listing_id || !body.listing_name || !body.broker_id || !body.email_label) {
    return NextResponse.json(
      { error: "Missing required fields: listing_id, listing_name, broker_id, email_label" },
      { status: 400 }
    );
  }

  // Insert campaign as draft
  const { data: campaign, error: insertErr } = await supabase
    .from("email_campaigns")
    .insert({
      listing_id: body.listing_id,
      listing_name: body.listing_name,
      campaign_type: body.campaign_type || "one-time",
      email_label: body.email_label,
      heading_text: body.heading_text || null,
      body_text: body.body_text || null,
      photo_url: body.photo_url || null,
      highlights: body.highlights || [],
      listing_page_url: body.listing_page_url || null,
      broker_id: body.broker_id,
      broker_name: body.broker_name,
      broker_email: body.broker_email,
      broker_phone: body.broker_phone || null,
      segment_id: body.segment_id || null,
      segment_name: body.segment_name || "All Contacts",
      frequency: body.frequency || "one-time",
      end_date: body.end_date || null,
      status: "draft",
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // If auto_schedule is true, get an AI slot + push to Resend
  if (body.auto_schedule) {
    try {
      const baseUrl = new URL(request.url).origin;
      const { campaign: scheduled, sync } = await scheduleCampaign(baseUrl, campaign);

      if (scheduled) {
        return NextResponse.json(
          { ...scheduled, highlights: scheduled.highlights || [], provider_sync: sync },
          { status: 201 }
        );
      }
    } catch (err) {
      console.error("[POST campaigns] AI scheduling failed, campaign saved as draft:", err);
    }
  }

  return NextResponse.json({ ...campaign, highlights: campaign.highlights || [] }, { status: 201 });
}
