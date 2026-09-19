/**
 * Stamp today's chrome onto a campaign and replace its pending Resend send.
 * Listing snapshot and campaign copy stay. Sent mail is never rewritten.
 */

import { supabase } from "@/lib/flow/supabase";
import { syncCampaignToProvider, type CampaignLike, type SyncResult } from "./provider";
import { canSyncTemplate, templateStamp } from "./template-version";

export type TemplateSyncOutcome = {
  campaign: CampaignLike;
  provider_sync: SyncResult | null;
};

export async function applyTemplateSync(campaign: CampaignLike): Promise<TemplateSyncOutcome> {
  const id = String(campaign.id || "");
  const status = String(campaign.status || "");
  if (!id || !canSyncTemplate(status)) {
    throw new Error("Sent emails stay as they were. Duplicate the campaign to send again.");
  }

  const stamp = templateStamp();
  const { data: saved, error } = await supabase
    .from("email_campaigns")
    .update({
      ...stamp,
      updated_at: stamp.template_synced_at,
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !saved) {
    throw new Error(error?.message || "Sync failed");
  }

  let provider_sync: SyncResult | null = null;
  if (saved.status === "scheduled" || saved.status === "active") {
    provider_sync = await syncCampaignToProvider(saved);
    if (provider_sync.provider_send_id !== saved.provider_send_id) {
      await supabase
        .from("email_campaigns")
        .update({ provider_send_id: provider_sync.provider_send_id })
        .eq("id", id);
      saved.provider_send_id = provider_sync.provider_send_id;
    }
  }

  return { campaign: saved, provider_sync };
}
