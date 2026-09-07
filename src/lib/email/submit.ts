/**
 * Submit a campaign (create or edit) to the API.
 *
 * One function used by the composer for both "Schedule" (create) and "Update"
 * (edit). Both paths send auto_schedule: true so the AI picks the send time and
 * the server pushes the email to Resend. If the server saved the row but Resend
 * refused, the response carries provider_sync.ok === false — we throw so the
 * toast shows the problem with a retry.
 */

import { Campaign, CampaignFormData } from "./types";

export async function submitCampaign(
  data: CampaignFormData,
  userEmail: string,
  editId?: string
): Promise<Campaign> {
  const url = editId ? `/api/email/campaigns/${editId}` : "/api/email/campaigns";

  const res = await fetch(url, {
    method: editId ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-email": userEmail,
    },
    body: JSON.stringify({ ...data, auto_schedule: true }),
  });

  if (!res.ok) {
    throw new Error(editId ? "Failed to update campaign" : "Failed to create campaign");
  }

  const saved = await res.json();

  // The API saved to Supabase AND pushed to Resend. Surface a Resend failure.
  if (saved.provider_sync && saved.provider_sync.ok === false) {
    const why = saved.provider_sync.error || saved.provider_sync.action;
    throw new Error(
      editId
        ? `Saved, but the email provider wasn't updated: ${why}`
        : `Campaign saved, but the email provider wasn't updated: ${why}`
    );
  }

  return saved as Campaign;
}
