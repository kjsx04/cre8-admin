/**
 * Delivery stats from Resend webhook events (email_events) — server-only.
 *
 *   campaignStats(id)     → sends / delivered / opened / clicked / bounced / unsubscribed
 *   observedSendTimes()   → a short table of open rates by weekday × hour over the
 *                           last 90 days, in Phoenix time, for the scheduler prompt.
 *                           Returns "" until there's enough data to be meaningful.
 */

import { supabase } from "@/lib/flow/supabase";
import { PHOENIX_TZ } from "./schedule-dates";

export interface CampaignStats {
  sends: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

export async function campaignStats(campaignId: string): Promise<CampaignStats> {
  const { data: sends } = await supabase.from("email_sends").select("broadcast_id").eq("campaign_id", campaignId);
  const { data: events } = await supabase
    .from("email_events")
    .select("event_type, email_id")
    .eq("campaign_id", campaignId);

  // Count unique recipients (email_id) per event type
  const uniq = (type: string) => new Set((events || []).filter((e) => e.event_type === type).map((e) => e.email_id || Math.random())).size;
  return {
    sends: (sends || []).length,
    delivered: uniq("email.delivered"),
    opened: uniq("email.opened"),
    clicked: uniq("email.clicked"),
    bounced: uniq("email.bounced"),
    unsubscribed: uniq("email.unsubscribed") || uniq("contact.unsubscribed"),
  };
}

const MIN_DELIVERED_FOR_INSIGHT = 200; // don't steer the AI on noise

/**
 * Open rate by Phoenix weekday+hour for sends in the last 90 days.
 * Attribution is by the send's scheduled slot (when it went out), not when it was opened.
 */
export async function observedSendTimes(): Promise<string> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: sends } = await supabase
    .from("email_sends")
    .select("broadcast_id, scheduled_at")
    .gte("scheduled_at", since);
  if (!sends || sends.length === 0) return "";

  const slotOf = new Map<string, string>(); // broadcast → "Tue 09"
  for (const s of sends) {
    if (!s.scheduled_at) continue;
    const d = new Date(s.scheduled_at);
    const wd = d.toLocaleDateString("en-US", { timeZone: PHOENIX_TZ, weekday: "short" });
    const hh = d.toLocaleTimeString("en-US", { timeZone: PHOENIX_TZ, hour12: false, hour: "2-digit" }).slice(0, 2);
    slotOf.set(s.broadcast_id, `${wd} ${hh}:00`);
  }

  const { data: events } = await supabase
    .from("email_events")
    .select("event_type, broadcast_id, email_id")
    .in("event_type", ["email.delivered", "email.opened", "email.clicked"])
    .gte("occurred_at", since);
  if (!events || events.length === 0) return "";

  type Agg = { delivered: Set<string>; opened: Set<string>; clicked: Set<string> };
  const bySlot = new Map<string, Agg>();
  let totalDelivered = 0;
  for (const e of events) {
    const slot = e.broadcast_id ? slotOf.get(e.broadcast_id) : undefined;
    if (!slot) continue;
    const agg = bySlot.get(slot) || { delivered: new Set(), opened: new Set(), clicked: new Set() };
    const key = e.email_id || `${e.broadcast_id}:${Math.random()}`;
    if (e.event_type === "email.delivered") { agg.delivered.add(key); totalDelivered++; }
    if (e.event_type === "email.opened") agg.opened.add(key);
    if (e.event_type === "email.clicked") agg.clicked.add(key);
    bySlot.set(slot, agg);
  }
  if (totalDelivered < MIN_DELIVERED_FOR_INSIGHT) return "";

  const rows = Array.from(bySlot.entries())
    .filter(([, a]) => a.delivered.size >= 30)
    .map(([slot, a]) => ({
      slot,
      delivered: a.delivered.size,
      open: Math.round((a.opened.size / a.delivered.size) * 100),
      click: Math.round((a.clicked.size / a.delivered.size) * 100),
    }))
    .sort((a, b) => b.open - a.open);
  if (rows.length === 0) return "";

  const best = rows.slice(0, 6).map((r) => `${r.slot} → ${r.open}% open, ${r.click}% click (${r.delivered} delivered)`);
  const worst = rows.slice(-3).map((r) => `${r.slot} → ${r.open}% open`);
  return [
    `- OBSERVED RESULTS (last 90 days, Phoenix time). Prefer slots that actually get opened — this outranks the default windows above when they disagree:`,
    `  Best: ${best.join(" | ")}`,
    `  Worst: ${worst.join(" | ")}`,
  ].join("\n");
}
