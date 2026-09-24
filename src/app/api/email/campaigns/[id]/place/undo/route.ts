import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { applySlotAndSync } from "@/lib/email/scheduler";
import { syncAndRecord } from "@/lib/email/scheduler";
import type { SlotSnapshot } from "@/lib/email/place";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/email/campaigns/[id]/place/undo — put everything back.
 *
 * Body: { undo_token: SlotSnapshot[] } — the slots as they were before placing.
 * The placed campaign returns to draft (its pending Resend send is cancelled) and
 * every campaign the AI moved goes back to the time it had.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const token = Array.isArray(body.undo_token) ? (body.undo_token as SlotSnapshot[]) : null;
  if (!token) return NextResponse.json({ error: "Nothing to undo" }, { status: 400 });

  const restored: string[] = [];
  const errors: string[] = [];

  // Put every campaign that moved back on its old slot
  for (const snap of token) {
    if (snap.id === params.id || !snap.scheduled_date) continue;
    try {
      const { data: now } = await supabase
        .from("email_campaigns")
        .select("scheduled_date")
        .eq("id", snap.id)
        .single();
      if (now?.scheduled_date === snap.scheduled_date) continue; // never moved
      await applySlotAndSync(snap.id, snap.scheduled_date, "Undo — put back where it was");
      restored.push(snap.id);
    } catch (err) {
      errors.push(`${snap.id}: ${err instanceof Error ? err.message : "restore failed"}`);
    }
  }

  // The placed campaign goes back to being an unscheduled draft
  try {
    const { data: campaign } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", params.id)
      .single();

    const wasPlaced = (token as SlotSnapshot[]).find((s) => s.id === params.id);
    const { data: reverted } = await supabase
      .from("email_campaigns")
      .update({
        status: wasPlaced?.status || "draft",
        scheduled_date: wasPlaced?.scheduled_date || null,
        next_send_date: wasPlaced?.next_send_date || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    // Cancels the pending send now that the row is a draft again, and clears the
    // stale id so nothing later thinks there's still a send out there
    let cleared = reverted;
    if (campaign) {
      const sync = await syncAndRecord(reverted || { ...campaign, status: "draft", scheduled_date: null });
      const { data: final } = await supabase
        .from("email_campaigns")
        .update({ provider_send_id: sync.provider_send_id })
        .eq("id", params.id)
        .select()
        .single();
      if (final) cleared = final;
    }

    return NextResponse.json({ ok: true, campaign: cleared, restored, errors });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Undo failed", restored, errors },
      { status: 500 }
    );
  }
}
