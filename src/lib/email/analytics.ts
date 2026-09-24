/**
 * Turning raw webhook events into numbers a person can act on.
 *
 * Pure: events in, summary out. No Supabase, no crypto, no React — so the whole
 * dashboard can be tested against a captured pile of real events.
 *
 * Every engagement number comes in two forms: `human` (what event-quality.ts
 * accepted) and `raw` (everything Resend reported). Both are returned on
 * purpose. The filter throws away roughly nine out of ten clicks on a cold
 * broker list, and a number that large has to stay auditable — the dashboard
 * shows the human figure and keeps the raw one one hover away.
 */

import { PHOENIX_TZ } from "./schedule-dates";
import { classifyAll, type RawEvent, type Verdict, type QualityReason } from "./event-quality";

/** A stored event, flattened to what the maths needs. */
export interface AnalyticsEvent extends RawEvent {
  campaign_id: string | null;
  /** Resend/SES wording from payload.bounce.type — "Permanent" is a dead address */
  bounce_type?: string | null;
}

/** Campaign metadata for the per-campaign table. Kept loose so the route can pass rows straight through. */
export interface AnalyticsCampaign {
  id: string;
  listing_name: string | null;
  email_label: string | null;
  status: string | null;
  campaign_type: string | null;
  campaign_kind: string | null;
  frequency: string | null;
  segment_id: string | null;
  created_at: string | null;
  last_sent_at: string | null;
}

export interface ReasonCount {
  reason: QualityReason;
  count: number;
}

export interface LinkStat {
  url: string;
  clicks: number;
  clickers: number;
}

export interface BucketCount {
  /** 0-23 for hours, 0-6 (Sunday first) for weekdays */
  bucket: number;
  count: number;
}

export interface Reach {
  emails: number;          // individual emails Resend accepted
  delivered: number;
  bounced: number;
  hardBounces: number;
  softBounces: number;
  deliveryRate: number;    // delivered / emails
  bounceRate: number;
}

export interface Engagement {
  opens: number;
  uniqueOpeners: number;
  openRate: number;        // uniqueOpeners / delivered
  clicks: number;
  uniqueClickers: number;
  clickRate: number;       // uniqueClickers / delivered
  clickToOpenRate: number; // uniqueClickers / uniqueOpeners
}

export interface Noise {
  filteredClicks: number;
  filteredOpens: number;
  /** share of ALL reported clicks thrown away */
  filteredClickShare: number;
  reasons: ReasonCount[];
}

export interface CampaignStat {
  id: string;
  name: string;
  label: string | null;
  status: string | null;
  type: string | null;       // one-time | recurring
  kind: string | null;       // single | group
  frequency: string | null;
  firstSendAt: string | null;
  lastSendAt: string | null;
  daysRunning: number;
  sends: number;             // distinct send occurrences
  reach: Reach;
  human: Engagement;
  raw: Engagement;
}

export interface AnalyticsSummary {
  generatedAt: string;
  /** null = every campaign combined */
  campaignId: string | null;
  campaignsWithData: number;
  sends: number;
  firstSendAt: string | null;
  lastSendAt: string | null;
  daysRunning: number;
  reach: Reach;
  human: Engagement;
  raw: Engagement;
  noise: Noise;
  unsubscribes: number;
  complaints: number;
  links: LinkStat[];
  clicksByHour: BucketCount[];
  clicksByWeekday: BucketCount[];
  sendsByWeekday: BucketCount[];
  perCampaign: CampaignStat[];
}

const rate = (num: number, den: number) => (den > 0 ? num / den : 0);
const ms = (iso: string) => new Date(iso).getTime();

const EMPTY_REACH: Reach = {
  emails: 0, delivered: 0, bounced: 0, hardBounces: 0, softBounces: 0, deliveryRate: 0, bounceRate: 0,
};
const EMPTY_ENGAGEMENT: Engagement = {
  opens: 0, uniqueOpeners: 0, openRate: 0, clicks: 0, uniqueClickers: 0, clickRate: 0, clickToOpenRate: 0,
};

/**
 * Phoenix hour + weekday for an instant.
 *
 * Intl rather than arithmetic because the rest of the app already reports in
 * Phoenix and a UTC hour histogram would put every 9 AM send at 4 PM.
 */
const PHOENIX_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: PHOENIX_TZ,
  hour: "numeric",
  hour12: false,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function phoenixHourWeekday(iso: string): { hour: number; weekday: number } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  let hour = 0;
  let weekday = 0;
  for (const part of PHOENIX_PARTS.formatToParts(d)) {
    if (part.type === "hour") hour = Number(part.value) % 24;
    if (part.type === "weekday") weekday = WEEKDAY_INDEX[part.value] ?? 0;
  }
  return { hour, weekday };
}

function toBuckets(counts: Map<number, number>, size: number): BucketCount[] {
  const out: BucketCount[] = [];
  for (let i = 0; i < size; i++) out.push({ bucket: i, count: counts.get(i) || 0 });
  return out;
}

function bump(map: Map<number, number>, key: number) {
  map.set(key, (map.get(key) || 0) + 1);
}

/**
 * How many times this scope actually went out.
 *
 * A broadcast is one send however many people it reached, so distinct
 * broadcast ids count once. Transactional legs carry no broadcast id, so they
 * are counted once per campaign per Phoenix day — near enough, and it never
 * inflates a daily cadence into hundreds of "sends".
 */
function countSends(events: AnalyticsEvent[]): number {
  const keys = new Set<string>();
  for (const e of events) {
    if (e.event_type !== "email.sent" && e.event_type !== "email.delivered" && e.event_type !== "email.bounced") continue;
    if (e.broadcast_id) keys.add(`b:${e.broadcast_id}`);
    else keys.add(`t:${e.campaign_id || "none"}:${e.occurred_at.slice(0, 10)}`);
  }
  return keys.size;
}

function computeReach(events: AnalyticsEvent[]): Reach {
  const attempted = new Set<string>();

  /**
   * The LAST thing that happened to each address wins.
   *
   * 49 addresses on the first blast show a delivered event followed by a
   * bounce — Outlook accepted the message at the edge and then failed it
   * internally ("hop count exceeded"). Those are bounces, not deliveries, and
   * counting them as delivered would both hide the real bounce rate and
   * inflate the denominator under every open and click rate.
   */
  const outcome = new Map<string, { at: number; kind: "delivered" | "hard" | "soft" }>();

  for (const e of events) {
    const id = e.email_id;
    if (!id) continue;
    if (e.event_type === "email.sent" || e.event_type === "email.delivered" || e.event_type === "email.bounced") {
      attempted.add(id);
    }

    let kind: "delivered" | "hard" | "soft" | null = null;
    if (e.event_type === "email.delivered") kind = "delivered";
    // SES wording: Permanent = dead address, everything else is worth retrying
    else if (e.event_type === "email.bounced") kind = (e.bounce_type || "").toLowerCase() === "permanent" ? "hard" : "soft";
    if (!kind) continue;

    const at = ms(e.occurred_at);
    if (isNaN(at)) continue;
    const prev = outcome.get(id);
    if (!prev || at >= prev.at) outcome.set(id, { at, kind });
  }

  let delivered = 0;
  let hardBounces = 0;
  let softBounces = 0;
  for (const o of Array.from(outcome.values())) {
    if (o.kind === "delivered") delivered++;
    else if (o.kind === "hard") hardBounces++;
    else softBounces++;
  }

  const bounced = hardBounces + softBounces;
  const emails = attempted.size;

  return {
    emails,
    delivered,
    bounced,
    hardBounces,
    softBounces,
    deliveryRate: rate(delivered, emails),
    bounceRate: rate(bounced, emails),
  };
}

/** Engagement from a pre-filtered set of open/click events. */
function computeEngagement(
  openEvents: AnalyticsEvent[],
  clickEvents: AnalyticsEvent[],
  clickers: Set<string>,
  delivered: number
): Engagement {
  const openers = new Set<string>();
  for (const e of openEvents) if (e.email_id) openers.add(e.email_id);

  return {
    opens: openEvents.length,
    uniqueOpeners: openers.size,
    openRate: rate(openers.size, delivered),
    clicks: clickEvents.length,
    uniqueClickers: clickers.size,
    clickRate: rate(clickers.size, delivered),
    clickToOpenRate: rate(clickers.size, openers.size),
  };
}

/** Everything for one scope (all campaigns, or a single one). */
function summarise(events: AnalyticsEvent[], verdicts: Map<string, Verdict>) {
  const reach = computeReach(events);

  const rawOpens: AnalyticsEvent[] = [];
  const rawClicks: AnalyticsEvent[] = [];
  const humanOpens: AnalyticsEvent[] = [];
  const humanClicks: AnalyticsEvent[] = [];
  const rawClickers = new Set<string>();
  const reasons = new Map<QualityReason, number>();

  for (const e of events) {
    const v = verdicts.get(e.id);

    if (e.event_type === "email.opened") {
      rawOpens.push(e);
      // A bot open is noise; an Apple-preloaded open is a real person whose
      // open we simply cannot vouch for. Neither counts toward the open rate.
      if (v && !v.is_bot && !v.is_unreliable_open) humanOpens.push(e);
    }

    if (e.event_type === "email.clicked") {
      rawClicks.push(e);
      if (e.email_id) rawClickers.add(e.email_id);
      if (v && !v.is_bot) humanClicks.push(e);
    }

    if (v?.reason) reasons.set(v.reason, (reasons.get(v.reason) || 0) + 1);
  }

  const humanClickerIds = new Set<string>();
  for (const e of humanClicks) if (e.email_id) humanClickerIds.add(e.email_id);

  const human = computeEngagement(humanOpens, humanClicks, humanClickerIds, reach.delivered);
  const raw = computeEngagement(rawOpens, rawClicks, rawClickers, reach.delivered);

  const noise: Noise = {
    filteredClicks: rawClicks.length - humanClicks.length,
    filteredOpens: rawOpens.length - humanOpens.length,
    filteredClickShare: rate(rawClicks.length - humanClicks.length, rawClicks.length),
    reasons: Array.from(reasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };

  return { reach, human, raw, noise, humanClicks };
}

/** First and last time anything actually went out, plus how long that spans in days. */
function span(events: AnalyticsEvent[]): { first: string | null; last: string | null; days: number } {
  let first: number | null = null;
  let last: number | null = null;
  for (const e of events) {
    if (e.event_type !== "email.sent" && e.event_type !== "email.delivered" && e.event_type !== "email.bounced") continue;
    const t = ms(e.occurred_at);
    if (isNaN(t)) continue;
    if (first === null || t < first) first = t;
    if (last === null || t > last) last = t;
  }
  if (first === null || last === null) return { first: null, last: null, days: 0 };
  // Inclusive: a campaign that sent once today has been running 1 day, not 0
  const days = Math.max(1, Math.round((Date.now() - first) / 86_400_000) + 1);
  return { first: new Date(first).toISOString(), last: new Date(last).toISOString(), days };
}

/**
 * Build the dashboard payload.
 *
 * `events` must already be scoped to what the caller wants counted — the route
 * excludes test sends, because a [TEST] email to three colleagues is not
 * campaign performance.
 */
export function buildAnalytics(
  events: AnalyticsEvent[],
  campaigns: AnalyticsCampaign[],
  campaignId: string | null
): AnalyticsSummary {
  // Classified once, per send, across everything — the burst and user-agent
  // rules compare a recipient against the rest of their own send, so narrowing
  // to one campaign first would change the verdicts.
  const verdicts = new Map<string, Verdict>();
  for (const v of classifyAll(events)) verdicts.set(v.event_id, v);

  const scoped = campaignId ? events.filter((e) => e.campaign_id === campaignId) : events;
  const { reach, human, raw, noise, humanClicks } = summarise(scoped, verdicts);

  // Links — human clicks only, so a scanner hitting every URL can't invent a winner
  const linkClicks = new Map<string, { clicks: number; clickers: Set<string> }>();
  for (const e of humanClicks) {
    const url = (e.link || "").trim();
    if (!url) continue;
    let row = linkClicks.get(url);
    if (!row) {
      row = { clicks: 0, clickers: new Set<string>() };
      linkClicks.set(url, row);
    }
    row.clicks++;
    if (e.email_id) row.clickers.add(e.email_id);
  }
  const links: LinkStat[] = Array.from(linkClicks.entries())
    .map(([url, r]) => ({ url, clicks: r.clicks, clickers: r.clickers.size }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  // Timing, all in Phoenix
  const hourCounts = new Map<number, number>();
  const clickWeekdayCounts = new Map<number, number>();
  for (const e of humanClicks) {
    const p = phoenixHourWeekday(e.occurred_at);
    if (!p) continue;
    bump(hourCounts, p.hour);
    bump(clickWeekdayCounts, p.weekday);
  }

  const sendWeekdayCounts = new Map<number, number>();
  const countedSends = new Set<string>();
  for (const e of scoped) {
    if (e.event_type !== "email.sent") continue;
    const key = e.broadcast_id || `t:${e.campaign_id}:${e.occurred_at.slice(0, 10)}`;
    if (countedSends.has(key)) continue;
    countedSends.add(key);
    const p = phoenixHourWeekday(e.occurred_at);
    if (p) bump(sendWeekdayCounts, p.weekday);
  }

  // Per campaign — always every campaign that has data, so the picker can show
  // a comparison row even while one campaign is selected
  const byCampaign = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    if (!e.campaign_id) continue;
    const list = byCampaign.get(e.campaign_id);
    if (list) list.push(e);
    else byCampaign.set(e.campaign_id, [e]);
  }

  const metaById = new Map(campaigns.map((c) => [c.id, c]));
  const perCampaign: CampaignStat[] = Array.from(byCampaign.entries())
    .map(([id, list]) => {
      const meta = metaById.get(id);
      const s = summarise(list, verdicts);
      const sp = span(list);
      return {
        id,
        name: meta?.listing_name || "Unknown campaign",
        label: meta?.email_label || null,
        status: meta?.status || null,
        type: meta?.campaign_type || null,
        kind: meta?.campaign_kind || null,
        frequency: meta?.frequency || null,
        firstSendAt: sp.first,
        lastSendAt: sp.last,
        daysRunning: sp.days,
        sends: countSends(list),
        reach: s.reach,
        human: s.human,
        raw: s.raw,
      };
    })
    .sort((a, b) => b.reach.emails - a.reach.emails);

  const sp = span(scoped);

  return {
    generatedAt: new Date().toISOString(),
    campaignId,
    campaignsWithData: byCampaign.size,
    sends: countSends(scoped),
    firstSendAt: sp.first,
    lastSendAt: sp.last,
    daysRunning: sp.days,
    reach,
    human,
    raw,
    noise,
    // Resend has not sent a single unsubscribe or complaint yet. Showing a real
    // zero is the point — a missing panel would read as "not measured".
    unsubscribes: scoped.filter((e) => e.event_type === "contact.unsubscribed").length,
    complaints: scoped.filter((e) => e.event_type === "email.complained").length,
    links,
    clicksByHour: toBuckets(hourCounts, 24),
    clicksByWeekday: toBuckets(clickWeekdayCounts, 7),
    sendsByWeekday: toBuckets(sendWeekdayCounts, 7),
    perCampaign,
  };
}

export const EMPTY_SUMMARY: AnalyticsSummary = {
  generatedAt: new Date(0).toISOString(),
  campaignId: null,
  campaignsWithData: 0,
  sends: 0,
  firstSendAt: null,
  lastSendAt: null,
  daysRunning: 0,
  reach: EMPTY_REACH,
  human: EMPTY_ENGAGEMENT,
  raw: EMPTY_ENGAGEMENT,
  noise: { filteredClicks: 0, filteredOpens: 0, filteredClickShare: 0, reasons: [] },
  unsubscribes: 0,
  complaints: 0,
  links: [],
  clicksByHour: [],
  clicksByWeekday: [],
  sendsByWeekday: [],
  perCampaign: [],
};
