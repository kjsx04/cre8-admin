/**
 * Email Scheduler — shared "ask the AI for a slot, save it, sync to Resend" flow.
 *
 * Used by: campaign create, campaign edit (drafts), resume, mark-sold announcement,
 * and the daily cron for recurring campaigns. Before this file existed the same
 * ~40 lines were copy-pasted in five routes, each with slightly different bugs.
 */

import { supabase } from "@/lib/flow/supabase";
import { syncCampaignToProvider, CampaignLike } from "./provider";
import { CalendarChange, Campaign } from "./types";
import { expandOccurrences } from "./occurrences";
import { getSettings } from "./settings-server";
import { EmailSettings, describeWindows, isAnnouncement, toMinutes } from "./settings";
import { observedSendTimes } from "./stats";
import { keyRangeToInstants, addDays, startOfWeekMonday, todayKey, PHOENIX_TZ } from "./schedule-dates";
import { getRankMap } from "./priorities";

/** "2026-09-09 09:00 (Wed) MST" — the AI reasons in Phoenix time, so never hand it UTC */
export function phoenixLabel(d: Date): string {
  const date = d.toLocaleDateString("en-CA", { timeZone: PHOENIX_TZ }); // YYYY-MM-DD
  const time = d.toLocaleTimeString("en-US", { timeZone: PHOENIX_TZ, hour12: false, hour: "2-digit", minute: "2-digit" });
  const wd = d.toLocaleDateString("en-US", { timeZone: PHOENIX_TZ, weekday: "short" });
  return `${date} ${time} (${wd}) MST`;
}

// How far ahead the AI can "see" projected recurring sends when placing a new campaign
const LOOKAHEAD_DAYS = 56;

/** The rules block shared by the placement prompt and the optimizer prompt */
export function rulesText(s: EmailSettings): string {
  return [
    `- Business days only (Mon–Fri, Phoenix time). Never same-day: at least 24 hours out.`,
    `- Maximum ${s.maxSendsPerDay} sends per day. Minimum ${s.minGapMinutes} minutes between any two sends on the same day.`,
    describeWindows(s),
    `- LISTING SPACING: a listing gets at most one send per ${s.spacingDays} days — EXCEPT announcements (${s.announcementLabels.join(", ")}), which always go out at the best available slot; the listing's recurring send skips that window instead.`,
    `- LISTING RANK (1 = most important) decides who gets the BEST windows: rank 1 first, then 2, and so on. Ranks 1–3 may bump lower-ranked sends out of a best window. Unranked = bottom.`,
    `- Tie-breaker within the same rank: Just Listed, then Just Sold, then everything else.`,
    `- Never move a send that is within 2 hours of going out. Never move a PROJECTED send (not created yet) — it just occupies its slot.`,
    `- Recurring campaigns keep a consistent weekday and time when possible.`,
    `- Fill the best windows as full as the cap allows before using good/ok windows; spread across Tue–Thu rather than clustering.`,
  ].join("\n");
}

/**
 * Every send on the calendar from today through the lookahead window — including
 * projected future occurrences of recurring campaigns — shaped for the AI prompt.
 * Projected sends are flagged so the AI treats them as occupied but immovable.
 */
async function calendarContext(excludeId?: string | null, days = LOOKAHEAD_DAYS) {
  const { data: rows } = await supabase
    .from("email_campaigns")
    .select("*")
    .in("status", ["scheduled", "active"]);

  const list = ((rows || []) as Campaign[]).filter((c) => !excludeId || c.id !== excludeId);
  const start = new Date();
  const end = new Date(start.getTime() + days * 86_400_000);
  const items = expandOccurrences(list, start, end);
  const ranks = await getRankMap();
  const rankTotal = ranks.size;

  return items
    .filter((it) => it.state !== "sent")
    .map((it) => ({
      id: it.campaign.id,
      listing_name: it.campaign.listing_name,
      email_label: it.campaign.email_label,
      scheduled_date: phoenixLabel(it.date),
      status: it.campaign.status,
      campaign_type: it.campaign.campaign_type,
      frequency: it.campaign.frequency,
      priority: it.campaign.priority || "normal",
      rank: ranks.get(it.campaign.listing_id) ?? null,
      rank_total: rankTotal,
      projected: it.state === "projected" && it.date.getTime() !== new Date(it.campaign.scheduled_date || 0).getTime(),
    }));
}

/** Convert the AI's date + time (MST) into an ISO timestamp with Arizona offset */
export function slotToIso(date: string, time: string): string {
  return `${date}T${time}:00-07:00`;
}

export type AiSlot = {
  scheduledDate: string; // ISO with -07:00
  reasoning: string;
  calendarChanges: CalendarChange[];
};

/**
 * Ask /api/email/schedule for the best send slot for this campaign.
 * Passes every other scheduled/active campaign so the AI can see the calendar.
 *
 * @param baseUrl   Origin of the current request (e.g. https://admin.cre8advisors.com)
 * @param campaign  The campaign row being scheduled
 * @param targetDate  Optional ISO date the slot should land near (recurring next occurrence)
 */
export async function requestAiSlot(
  baseUrl: string,
  campaign: CampaignLike,
  targetDate?: string | null
): Promise<AiSlot | null> {
  // The whole calendar ahead, projected recurring sends included
  const existing = await calendarContext(campaign.id as string);
  const ranks = await getRankMap();
  const settings = await getSettings();
  const observed = await observedSendTimes();

  const res = await fetch(`${baseUrl}/api/email/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaign_id: campaign.id,
      email_label: campaign.email_label,
      campaign_type: campaign.campaign_type,
      listing_name: campaign.listing_name,
      frequency: campaign.frequency,
      priority: campaign.priority || "normal",
      rank: ranks.get(campaign.listing_id as string) ?? null,
      rank_total: ranks.size,
      is_announcement: isAnnouncement(campaign.email_label as string, settings),
      target_date: targetDate ? phoenixLabel(new Date(targetDate)) : null,
      rules: rulesText(settings) + (observed ? `\n${observed}` : ""),
      existing_campaigns: existing || [],
    }),
  });

  if (!res.ok) {
    console.error("[Scheduler] AI slot request failed:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  if (!data?.new_campaign_slot?.date || !data?.new_campaign_slot?.time) return null;

  return {
    scheduledDate: slotToIso(data.new_campaign_slot.date, data.new_campaign_slot.time),
    reasoning: data.new_campaign_slot.reasoning || "",
    calendarChanges: Array.isArray(data.calendar_changes) ? data.calendar_changes : [],
  };
}

/**
 * Save a send time on a campaign, then push it to Resend.
 * Sets status (scheduled for one-time, active for recurring) and keeps
 * next_send_date == scheduled_date for recurring campaigns.
 * Returns the refreshed row plus the provider sync result.
 */
export async function applySlotAndSync(
  campaignId: string,
  scheduledDate: string,
  reasoning: string
): Promise<{ campaign: CampaignLike | null; sync: Awaited<ReturnType<typeof syncCampaignToProvider>> | null }> {
  // Load current row so we know the type
  const { data: current } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (!current) return { campaign: null, sync: null };

  const isRecurring = current.campaign_type === "recurring";
  const fields: Record<string, unknown> = {
    scheduled_date: scheduledDate,
    ai_reasoning: reasoning,
    status: isRecurring ? "active" : "scheduled",
    updated_at: new Date().toISOString(),
  };
  if (isRecurring) fields.next_send_date = scheduledDate;

  const { data: updated } = await supabase
    .from("email_campaigns")
    .update(fields)
    .eq("id", campaignId)
    .select()
    .single();

  if (!updated) return { campaign: null, sync: null };

  // Push to Resend and store the broadcast id
  const sync = await syncCampaignToProvider(updated);
  if (sync.provider_send_id !== updated.provider_send_id) {
    await supabase
      .from("email_campaigns")
      .update({ provider_send_id: sync.provider_send_id })
      .eq("id", campaignId);
    updated.provider_send_id = sync.provider_send_id;
  }
  await recordSend(campaignId, sync.provider_send_id, scheduledDate);

  return { campaign: updated, sync };
}

/** Remember which Resend broadcast belongs to which campaign (tracking events arrive by broadcast id) */
export async function recordSend(campaignId: string, broadcastId: string | null, scheduledAt: string | null): Promise<void> {
  if (!broadcastId) return;
  await supabase
    .from("email_sends")
    .upsert({ broadcast_id: broadcastId, campaign_id: campaignId, scheduled_at: scheduledAt }, { onConflict: "broadcast_id" });
}

/**
 * Listing spacing: after an announcement is placed, push the same listing's other
 * (non-announcement) sends that fall within the spacing window out by one window,
 * so a Just Sold on Thursday doesn't sit next to the weekly on Tuesday.
 */
export async function enforceListingSpacing(campaign: CampaignLike): Promise<string[]> {
  const settings = await getSettings();
  if (!settings.spacingDays || !isAnnouncement(campaign.email_label as string, settings)) return [];
  const at = new Date(campaign.scheduled_date as string);
  if (isNaN(at.getTime())) return [];
  const windowMs = settings.spacingDays * 86_400_000;

  const { data: siblings } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("listing_id", campaign.listing_id as string)
    .neq("id", campaign.id as string)
    .in("status", ["scheduled", "active"]);

  const bumped: string[] = [];
  for (const sib of (siblings || []) as Campaign[]) {
    if (isAnnouncement(sib.email_label, settings) || !sib.scheduled_date) continue;
    const sibAt = new Date(sib.scheduled_date);
    if (Math.abs(sibAt.getTime() - at.getTime()) >= windowMs) continue;
    if (sibAt.getTime() < Date.now() + 2 * 3_600_000) continue; // too close to send to touch
    const pushed = new Date(sibAt.getTime() + windowMs).toISOString();
    try {
      await applySlotAndSync(sib.id, pushed, `Pushed a week: "${campaign.email_label}" announcement went out for this listing`);
      bumped.push(sib.id);
    } catch (err) {
      console.error("[spacing] failed to push sibling", sib.id, err);
    }
  }
  return bumped;
}

/**
 * Apply the AI's "shift these other campaigns" list.
 * Each shifted campaign gets its new time saved and its Resend broadcast rescheduled.
 */
export async function applyCalendarChanges(changes: CalendarChange[]): Promise<void> {
  for (const change of changes) {
    if (!change?.id || !change.new_date || !change.new_time) continue;
    try {
      await applySlotAndSync(
        change.id,
        slotToIso(change.new_date, change.new_time),
        `Shifted: ${change.reason || "to make room for a higher-priority campaign"}`
      );
    } catch (err) {
      console.error(`[Scheduler] Failed to shift campaign ${change.id}:`, err);
    }
  }
}

/**
 * Full flow for a campaign that needs a (new) send time:
 * AI slot → save → sync to Resend → apply any calendar shifts.
 * Returns the refreshed campaign row (or null if scheduling failed).
 */
export async function scheduleCampaign(
  baseUrl: string,
  campaign: CampaignLike,
  targetDate?: string | null
): Promise<{ campaign: CampaignLike | null; sync: Awaited<ReturnType<typeof syncCampaignToProvider>> | null }> {
  const slot = await requestAiSlot(baseUrl, campaign, targetDate);
  if (!slot) return { campaign: null, sync: null };

  const result = await applySlotAndSync(campaign.id as string, slot.scheduledDate, slot.reasoning);

  if (slot.calendarChanges.length > 0) {
    await applyCalendarChanges(slot.calendarChanges);
  }
  if (result.campaign) {
    await enforceListingSpacing(result.campaign);
  }

  return result;
}

/** Next occurrence date for a recurring campaign */
export function computeNextSendDate(currentDate: string, frequency: string | null): string {
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
      return currentDate; // one-time — no next send
  }
  return d.toISOString();
}

/**
 * Rebalance one week: hand the AI every send in that week (stored sends are movable,
 * projected future occurrences are fixed context) and apply whatever it moves.
 * Used by the planner's "Re-optimize week" button and by the nightly cron.
 */
export async function optimizeWeek(
  baseUrl: string,
  weekStartKey: string
): Promise<{ week_start: string; considered: number; moved: { id: string; from: string; to: string; reason: string }[]; errors: string[] }> {
  const monday = startOfWeekMonday(weekStartKey);
  const { start, end } = keyRangeToInstants(monday, addDays(monday, 6));

  const { data: rows } = await supabase
    .from("email_campaigns")
    .select("*")
    .in("status", ["scheduled", "active"]);

  const campaigns = (rows || []) as Campaign[];
  const items = expandOccurrences(campaigns, start, end).filter((it) => it.state !== "sent");
  const ranks = await getRankMap();
  const settings = await getSettings();
  const observed = await observedSendTimes();

  const payload = items.map((it) => {
    // Only the stored (next) send can actually be moved; projected ones don't exist yet
    const stored = new Date(it.campaign.scheduled_date || 0).getTime();
    const movable = it.date.getTime() === stored && it.date.getTime() > Date.now() + 2 * 3_600_000;
    return {
      id: it.campaign.id,
      listing_name: it.campaign.listing_name,
      email_label: it.campaign.email_label,
      scheduled_date: phoenixLabel(it.date),
      campaign_type: it.campaign.campaign_type,
      priority: it.campaign.priority || "normal",
      rank: ranks.get(it.campaign.listing_id) ?? null,
      rank_total: ranks.size,
      listing_id: it.campaign.listing_id,
      is_announcement: isAnnouncement(it.campaign.email_label, settings),
      movable,
    };
  });

  const result = { week_start: monday, considered: payload.length, moved: [] as { id: string; from: string; to: string; reason: string }[], errors: [] as string[] };
  if (payload.length === 0) return result;

  // Working copy of every send's instant, updated as moves are accepted
  const times = new Map<string, Date>(items.map((it) => [it.campaign.id, it.date]));
  const movableIds = new Set(payload.filter((p) => p.movable).map((p) => p.id));
  const finalMoves = new Map<string, { newIso: string; reason: string }>();

  // The AI is asked up to 3 times; after each answer we check the rules ourselves and
  // hand any leftover violations back to it. Nothing is written until the loop ends.
  let notes: string | null = null;
  for (let round = 0; round < 3; round++) {
    const body = {
      week_start: monday,
      items: payload.map((p) => ({ ...p, scheduled_date: phoenixLabel(times.get(p.id)!) })),
      rules: rulesText(settings) + (observed ? `\n${observed}` : ""),
      notes,
    };
    const res = await fetch(`${baseUrl}/api/email/schedule/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      result.errors.push(`optimizer ${res.status}: ${await res.text()}`);
      break;
    }
    const { moves } = (await res.json()) as { moves: { id: string; new_date: string; new_time: string; reason: string }[] };

    for (const mv of moves || []) {
      if (!movableIds.has(mv.id)) continue; // AI tried to move something fixed — ignore
      const newIso = slotToIso(mv.new_date, mv.new_time);
      const at = new Date(newIso);
      if (isNaN(at.getTime()) || at.getTime() <= Date.now() + 2 * 3_600_000) continue; // never into the past / next 2h
      times.set(mv.id, at);
      finalMoves.set(mv.id, { newIso, reason: mv.reason || "" });
    }

    const violations = findViolations(
      payload.map((p) => ({ id: p.id, name: `${p.email_label}: ${p.listing_name}`, at: times.get(p.id)!, listingId: p.listing_id, announcement: p.is_announcement })),
      settings
    );
    if (violations.length === 0) break;
    notes = violations.join("\n");
    if (round === 2) result.errors.push(`still over the rules after 3 rounds: ${violations.length} issue(s)`);
  }

  // Apply only moves that actually changed the instant
  for (const [id, mv] of Array.from(finalMoves.entries())) {
    const before = campaigns.find((c) => c.id === id)?.scheduled_date || "";
    if (before && Math.abs(new Date(before).getTime() - new Date(mv.newIso).getTime()) < 60_000) continue;
    try {
      const applied = await applySlotAndSync(id, mv.newIso, `Rebalanced: ${mv.reason || "week over capacity"}`);
      if (applied.campaign) result.moved.push({ id, from: before, to: mv.newIso, reason: mv.reason });
      else result.errors.push(`${id}: not found`);
    } catch (err) {
      result.errors.push(`${id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return result;
}

/**
 * Deterministic rule check against the settings: per-day cap, minimum gap, weekends,
 * no-send dates, allowed windows, and listing spacing (announcements exempt).
 * Returns human-readable lines for the AI's next attempt.
 */
export function findViolations(
  sends: { id: string; name: string; at: Date; listingId?: string; announcement?: boolean }[],
  s: EmailSettings
): string[] {
  const out: string[] = [];
  const byDay = new Map<string, typeof sends>();
  const noSend = new Set(s.noSendDates);

  const inWindow = (at: Date) => {
    const dow = new Date(at.toLocaleString("en-US", { timeZone: PHOENIX_TZ })).getDay();
    const hh = Number(at.toLocaleTimeString("en-US", { timeZone: PHOENIX_TZ, hour12: false, hour: "2-digit" })) % 24;
    const mm = Number(at.toLocaleTimeString("en-US", { timeZone: PHOENIX_TZ, minute: "2-digit" }));
    const mins = hh * 60 + mm;
    return s.windows.some((w) => w.days.includes(dow) && mins >= toMinutes(w.start) && mins < toMinutes(w.end));
  };

  for (const x of sends) {
    const key = x.at.toLocaleDateString("en-CA", { timeZone: PHOENIX_TZ });
    const list = byDay.get(key) || [];
    list.push(x);
    byDay.set(key, list);
    const wd = x.at.toLocaleDateString("en-US", { timeZone: PHOENIX_TZ, weekday: "short" });
    if (wd === "Sat" || wd === "Sun") out.push(`"${x.name}" (${x.id}) is on a weekend (${phoenixLabel(x.at)})`);
    else if (noSend.has(key)) out.push(`"${x.name}" (${x.id}) is on a no-send date ${key}`);
    else if (!inWindow(x.at)) out.push(`"${x.name}" (${x.id}) is outside the allowed send windows (${phoenixLabel(x.at)})`);
  }

  for (const [day, list] of Array.from(byDay.entries())) {
    if (list.length > s.maxSendsPerDay) out.push(`${day} has ${list.length} sends (max ${s.maxSendsPerDay}): ${list.map((l) => l.id).join(", ")}`);
    const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gapMin = (sorted[i].at.getTime() - sorted[i - 1].at.getTime()) / 60_000;
      if (gapMin < s.minGapMinutes) out.push(`${day}: "${sorted[i - 1].name}" (${sorted[i - 1].id}) and "${sorted[i].name}" (${sorted[i].id}) are ${Math.round(gapMin)} min apart (min ${s.minGapMinutes})`);
    }
  }

  // Listing spacing: non-announcement sends of the same listing must be ≥ spacingDays apart
  if (s.spacingDays > 0) {
    const byListing = new Map<string, typeof sends>();
    for (const x of sends) {
      if (!x.listingId || x.announcement) continue;
      const list = byListing.get(x.listingId) || [];
      list.push(x);
      byListing.set(x.listingId, list);
    }
    for (const list of Array.from(byListing.values())) {
      const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
      for (let i = 1; i < sorted.length; i++) {
        const days = (sorted[i].at.getTime() - sorted[i - 1].at.getTime()) / 86_400_000;
        if (days < s.spacingDays) out.push(`Same listing twice within ${s.spacingDays} days: "${sorted[i - 1].name}" (${sorted[i - 1].id}) and "${sorted[i].name}" (${sorted[i].id})`);
      }
    }
  }
  return out;
}

/** Monday of the current Phoenix week — handy for the cron */
export function currentWeekStart(): string {
  return startOfWeekMonday(todayKey());
}
