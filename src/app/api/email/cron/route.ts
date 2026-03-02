import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

// GET /api/email/cron — Vercel Cron handler
// Runs daily at 6 AM MST (1 PM UTC). Creates next SendGrid send for recurring campaigns.
export async function GET(request: NextRequest) {
  // Verify cron auth (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find active recurring campaigns where next_send_date is within 7 days
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: campaigns, error } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("status", "active")
      .eq("campaign_type", "recurring")
      .lte("next_send_date", sevenDaysOut);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: { id: string; action: string }[] = [];

    for (const campaign of campaigns || []) {
      // Skip if end_date has passed
      if (campaign.end_date && new Date(campaign.end_date) < new Date()) {
        await supabase
          .from("email_campaigns")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", campaign.id);

        results.push({ id: campaign.id, action: "completed (end date passed)" });
        continue;
      }

      // Skip if there's already a pending SendGrid send (hasn't been sent yet)
      if (campaign.sendgrid_single_send_id) {
        results.push({ id: campaign.id, action: "skipped (pending send exists)" });
        continue;
      }

      // Call AI scheduling for the next send
      try {
        const { data: existing } = await supabase
          .from("email_campaigns")
          .select("id, listing_name, email_label, scheduled_date, status, campaign_type, frequency")
          .in("status", ["scheduled", "active"])
          .neq("id", campaign.id);

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
          const nextDate = `${scheduleData.new_campaign_slot.date}T${scheduleData.new_campaign_slot.time}:00-07:00`;

          // Create SendGrid Single Send for this occurrence
          const apiKey = process.env.SENDGRID_API_KEY;
          let sgId: string | null = null;

          if (apiKey) {
            const { renderEmailHtml } = await import("@/lib/email/constants");
            const { getTypeColor } = await import("@/lib/email/utils");

            const html = renderEmailHtml({
              label: campaign.email_label,
              labelColor: getTypeColor(campaign.email_label),
              heading: campaign.heading_text || campaign.listing_name,
              bodyText: campaign.body_text || "",
              photoUrl: campaign.photo_url || "",
              highlights: campaign.highlights || [],
              listingUrl: campaign.listing_page_url || "",
              brokerName: campaign.broker_name,
              brokerEmail: campaign.broker_email,
              brokerPhone: campaign.broker_phone || "",
            });

            const createRes = await fetch("https://api.sendgrid.com/v3/marketing/singlesends", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: `${campaign.email_label}: ${campaign.listing_name} (${new Date(nextDate).toLocaleDateString()})`,
                send_to: campaign.segment_id && campaign.segment_id !== "all"
                  ? { segment_ids: [campaign.segment_id] }
                  : { all: true },
                email_config: {
                  subject: `${campaign.email_label}: ${campaign.listing_name}`,
                  html_content: html,
                },
              }),
            });

            if (createRes.ok) {
              const sendData = await createRes.json();
              sgId = sendData.id;

              // Schedule it
              await fetch(
                `https://api.sendgrid.com/v3/marketing/singlesends/${sgId}/schedule`,
                {
                  method: "PUT",
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ send_at: nextDate }),
                }
              );
            }
          }

          // Compute next_send_date based on frequency
          const nextSend = computeNextSendDate(nextDate, campaign.frequency);

          await supabase
            .from("email_campaigns")
            .update({
              scheduled_date: nextDate,
              sendgrid_single_send_id: sgId,
              next_send_date: nextSend,
              ai_reasoning: scheduleData.new_campaign_slot.reasoning,
              updated_at: new Date().toISOString(),
            })
            .eq("id", campaign.id);

          results.push({ id: campaign.id, action: `scheduled for ${nextDate}` });
        } else {
          results.push({ id: campaign.id, action: "scheduling failed" });
        }
      } catch (err) {
        console.error(`[Cron] Error scheduling campaign ${campaign.id}:`, err);
        results.push({ id: campaign.id, action: "error" });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}

/** Compute the next send date based on frequency */
function computeNextSendDate(currentDate: string, frequency: string): string {
  const d = new Date(currentDate);
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "bi-weekly":
      d.setDate(d.getDate() + 14);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      // one-time — no next send
      return currentDate;
  }
  return d.toISOString();
}
