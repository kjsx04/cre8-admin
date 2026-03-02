import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

// POST /api/email/campaigns/[id]/resume — resume a paused recurring campaign
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

  if (campaign.status !== "paused") {
    return NextResponse.json({ error: "Campaign is not paused" }, { status: 400 });
  }

  // Re-trigger AI scheduling to pick the next optimal slot
  try {
    const { data: existing } = await supabase
      .from("email_campaigns")
      .select("id, listing_name, email_label, scheduled_date, status, campaign_type, frequency")
      .in("status", ["scheduled", "active"])
      .neq("id", params.id);

    const baseUrl = new URL(request.url).origin;
    const scheduleRes = await fetch(`${baseUrl}/api/email/schedule`, {
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
      const scheduledDate = `${scheduleData.new_campaign_slot.date}T${scheduleData.new_campaign_slot.time}:00-07:00`;

      const { data: updated, error: updateErr } = await supabase
        .from("email_campaigns")
        .update({
          status: "active",
          next_send_date: scheduledDate,
          scheduled_date: scheduledDate,
          ai_reasoning: scheduleData.new_campaign_slot.reasoning,
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
  } catch (err) {
    console.error("[Resume] AI scheduling failed:", err);
  }

  // Fallback: just set to active without re-scheduling
  const { data: updated, error: updateErr } = await supabase
    .from("email_campaigns")
    .update({
      status: "active",
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
