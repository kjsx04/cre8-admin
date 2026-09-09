import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { scheduleCampaign } from "@/lib/email/scheduler";
import { placeListing } from "@/lib/email/priorities";
import { randomUUID } from "crypto";

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

  // Group (digest) emails: several listings in one email. They get their own synthetic
  // listing id so scheduling, spacing and priorities treat the group as one thing.
  const isGroup = body.campaign_kind === "group";
  const groupListings = isGroup && Array.isArray(body.group_listings) ? body.group_listings : [];
  if (isGroup) {
    if (groupListings.length < 2) return NextResponse.json({ error: "A group email needs at least 2 listings" }, { status: 400 });
    body.listing_id = body.listing_id && String(body.listing_id).startsWith("group:") ? body.listing_id : `group:${randomUUID()}`;
    body.email_label = body.email_label || "";
    body.listing_name = body.listing_name || body.email_label || body.heading_text || "Group email";
    body.photo_url = body.photo_url || groupListings[0]?.photo_url || null;
  }

  // Validate required fields
  if (!body.listing_id || !body.listing_name || !body.broker_id || (!body.email_label && !isGroup)) {
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
      campaign_kind: isGroup ? "group" : "single",
      group_listings: groupListings,
      email_label: body.email_label,
      heading_text: body.heading_text || null,
      body_text: body.body_text || null,
      photo_url: body.photo_url || null,
      partner_logo_url: body.partner_logo_url || null,
      partner_logo_width: body.partner_logo_width ? Number(body.partner_logo_width) : null,
      partner_logo_height: body.partner_logo_height ? Number(body.partner_logo_height) : null,
      highlights: body.highlights || [],
      listing_page_url: body.listing_page_url || null,
      broker_id: body.broker_id,
      broker_name: body.broker_name,
      broker_email: body.broker_email,
      broker_phone: body.broker_phone || null,
      // All brokers on the email (primary first). Defaults to just the primary.
      broker_ids: Array.isArray(body.broker_ids) && body.broker_ids.length > 0
        ? Array.from(new Set([body.broker_id, ...body.broker_ids]))
        : [body.broker_id],
      priority: body.priority === "high" ? "high" : "normal",
      pinned: !!body.pinned,
      cadence_changed_at: new Date().toISOString(),
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

  // Give the listing a spot in the ranked priority list (top for "Top of list", else bottom)
  try {
    await placeListing(campaign.listing_id, campaign.listing_name, campaign.priority === "high" ? "top" : "bottom");
  } catch (err) {
    console.error("[POST campaigns] rank placement failed:", err);
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
