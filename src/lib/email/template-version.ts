/**
 * Per-campaign template chrome pin.
 *
 * Bump CURRENT_TEMPLATE_VERSION in constants.ts when renderEmailHtml chrome
 * changes. Sent mail is never rewritten. Listing photos/fields freeze at Schedule.
 */

import { CURRENT_TEMPLATE_VERSION } from "./constants";

export { CURRENT_TEMPLATE_VERSION };

export function templateStamp(at = new Date()): {
  template_version: string;
  template_synced_at: string;
} {
  return {
    template_version: CURRENT_TEMPLATE_VERSION,
    template_synced_at: at.toISOString(),
  };
}

/** Null = created before versioning; treat as current. */
export function usesCurrentTemplate(campaign: { template_version?: string | null }): boolean {
  const v = campaign.template_version;
  return !v || v === CURRENT_TEMPLATE_VERSION;
}

export function canSyncTemplate(status: string): boolean {
  return status === "draft" || status === "scheduled" || status === "active" || status === "paused";
}

/** Same statuses as Sync template — Refresh listing replaces the pending send only. */
export const canRefreshListing = canSyncTemplate;
