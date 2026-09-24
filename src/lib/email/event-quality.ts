/**
 * Telling a real recipient from a security appliance.
 *
 * Corporate mail gateways open every link in an email before the recipient ever
 * sees it. On the first real blast that produced 1,689 clicks from 343
 * "clickers" against 734 delivered — a 46.7% click-through rate that would have
 * made every report meaningless.
 *
 * This module is pure: events in, verdicts out. No database, no network, so the
 * rules can be tested against real captured data. The caller decides what to do
 * with the verdicts.
 *
 * Nothing here ever mutates a raw event. Classification is written alongside.
 */

import {
  PRE_DELIVERY_CLICK_SECONDS,
  BURST_WINDOW_SECONDS,
  BURST_MIN_CLICKS,
  BURST_MIN_DISTINCT_LINKS,
  INSTANT_OPEN_SECONDS,
  SCANNER_UA_PATTERNS,
  APPLE_MPP_UA_PATTERNS,
  UA_BROADCAST_SHARE_SCANNER,
  UA_SHARE_MIN_RECIPIENTS,
} from "./analytics-config";

export type QualityReason =
  | "pre_delivery_click"
  | "burst_multi_link"
  | "scanner_ua"
  | "scanner_ip"
  | "apple_mpp_open"
  | "instant_open";

/** One event, reduced to what the rules actually look at. */
export interface RawEvent {
  id: string;
  event_type: string;
  email_id: string | null;
  broadcast_id: string | null;
  occurred_at: string;
  link?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface Verdict {
  event_id: string;
  email_id: string | null;
  is_bot: boolean;
  is_unreliable_open: boolean;
  reason: QualityReason | null;
}

const ms = (iso: string) => new Date(iso).getTime();

/** Scanners that name themselves. */
export function isScannerUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return SCANNER_UA_PATTERNS.some((re) => re.test(ua));
}

/** Apple Mail Privacy Protection — a real person, but the open tells us nothing. */
export function isAppleMppUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return APPLE_MPP_UA_PATTERNS.some((re) => re.test(ua));
}

/**
 * User agents that appear on so many recipients of one send that they cannot be
 * people. Returns the offending agent strings.
 *
 * Deliberately per-send: an agent used by 30% of one blast's recipients is a
 * gateway, while the same string across a year of sends is just a popular
 * browser.
 */
export function scannerUserAgentsByShare(events: RawEvent[]): Set<string> {
  const recipientsByUa = new Map<string, Set<string>>();
  const allRecipients = new Set<string>();

  for (const e of events) {
    if (!e.email_id) continue;
    allRecipients.add(e.email_id);
    const ua = (e.userAgent || "").trim();
    if (!ua) continue;
    let set = recipientsByUa.get(ua);
    if (!set) {
      set = new Set<string>();
      recipientsByUa.set(ua, set);
    }
    set.add(e.email_id);
  }

  const total = allRecipients.size;
  const flagged = new Set<string>();
  if (total < UA_SHARE_MIN_RECIPIENTS) return flagged; // too small to mean anything

  // Array.from: tsconfig has no `target`, so tsc runs at ES5 and cannot iterate a Map directly
  for (const [ua, set] of Array.from(recipientsByUa.entries())) {
    if (set.size / total >= UA_BROADCAST_SHARE_SCANNER) flagged.add(ua);
  }
  return flagged;
}

/**
 * Classify every event of one send together.
 *
 * Grouped per broadcast because two of the rules — burst detection and the user
 * agent share — only make sense relative to the rest of that send.
 */
export function classifySend(events: RawEvent[]): Verdict[] {
  const deliveredAt = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== "email.delivered" || !e.email_id) continue;
    const t = ms(e.occurred_at);
    const prev = deliveredAt.get(e.email_id);
    if (prev === undefined || t < prev) deliveredAt.set(e.email_id, t);
  }

  const clicksByRecipient = new Map<string, RawEvent[]>();
  for (const e of events) {
    if (e.event_type !== "email.clicked" || !e.email_id) continue;
    const list = clicksByRecipient.get(e.email_id);
    if (list) list.push(e);
    else clicksByRecipient.set(e.email_id, [e]);
  }

  const spoofedAgents = scannerUserAgentsByShare(events);
  const windowMs = BURST_WINDOW_SECONDS * 1000;
  const verdicts: Verdict[] = [];

  for (const e of events) {
    const base = { event_id: e.id, email_id: e.email_id };

    if (e.event_type === "email.clicked") {
      const ua = e.userAgent || "";

      if (isScannerUserAgent(ua) || (ua && spoofedAgents.has(ua.trim()))) {
        verdicts.push({ ...base, is_bot: true, is_unreliable_open: false, reason: "scanner_ua" });
        continue;
      }

      // Clicked before, or within seconds of, the email actually landing
      const delivered = e.email_id ? deliveredAt.get(e.email_id) : undefined;
      if (delivered !== undefined && ms(e.occurred_at) - delivered < PRE_DELIVERY_CLICK_SECONDS * 1000) {
        verdicts.push({ ...base, is_bot: true, is_unreliable_open: false, reason: "pre_delivery_click" });
        continue;
      }

      // A flurry of clicks in one window — a person does not do this
      const siblings = (e.email_id && clicksByRecipient.get(e.email_id)) || [];
      const t = ms(e.occurred_at);
      const near = siblings.filter((s) => Math.abs(ms(s.occurred_at) - t) <= windowMs);
      const distinctLinks = new Set(near.map((s) => s.link || "")).size;
      if (near.length >= BURST_MIN_CLICKS || distinctLinks >= BURST_MIN_DISTINCT_LINKS) {
        verdicts.push({ ...base, is_bot: true, is_unreliable_open: false, reason: "burst_multi_link" });
        continue;
      }

      verdicts.push({ ...base, is_bot: false, is_unreliable_open: false, reason: null });
      continue;
    }

    if (e.event_type === "email.opened") {
      const ua = e.userAgent || "";

      if (isScannerUserAgent(ua) || (ua && spoofedAgents.has(ua.trim()))) {
        verdicts.push({ ...base, is_bot: true, is_unreliable_open: false, reason: "scanner_ua" });
        continue;
      }

      // Real person, but Apple preloaded the image — the open means nothing
      if (isAppleMppUserAgent(ua)) {
        verdicts.push({ ...base, is_bot: false, is_unreliable_open: true, reason: "apple_mpp_open" });
        continue;
      }

      const delivered = e.email_id ? deliveredAt.get(e.email_id) : undefined;
      if (delivered !== undefined && ms(e.occurred_at) - delivered < INSTANT_OPEN_SECONDS * 1000) {
        verdicts.push({ ...base, is_bot: false, is_unreliable_open: true, reason: "instant_open" });
        continue;
      }

      verdicts.push({ ...base, is_bot: false, is_unreliable_open: false, reason: null });
      continue;
    }

    // sent / delivered / bounced / complained carry no engagement claim
    verdicts.push({ ...base, is_bot: false, is_unreliable_open: false, reason: null });
  }

  return verdicts;
}

/**
 * Recipients who clicked at least once like a human.
 *
 * The rule the whole thing rests on: one clean click makes a recipient real,
 * whatever their other clicks looked like. A gateway scanning links does not
 * stop the person behind it from also opening the email.
 */
export function humanClickers(events: RawEvent[], verdicts: Verdict[]): Set<string> {
  const byId = new Map(verdicts.map((v) => [v.event_id, v]));
  const people = new Set<string>();
  for (const e of events) {
    if (e.event_type !== "email.clicked" || !e.email_id) continue;
    const v = byId.get(e.id);
    if (v && !v.is_bot) people.add(e.email_id);
  }
  return people;
}

/** Group events by send so each group is classified against its own peers. */
export function groupBySend(events: RawEvent[]): Map<string, RawEvent[]> {
  const groups = new Map<string, RawEvent[]>();
  for (const e of events) {
    const key = e.broadcast_id || `email:${e.email_id || e.id}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return groups;
}

/** Classify a mixed pile of events, grouping per send first. */
export function classifyAll(events: RawEvent[]): Verdict[] {
  const out: Verdict[] = [];
  for (const group of Array.from(groupBySend(events).values())) out.push(...classifySend(group));
  return out;
}
