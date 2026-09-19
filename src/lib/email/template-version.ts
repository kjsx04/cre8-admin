/**
 * Per-campaign template chrome pin.
 *
 * Sent Resend mail is never rewritten. A campaign keeps the shell it last
 * synced until the user clicks Sync template (or saves from the composer,
 * which is the same review). Listing fields stay live on their own path.
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

/** Null = created before versioning; treat as current so listing re-push stays on. */
export function usesCurrentTemplate(campaign: { template_version?: string | null }): boolean {
  const v = campaign.template_version;
  return !v || v === CURRENT_TEMPLATE_VERSION;
}

export function canSyncTemplate(status: string): boolean {
  return status === "draft" || status === "scheduled" || status === "active" || status === "paused";
}
