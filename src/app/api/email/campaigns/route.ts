import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

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
export async function POST(request: NextRequest) {
  const email = request.headers.get("x-user-email");
  if (!email) {
    return NextResponse.json({ error: "Missing x-user-email header" }, { status: 401 });
  }

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

  // If auto_schedule is true, call the AI scheduling endpoint internally
  if (body.auto_schedule) {
    try {
      // Fetch all existing scheduled/active campaigns for AI context
      const { data: existing } = await supabase
        .from("email_campaigns")
        .select("id, listing_name, email_label, scheduled_date, status, campaign_type, frequency")
        .in("status", ["scheduled", "active"]);

      // Call the AI schedule logic
      const scheduleRes = await fetch(new URL("/api/email/schedule", request.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.id,
          email_label: campaign.email_label,
          campaign_type: campaign.campaign_type,
          listing_name: campaign.listing_name,
          frequency: campaign.frequency,
          existing_campaigns: existing || [],
        }),
      });

      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json();

        // Update campaign with scheduled date + AI reasoning
        const scheduledDate = `${scheduleData.new_campaign_slot.date}T${scheduleData.new_campaign_slot.time}:00-07:00`;

        const updateFields: Record<string, unknown> = {
          scheduled_date: scheduledDate,
          ai_reasoning: scheduleData.new_campaign_slot.reasoning,
          status: "scheduled",
        };

        // For recurring campaigns, set next_send_date = scheduled_date
        if (campaign.campaign_type === "recurring") {
          updateFields.next_send_date = scheduledDate;
          updateFields.status = "active";
        }

        // Create SendGrid Single Send if API key is configured
        const sendgridId = await createSendGridSingleSend(campaign, scheduledDate);
        if (sendgridId) {
          updateFields.sendgrid_single_send_id = sendgridId;
        }

        await supabase
          .from("email_campaigns")
          .update(updateFields)
          .eq("id", campaign.id);

        // Apply any calendar shifts the AI suggested
        if (scheduleData.calendar_changes?.length > 0) {
          for (const change of scheduleData.calendar_changes) {
            const newDate = `${change.new_date}T${change.new_time}:00-07:00`;

            // Cancel old SendGrid send and create new one
            const { data: shifted } = await supabase
              .from("email_campaigns")
              .select("*")
              .eq("id", change.id)
              .single();

            if (shifted?.sendgrid_single_send_id) {
              await cancelSendGridSend(shifted.sendgrid_single_send_id);
            }

            const newSgId = shifted ? await createSendGridSingleSend(shifted, newDate) : null;

            await supabase
              .from("email_campaigns")
              .update({
                scheduled_date: newDate,
                sendgrid_single_send_id: newSgId,
                ai_reasoning: `Shifted: ${change.reason}`,
              })
              .eq("id", change.id);
          }
        }

        // Re-fetch the updated campaign
        const { data: updated } = await supabase
          .from("email_campaigns")
          .select("*")
          .eq("id", campaign.id)
          .single();

        return NextResponse.json(updated || campaign, { status: 201 });
      }
    } catch (err) {
      console.error("[POST campaigns] AI scheduling failed, campaign saved as draft:", err);
    }
  }

  return NextResponse.json(campaign, { status: 201 });
}

// ── SendGrid helpers ──

async function createSendGridSingleSend(
  campaign: Record<string, unknown>,
  scheduledDate: string
): Promise<string | null> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;

  try {
    // Import renderEmailHtml dynamically to avoid bundling in client
    const { renderEmailHtml } = await import("@/lib/email/constants");
    const { getTypeColor } = await import("@/lib/email/utils");

    const label = campaign.email_label as string;
    const html = renderEmailHtml({
      label,
      labelColor: getTypeColor(label),
      heading: (campaign.heading_text as string) || (campaign.listing_name as string),
      bodyText: (campaign.body_text as string) || "",
      photoUrl: (campaign.photo_url as string) || "",
      highlights: (campaign.highlights as string[]) || [],
      listingUrl: (campaign.listing_page_url as string) || "",
      brokerName: campaign.broker_name as string,
      brokerEmail: campaign.broker_email as string,
      brokerPhone: (campaign.broker_phone as string) || "",
    });

    // Create Single Send in SendGrid
    const createRes = await fetch("https://api.sendgrid.com/v3/marketing/singlesends", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${label}: ${campaign.listing_name}`,
        send_to: campaign.segment_id && campaign.segment_id !== "all"
          ? { segment_ids: [campaign.segment_id] }
          : { all: true },
        email_config: {
          subject: `${label}: ${campaign.listing_name}`,
          html_content: html,
          sender_id: undefined, // Will use default verified sender
          suppression_group_id: undefined,
        },
      }),
    });

    if (!createRes.ok) {
      console.error("[SendGrid] Create failed:", await createRes.text());
      return null;
    }

    const sendData = await createRes.json();
    const singleSendId = sendData.id;

    // Schedule the Single Send
    const scheduleRes = await fetch(
      `https://api.sendgrid.com/v3/marketing/singlesends/${singleSendId}/schedule`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ send_at: scheduledDate }),
      }
    );

    if (!scheduleRes.ok) {
      console.error("[SendGrid] Schedule failed:", await scheduleRes.text());
    }

    return singleSendId;
  } catch (err) {
    console.error("[SendGrid] Error:", err);
    return null;
  }
}

async function cancelSendGridSend(singleSendId: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !singleSendId) return;

  try {
    // Unschedule first
    await fetch(
      `https://api.sendgrid.com/v3/marketing/singlesends/${singleSendId}/schedule`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    // Delete the Single Send
    await fetch(
      `https://api.sendgrid.com/v3/marketing/singlesends/${singleSendId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );
  } catch (err) {
    console.error("[SendGrid] Cancel error:", err);
  }
}
