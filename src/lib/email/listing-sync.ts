/**
 * Listing → Campaign sync.
 *
 * When a listing is saved in the admin portal, any email campaign tied to that
 * listing gets its listing-derived fields refreshed (name, hero photo, page URL,
 * and the auto-built highlights like price / acreage / zoning), then the pending
 * Resend broadcast is updated so the next send goes out with accurate info.
 *
 * Fields the user typed by hand (heading_text, body_text, custom highlights)
 * are never touched.
 */

import { supabase } from "@/lib/flow/supabase";
import { ListingFieldData } from "@/lib/admin-constants";
import { syncCampaignToProvider } from "./provider";
import { refreshHighlights } from "./utils";

export type ListingSyncResult = {
  updated: string[];  // campaign ids whose row changed
  synced: string[];   // campaign ids whose Resend broadcast was updated
  errors: string[];
};

/**
 * Refresh every non-finished campaign for this listing.
 * Only fields present in `fieldData` are applied, so partial saves are safe.
 */
export async function syncCampaignsForListing(
  listingId: string,
  fieldData: Partial<ListingFieldData>
): Promise<ListingSyncResult> {
  const result: ListingSyncResult = { updated: [], synced: [], errors: [] };

  const { data: campaigns, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("listing_id", listingId)
    .in("status", ["draft", "scheduled", "active", "paused"]);

  if (error || !campaigns?.length) return result;

  for (const campaign of campaigns) {
    const updates: Record<string, unknown> = {};

    // Listing name (drives the subject line + default heading)
    if (fieldData.name && fieldData.name !== campaign.listing_name) {
      updates.listing_name = fieldData.name;
    }

    // Hero photo = first gallery image
    const heroUrl = fieldData.gallery?.[0]?.url;
    if (heroUrl && heroUrl !== campaign.photo_url) {
      updates.photo_url = heroUrl;
    }

    // Listing page URL from slug
    if (fieldData.slug) {
      const url = `https://cre8advisors.com/listings/${fieldData.slug}`;
      if (url !== campaign.listing_page_url) updates.listing_page_url = url;
    }

    // Auto-derived highlights (price, acres, zoning, etc.) — custom ones are left alone
    const nextHighlights = refreshHighlights(campaign.highlights || [], fieldData);
    if (JSON.stringify(nextHighlights) !== JSON.stringify(campaign.highlights || [])) {
      updates.highlights = nextHighlights;
    }

    if (Object.keys(updates).length === 0) continue;

    updates.updated_at = new Date().toISOString();

    const { data: saved, error: updErr } = await supabase
      .from("email_campaigns")
      .update(updates)
      .eq("id", campaign.id)
      .select()
      .single();

    if (updErr || !saved) {
      result.errors.push(`${campaign.id}: ${updErr?.message || "update failed"}`);
      continue;
    }
    result.updated.push(campaign.id);

    // Push the refreshed content to Resend if there's a pending send
    if (saved.status === "scheduled" || saved.status === "active") {
      const sync = await syncCampaignToProvider(saved);
      if (sync.provider_send_id !== saved.provider_send_id) {
        await supabase
          .from("email_campaigns")
          .update({ provider_send_id: sync.provider_send_id })
          .eq("id", campaign.id);
      }
      if (sync.ok) result.synced.push(campaign.id);
      else result.errors.push(`${campaign.id}: ${sync.error || sync.action}`);
    }
  }

  return result;
}
