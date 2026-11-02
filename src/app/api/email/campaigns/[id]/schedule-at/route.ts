import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { applySlotAndSync } from "@/lib/email/scheduler";
import { testSendIso } from "@/lib/email/place";
import { isProviderConfigured } from "@/lib/email/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // pushing the broadcast to Resend

/**
 * POST /api/email/campaigns/[id]/schedule-at — book a custom email for an exact
 * date and time.
 *
 * Body: { send_date: "YYYY-MM-DD", send_time: "HH:MM" }  (Phoenix time)
 *
 * Listing campaigns go through the calendar instead, where the AI picks a slot
 * around listing priority and spacing. A custom email has no listing, so none of
 * those rules have anything to weigh — you say when, and it goes then.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "Email sending isn't configured (missing RESEND_API_KEY)" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));

  // testSendIso is just "date + time → Phoenix ISO" — nothing test-specific about it
  const iso = testSendIso(body.send_date, body.send_time);
  if (!iso) {
    return NextResponse.json({ error: "Pick a date and a time for the send." }, { status: 400 });
  }
  // A minute of slack so clicking Schedule on the current minute still works
  if (new Date(iso).getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "That time has already passed — pick a later one." }, { status: 400 });
  }

  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.campaign_kind !== "custom") {
    return NextResponse.json(
      { error: "Only custom emails are scheduled this way — listing campaigns are placed on the calendar." },
      { status: 400 }
    );
  }
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return NextResponse.json({ error: "This email has already gone out." }, { status: 400 });
  }
  if (!campaign.segment_id) {
    return NextResponse.json({ error: "Pick at least one audience list or contact" }, { status: 400 });
  }

  try {
    // Sets the status, stamps the template, pushes the broadcast to Resend and
    // records the send — the same path the calendar uses for an exact time.
    const { campaign: scheduled, sync } = await applySlotAndSync(
      params.id,
      iso,
      "Custom email — date and time chosen in the composer"
    );
    if (!scheduled) {
      return NextResponse.json({ error: "Couldn't save the send time" }, { status: 500 });
    }
    return NextResponse.json({ ...scheduled, scheduled_at: iso, provider_sync: sync });
  } catch (err) {
    console.error("[schedule-at] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scheduling failed" },
      { status: 500 }
    );
  }
}
