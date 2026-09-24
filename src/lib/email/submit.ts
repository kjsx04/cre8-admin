/**
 * Submit a campaign (create or edit) to the API.
 *
 * Schedule / Update send auto_schedule: true so the AI picks a send time and
 * the server pushes the email to Resend. Save campaign sends auto_schedule:
 * false — the row stays a draft under "Saved campaigns" until Schedule
 * or Send now. If the server saved the row but Resend refused, the response
 * carries provider_sync.ok === false — we throw so the toast can retry.
 */

import { Campaign, CampaignFormData } from "./types";

async function postCampaign(
  data: CampaignFormData,
  userEmail: string,
  editId: string | undefined,
  autoSchedule: boolean
): Promise<Campaign> {
  const url = editId ? `/api/email/campaigns/${editId}` : "/api/email/campaigns";

  const res = await fetch(url, {
    method: editId ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-email": userEmail,
    },
    body: JSON.stringify({ ...data, auto_schedule: autoSchedule }),
  });

  const saved = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      saved.error || (editId ? "Failed to update campaign" : "Failed to create campaign")
    );
  }

  // Schedule / Update push to Resend. Surface a provider failure.
  if (autoSchedule && saved.provider_sync && saved.provider_sync.ok === false) {
    const why = saved.provider_sync.error || saved.provider_sync.action;
    throw new Error(
      editId
        ? `Saved, but the email provider wasn't updated: ${why}`
        : `Campaign saved, but the email provider wasn't updated: ${why}`
    );
  }

  return saved as Campaign;
}

export async function submitCampaign(
  data: CampaignFormData,
  userEmail: string,
  editId?: string
): Promise<Campaign> {
  return postCampaign(data, userEmail, editId, true);
}

/** Persist work as a draft. Does not schedule or go live. */
export async function saveCampaignDraft(
  data: CampaignFormData,
  userEmail: string,
  editId?: string
): Promise<Campaign> {
  return postCampaign(data, userEmail, editId, false);
}
