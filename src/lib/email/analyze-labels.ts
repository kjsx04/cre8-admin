/**
 * Formatting for the Analyze dashboard.
 *
 * Separate from analytics.ts so the page can import labels and number
 * formatting without pulling the classifier into the client bundle — the type
 * imports below are erased at compile time, the maths is not.
 */

import type { QualityReason } from "./event-quality";

export type { AnalyticsSummary, CampaignStat, LinkStat, BucketCount } from "./analytics";

export type QualityReasonLabel = QualityReason;

/** Plain English for each filter rule — these appear in a sentence, so they read as noun phrases. */
export const REASON_LABELS: Record<QualityReason, string> = {
  burst_multi_link: "clicked several links at once",
  scanner_ua: "known scanner software",
  pre_delivery_click: "clicked before the email landed",
  scanner_ip: "known scanner network",
  apple_mpp_open: "Apple preloaded the image",
  instant_open: "opened the instant it arrived",
};

/** Whole percent above 10%, one decimal below it — 9.5% matters, 46.7% does not. */
export function pct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** "Sep 23" in Phoenix time */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
  });
}
