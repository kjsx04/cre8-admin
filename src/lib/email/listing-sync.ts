/**
 * Listing → Campaign sync.
 *
 * When a listing is saved in the admin portal, DRAFT campaigns tied to that
 * listing get listing-derived fields refreshed (name, hero photo, page URL,
 * auto highlights). Scheduled / active / paused rows stay frozen until the
 * user clicks Refresh listing. Sent mail is never rewritten.
 *
 * Fields the user typed by hand (heading_text, intro_text, body_text, custom highlights)
 * are never touched.
 */

import { supabase } from "@/lib/flow/supabase";
import { ListingFieldData } from "@/lib/admin-constants";
import { refreshHighlights, buildGroupSummary } from "./utils";

export type ListingSyncResult = {
  updated: string[];  // campaign ids whose row changed
  synced: string[];   // leftover: drafts have no pending Resend push
  errors: string[];
};

/**
 * Refresh draft campaigns for this listing.
 * Scheduled rows are locked at Schedule — use Refresh listing to un-freeze.
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
    .eq("status", "draft");

  if (error || !campaigns?.length) {
    // still check group drafts below
  } else {
    for (const campaign of campaigns) {
      const updates: Record<string, unknown> = {};

      if (fieldData.name && fieldData.name !== campaign.listing_name) {
        updates.listing_name = fieldData.name;
      }

      const heroUrl = fieldData.gallery?.[0]?.url;
      if (heroUrl && heroUrl !== campaign.photo_url) {
        updates.photo_url = heroUrl;
      }

      if (fieldData.slug) {
        const url = `https://cre8advisors.com/listings/${fieldData.slug}`;
        if (url !== campaign.listing_page_url) updates.listing_page_url = url;
      }

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
    }
  }

  // Group drafts that feature this listing
  const { data: groups } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("campaign_kind", "group")
    .eq("status", "draft")
    .contains("group_listings", JSON.stringify([{ listing_id: listingId }]));

  for (const g of groups || []) {
    let changed = false;
    const cards = (g.group_listings || []).map((card: { listing_id: string; name: string; photo_url: string; url: string; summary: string; chip: string }) => {
      if (card.listing_id !== listingId) return card;
      const next = { ...card };
      if (fieldData.name && fieldData.name !== card.name) next.name = fieldData.name;
      const hero = fieldData.gallery?.[0]?.url;
      if (hero && !card.photo_url) next.photo_url = hero;
      if (fieldData.slug) next.url = `https://cre8advisors.com/listings/${fieldData.slug}`;
      // Only fill an empty summary — a hand-written one in the composer stays
      const summary = buildGroupSummary(fieldData);
      if (summary && !String(card.summary || "").trim()) next.summary = summary;
      if (fieldData["under-contract"] && card.chip !== "Under Contract") next.chip = "Under Contract";
      if (fieldData["under-contract"] === false && card.chip === "Under Contract") next.chip = "";
      if (JSON.stringify(next) !== JSON.stringify(card)) changed = true;
      return next;
    });
    if (!changed) continue;
    const { data: saved } = await supabase
      .from("email_campaigns")
      .update({ group_listings: cards, updated_at: new Date().toISOString() })
      .eq("id", g.id)
      .select()
      .single();
    if (!saved) continue;
    result.updated.push(g.id);
  }

  return result;
}
