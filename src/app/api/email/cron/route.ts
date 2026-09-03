import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { getSendStatus, cancelSend } from "@/lib/email/provider";
import { scheduleCampaign, computeNextSendDate } from "@/lib/email/scheduler";

/**
 * GET /api/email/cron — Vercel Cron handler
 * Runs daily at 6 AM MST (1 PM UTC), see vercel.json.
 *
 * Keeps recurring campaigns going with no human involvement:
 *   - For each active recurring campaign whose send is within 7 days (or already past):
 *     - If its Resend broadcast is still pending → nothing to do, leave it
 *     - If it went out → record last_sent_at, clear the id, and schedule the next
 *       occurrence (AI picks the slot near last send + frequency, Resend gets a
 *       fresh broadcast rendered from the CURRENT campaign row)
 *     - If Resend lost it → recreate
 *   - Campaigns past their end_date are marked completed
 */
export async function GET(request: NextRequest) {
  // Verify cron auth — Vercel sends this header automatically when CRON_SECRET is set.
  // Fail closed: no secret configured means nobody can trigger this.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
    const baseUrl = new URL(request.url).origin;

    for (const campaign of campaigns || []) {
      try {
        // ── End date passed → complete the campaign, cancel anything still pending ──
        if (campaign.end_date && new Date(campaign.end_date) < now) {
          await cancelSend(campaign.provider_send_id);
          await supabase
            .from("email_campaigns")
            .update({ status: "completed", provider_send_id: null, updated_at: now.toISOString() })
            .eq("id", campaign.id);
          results.push({ id: campaign.id, action: "completed (end date passed)" });
          continue;
        }

        // ── Check the pending send at Resend ──
        let lastSentAt: string | null = campaign.last_sent_at || null;

        if (campaign.provider_send_id) {
          const st = await getSendStatus(campaign.provider_send_id);

          if (st.state === "pending") {
            results.push({ id: campaign.id, action: "skipped (send still pending)" });
            continue;
          }

          if (st.state === "unknown") {
            // Resend unreachable — don't guess, try again tomorrow
            results.push({ id: campaign.id, action: "skipped (provider status unknown)" });
            continue;
          }

          if (st.state === "sent") {
            lastSentAt = st.sentAt || campaign.scheduled_date || now.toISOString();
          }
          // "missing" falls through: the send is gone, so we create a new one below
        } else if (campaign.scheduled_date && new Date(campaign.scheduled_date) < now) {
          // No provider id but the send time passed (provider wasn't configured back then).
          // Treat it as sent so the cadence keeps moving.
          lastSentAt = campaign.scheduled_date;
        }

        // ── Figure out where the next occurrence should land ──
        // Anchor on the last send (or the pending slot if nothing has gone out yet)
        const anchor = lastSentAt || campaign.scheduled_date || now.toISOString();
        let target = lastSentAt ? computeNextSendDate(anchor, campaign.frequency) : anchor;
        // If the target already passed (cron missed days), move it forward until it's ahead
        let guard = 0;
        while (new Date(target) < now && guard < 12) {
          target = computeNextSendDate(target, campaign.frequency);
          guard++;
        }

        // Stop if the next occurrence would be after the end date
        if (campaign.end_date && new Date(target) > new Date(campaign.end_date)) {
          await supabase
            .from("email_campaigns")
            .update({
              status: "completed",
              provider_send_id: null,
              last_sent_at: lastSentAt,
              updated_at: now.toISOString(),
            })
            .eq("id", campaign.id);
          results.push({ id: campaign.id, action: "completed (no more sends before end date)" });
          continue;
        }

        // Clear the old id + record last send before scheduling the next one
        await supabase
          .from("email_campaigns")
          .update({ provider_send_id: null, last_sent_at: lastSentAt, updated_at: now.toISOString() })
          .eq("id", campaign.id);

        // ── AI slot near the target → save → push to Resend ──
        const { campaign: scheduled, sync } = await scheduleCampaign(
          baseUrl,
          { ...campaign, provider_send_id: null },
          target
        );

        if (!scheduled) {
          results.push({ id: campaign.id, action: "scheduling failed (will retry tomorrow)" });
          continue;
        }

        results.push({
          id: campaign.id,
          action: sync?.ok
            ? `scheduled for ${scheduled.scheduled_date} (${sync.action})`
            : `saved ${scheduled.scheduled_date} but provider sync failed: ${sync?.error || sync?.action}`,
        });
      } catch (err) {
        console.error(`[Cron] Error processing campaign ${campaign.id}:`, err);
        results.push({ id: campaign.id, action: "error" });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
