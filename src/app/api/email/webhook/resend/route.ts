import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/flow/supabase";

/**
 * POST /api/email/webhook/resend — Resend event webhook.
 *
 * Resend signs webhooks the Svix way: headers svix-id, svix-timestamp, svix-signature,
 * secret "whsec_<base64>". Signed content is `${id}.${timestamp}.${rawBody}`.
 * Set RESEND_WEBHOOK_SECRET in .env.local + Vercel. Without it, events are
 * rejected in production (accepted in dev so local testing works).
 *
 * Each event is stored in email_events and attributed to a campaign through
 * email_sends (broadcast id → campaign id).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (secret) {
    const id = request.headers.get("svix-id") || "";
    const ts = request.headers.get("svix-timestamp") || "";
    const sigHeader = request.headers.get("svix-signature") || "";
    if (!id || !ts || !sigHeader) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

    // Reject stale timestamps (5 min)
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return NextResponse.json({ error: "Stale" }, { status: 400 });

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
    const ok = sigHeader.split(" ").some((part) => {
      const [, sig] = part.split(",");
      if (!sig) return false;
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  let event: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = event.type || "";
  const data = event.data || {};
  const broadcastId = (data.broadcast_id as string) || null;
  const emailId = (data.email_id as string) || null;
  const occurredAt = event.created_at || new Date().toISOString();

  // Map the broadcast to a campaign
  let campaignId: string | null = null;
  if (broadcastId) {
    const { data: send } = await supabase.from("email_sends").select("campaign_id").eq("broadcast_id", broadcastId).maybeSingle();
    campaignId = send?.campaign_id || null;
  }

  await supabase.from("email_events").insert({
    event_type: type,
    broadcast_id: broadcastId,
    campaign_id: campaignId,
    email_id: emailId,
    occurred_at: occurredAt,
    payload: { ...data, to: undefined }, // don't store recipient addresses
  });

  return NextResponse.json({ ok: true });
}
