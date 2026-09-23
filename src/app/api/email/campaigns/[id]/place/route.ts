import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { scheduleCampaign, applySlotAndSync } from "@/lib/email/scheduler";
import { placeForCampaign, normalizePriority } from "@/lib/email/priorities";
import { endDateProblem } from "@/lib/email/validate-schedule";
import {
  placementProblem,
  testSendIso,
  isTestMode,
  diffSlots,
  type SlotSnapshot,
} from "@/lib/email/place";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // the AI slot call plus a rebalance pass

/** Every scheduled/active slot right now — the snapshot we can undo back to */
async function currentSlots(): Promise<SlotSnapshot[]> {
  const { data } = await supabase
    .from("email_campaigns")
    .select("id, scheduled_date, next_send_date, status, provider_send_id")
    .in("status", ["scheduled", "active"]);
  return (data || []) as SlotSnapshot[];
}

/**
 * POST /api/email/campaigns/[id]/place — put a saved draft on the calendar.
 *
 * Body: { campaign_type, frequency, end_date, pinned, priority, priority_rank,
 *         send_date, send_time }
 *
 * Top / Fit / Custom hand the slot choice to the AI (same path the composer used
 * to run invisibly). Test skips the AI entirely and uses the exact time given —
 * no windows, no daily cap, no listing spacing. Test is a temporary tool.
 *
 * Returns the placed campaign, the slot it landed on, every other send that moved,
 * and an undo token holding the previous slots.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));

  const problem = placementProblem(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const test = isTestMode(body.priority);

  // A real placement must leave room for at least one send. Test ignores this.
  if (!test) {
    const endProblem = endDateProblem(body.end_date);
    if (endProblem) return NextResponse.json({ error: endProblem }, { status: 400 });
  }

  // Frequency / end date / pin / priority are chosen on the calendar now
  const updates: Record<string, unknown> = {
    campaign_type: body.campaign_type === "recurring" ? "recurring" : "one-time",
    frequency: body.campaign_type === "recurring" ? body.frequency || "weekly" : "one-time",
    end_date: test ? null : body.end_date || null,
    pinned: !!body.pinned,
    updated_at: new Date().toISOString(),
  };
  // Test isn't a real priority — keep the row's priority as a plain "fit"
  Object.assign(updates, normalizePriority(test ? { priority: "normal" } : body));

  const { data: prepared, error: updErr } = await supabase
    .from("email_campaigns")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();
  if (updErr || !prepared) {
    return NextResponse.json({ error: updErr?.message || "Could not save the schedule settings" }, { status: 500 });
  }

  const before = await currentSlots();

  try {
    let placed;

    if (test) {
      // Exact time, no AI, no rules
      const iso = testSendIso(body.send_date, body.send_time)!;
      const result = await applySlotAndSync(params.id, iso, "Test send — time chosen manually");
      if (!result.campaign) throw new Error("Could not set the test send time");
      placed = result.campaign;
    } else {
      // Rank first (Top → #1, Custom → its number, Fit → bottom), then let the AI place it
      await placeForCampaign(prepared).catch((err) => {
        console.error("[place] rank placement failed:", err);
      });
      const result = await scheduleCampaign(new URL(request.url).origin, prepared);
      if (!result.campaign) throw new Error("The AI couldn't find a slot. Try again or use Test.");
      placed = result.campaign;
    }

    const after = await currentSlots();
    const moves = diffSlots(before, after, params.id);

    return NextResponse.json({
      campaign: placed,
      placed_at: (placed as { scheduled_date?: string }).scheduled_date || null,
      moves,
      undo_token: before,
      test,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Placement failed" },
      { status: 500 }
    );
  }
}
