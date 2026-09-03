/**
 * Email Scheduler — shared "ask the AI for a slot, save it, sync to Resend" flow.
 *
 * Used by: campaign create, campaign edit (drafts), resume, mark-sold announcement,
 * and the daily cron for recurring campaigns. Before this file existed the same
 * ~40 lines were copy-pasted in five routes, each with slightly different bugs.
 */

import { supabase } from "@/lib/flow/supabase";
import { syncCampaignToProvider, CampaignLike } from "./provider";
import { CalendarChange } from "./types";

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
  const { data: existing } = await supabase
    .from("email_campaigns")
    .select("id, listing_name, email_label, scheduled_date, status, campaign_type, frequency")
    .in("status", ["scheduled", "active"])
    .neq("id", campaign.id as string);

  const res = await fetch(`${baseUrl}/api/email/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaign_id: campaign.id,
      email_label: campaign.email_label,
      campaign_type: campaign.campaign_type,
      listing_name: campaign.listing_name,
      frequency: campaign.frequency,
      target_date: targetDate || null,
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

  return { campaign: updated, sync };
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
