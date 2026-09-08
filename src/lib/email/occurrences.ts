/**
 * Occurrence projection for the schedule views.
 *
 * A recurring campaign row only stores its NEXT send (the cron creates each
 * following one after the previous goes out). To show a real schedule we
 * project future occurrences on the client from frequency + end date. Those
 * are "projected": the AI may pick a slightly different slot when the cron
 * actually schedules them, which is why the UI draws them dashed.
 *
 * Client-safe: no Supabase, no React.
 */

import { Campaign, CampaignFrequency } from "./types";
import { DateKey, phoenixDateKey, phoenixParts, formatPhoenixTime, PHOENIX_OFFSET } from "./schedule-dates";

export type ScheduleState = "confirmed" | "projected" | "sent";

export interface ScheduleItem {
  key: string;                    // `${campaign.id}:${dateKey}` — stable React key
  campaign: Campaign;
  date: Date;                     // the instant of this send
  dateKey: DateKey;               // Phoenix day bucket
  time: string;                   // "8:30 AM" (Phoenix)
  state: ScheduleState;
  isRecurring: boolean;
  frequency: CampaignFrequency | null;
}

export const MAX_OCCURRENCES = 200;     // per expandOccurrences call
const MAX_STEPS_PER_CAMPAIGN = 600;     // loop guard for stale anchors

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * One cadence step forward, keeping the Phoenix wall-clock time.
 * weekly +7d, bi-weekly +14d, monthly = same day next month (clamped to month end,
 * so Jan 31 → Feb 28 → Mar 28). The server's version can overflow (Jan 31 → Mar 3);
 * this is one reason projections are approximate.
 */
export function stepDate(date: Date, frequency: CampaignFrequency | null): Date | null {
  switch (frequency) {
    case "weekly":
      return new Date(date.getTime() + 7 * 86_400_000);
    case "bi-weekly":
      return new Date(date.getTime() + 14 * 86_400_000);
    case "monthly": {
      const { y, m, d, hh, mm, ss } = phoenixParts(date);
      const ty = m === 12 ? y + 1 : y;
      const tm = m === 12 ? 1 : m + 1;
      const daysIn = new Date(Date.UTC(ty, tm, 0)).getUTCDate(); // day 0 of next month = last day of target
      const td = Math.min(d, daysIn);
      return new Date(`${ty}-${pad(tm)}-${pad(td)}T${pad(hh)}:${pad(mm)}:${pad(ss)}${PHOENIX_OFFSET}`);
    }
    default:
      return null;
  }
}

function makeItem(campaign: Campaign, date: Date, state: ScheduleState): ScheduleItem {
  const dateKey = phoenixDateKey(date);
  const isRecurring = campaign.campaign_type === "recurring";
  return {
    key: `${campaign.id}:${dateKey}`,
    campaign,
    date,
    dateKey,
    time: formatPhoenixTime(date),
    state,
    isRecurring,
    frequency: isRecurring ? campaign.frequency : null,
  };
}

/** Expand every campaign into dated sends inside [rangeStart, rangeEnd) */
export function expandOccurrences(campaigns: Campaign[], rangeStart: Date, rangeEnd: Date): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const inRange = (d: Date) => d >= rangeStart && d < rangeEnd;

  for (const c of campaigns) {
    if (items.length >= MAX_OCCURRENCES) break;
    if (c.status === "draft" || c.status === "paused" || c.status === "cancelled") continue;

    const iso = c.scheduled_date || c.next_send_date;
    if (!iso) continue;
    const first = new Date(iso);
    if (isNaN(first.getTime())) continue;

    const isRecurring = c.campaign_type === "recurring";
    const freq = isRecurring ? c.frequency : null;

    // Finished campaigns: the stored date is the last send
    if (c.status === "completed") {
      if (inRange(first)) items.push(makeItem(c, first, "sent"));
      continue;
    }

    // scheduled / active
    if (c.last_sent_at) {
      const last = new Date(c.last_sent_at);
      if (!isNaN(last.getTime()) && inRange(last) && phoenixDateKey(last) !== phoenixDateKey(first)) {
        items.push(makeItem(c, last, "sent"));
      }
    }

    if (inRange(first)) {
      items.push(makeItem(c, first, c.provider_send_id ? "confirmed" : "projected"));
    }

    if (isRecurring && freq && freq !== "one-time") {
      const endDate = c.end_date ? new Date(c.end_date) : null;
      let cur: Date | null = first;
      let steps = 0;
      while (steps < MAX_STEPS_PER_CAMPAIGN && items.length < MAX_OCCURRENCES) {
        cur = stepDate(cur, freq);
        steps++;
        if (!cur || cur >= rangeEnd) break;
        if (endDate && cur > endDate) break;
        if (cur >= rangeStart) items.push(makeItem(c, cur, "projected"));
      }
    }
  }

  items.sort((a, b) => {
    const dt = a.date.getTime() - b.date.getTime();
    if (dt !== 0) return dt;
    const pa = a.campaign.priority === "high" ? 0 : 1;
    const pb = b.campaign.priority === "high" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a.campaign.listing_name || "").localeCompare(b.campaign.listing_name || "");
  });

  return items;
}

/** Bucket sorted items by Phoenix day (insertion order preserves time order) */
export function groupByDay(items: ScheduleItem[]): Map<DateKey, ScheduleItem[]> {
  const map = new Map<DateKey, ScheduleItem[]>();
  for (const it of items) {
    const list = map.get(it.dateKey);
    if (list) list.push(it);
    else map.set(it.dateKey, [it]);
  }
  return map;
}
