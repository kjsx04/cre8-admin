import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { cancelSend, sendNow, isProviderConfigured } from "@/lib/email/provider";
import { recordSend, computeNextSendDate } from "@/lib/email/scheduler";

/**
 * POST /api/email/campaigns/[id]/send-now — send immediately, skipping the AI.
 *
 * - Cancels any pending broadcast, creates a new one with send: true (Resend
 *   delivers within a couple of minutes).
 * - One-time → completed. Recurring → stays active, cadence restarts from now
 *   (next_send_date = now + frequency; the nightly cron schedules it near there).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!["draft", "scheduled", "active"].includes(campaign.status)) {
    return NextResponse.json({ error: "Only draft, scheduled or active campaigns can be sent now" }, { status: 400 });
  }
  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "Email provider isn't configured" }, { status: 500 });
  }

  try {
    await cancelSend(campaign.provider_send_id);
    const broadcastId = await sendNow(campaign);
    const now = new Date().toISOString();

    const isRecurring = campaign.campaign_type === "recurring";
    const nextSend = isRecurring ? computeNextSendDate(now, campaign.frequency) : null;

    const { data: updated, error: updErr } = await supabase
      .from("email_campaigns")
      .update({
        status: isRecurring ? "active" : "completed",
        scheduled_date: now,
        last_sent_at: now,
        // Recurring: the pending id is cleared (it just went out); cron creates the next near next_send_date
        provider_send_id: isRecurring ? null : broadcastId,
        next_send_date: isRecurring ? nextSend : campaign.next_send_date,
        ai_reasoning: `Sent now by ${auth.email}`,
        updated_at: now,
      })
      .eq("id", params.id)
      .select()
      .single();
    if (updErr || !updated) throw updErr || new Error("Update failed");

    await recordSend(params.id, broadcastId, now);

    return NextResponse.json({ ...updated, highlights: updated.highlights || [], sent_broadcast_id: broadcastId });
  } catch (err) {
    console.error("[send-now] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 500 });
  }
}
