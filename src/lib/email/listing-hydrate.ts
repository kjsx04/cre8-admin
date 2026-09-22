/**
 * Overlay live CMS listing fields onto a campaign row.
 * Drafts stay live. Schedule bakes a snapshot; send uses that freeze.
 * Never touches user copy (heading, intro, body, partner logo, broker, audience).
 */

import { API_BASE, ListingItem } from "@/lib/admin-constants";
import { buildGroupSummary, refreshHighlights } from "./utils";

type CampaignRow = Record<string, unknown>;

type ListingCache = { at: number; items: ListingItem[] };
let cache: ListingCache | null = null;
const CACHE_MS = 30_000;

async function fetchListings(): Promise<ListingItem[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const res = await fetch(`${API_BASE}/listings`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return cache?.items || [];
  const data = await res.json();
  const items = ((data.items || []) as ListingItem[]).filter((i) => !i.isArchived);
  cache = { at: Date.now(), items };
  return items;
}

export function overlayListingOnCampaign(campaign: CampaignRow, item: ListingItem): CampaignRow {
  const fd = item.fieldData || {};
  const next: CampaignRow = { ...campaign };
  if (fd.name) next.listing_name = fd.name;
  // Hero photo: keep what the user picked unless it's missing or no longer exists.
  //   - empty                                   → listing's first gallery photo
  //   - a Webflow CDN photo no longer in gallery → first gallery photo (it was removed/replaced in the CMS)
  //   - a gallery photo the user chose, or a pasted URL from elsewhere → kept
  // (Before this rule the preview always forced photo #1, so picking another photo did nothing.)
  next.photo_url = resolveHeroPhoto(campaign.photo_url, fd.gallery);
  if (fd.slug) next.listing_page_url = `https://cre8advisors.com/listings/${fd.slug}`;
  next.highlights = refreshHighlights((campaign.highlights as string[]) || [], fd);
  return next;
}

/** True for images hosted by Webflow (the listing gallery lives there) */
function isWebflowCdn(url: string): boolean {
  return /website-files\.com/i.test(url);
}

/** Decide which hero photo a campaign should show given the listing's current gallery */
export function resolveHeroPhoto(current: unknown, gallery: { url: string }[] | null | undefined): string {
  const cur = typeof current === "string" ? current : "";
  const urls = (gallery || []).map((g) => g.url).filter(Boolean);
  const first = urls[0] || "";
  if (!cur) return first;                                    // nothing chosen yet → first gallery photo
  if (urls.includes(cur)) return cur;                        // still a valid gallery photo → keep
  if (isWebflowCdn(cur) && first) return first;              // stale CMS photo → first gallery photo
  return cur;                                                // custom URL from elsewhere → keep
}

export function overlayGroupCard(card: Record<string, unknown>, item: ListingItem): Record<string, unknown> {
  const fd = item.fieldData || {};
  const next = { ...card };
  if (fd.name) next.name = fd.name;
  const hero = fd.gallery?.[0]?.url;
  if (hero && !card.photo_url) next.photo_url = hero;
  if (fd.slug) next.url = `https://cre8advisors.com/listings/${fd.slug}`;
  const summary = buildGroupSummary(fd);
  if (summary) next.summary = summary;
  if (fd["under-contract"]) next.chip = "Under Contract";
  if (fd["under-contract"] === false && card.chip === "Under Contract") next.chip = "";
  return next;
}

/** Draft (or no status) still follows the listing CMS. Scheduled+ is frozen. */
export function listingStaysLive(status: unknown): boolean {
  return status == null || status === "" || status === "draft";
}

/** Persistable listing snapshot (photos, URL, auto highlights, group cards). */
export function listingSnapshotFields(live: CampaignRow, at = new Date()): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    listing_name: live.listing_name,
    photo_url: live.photo_url,
    listing_page_url: live.listing_page_url,
    highlights: live.highlights || [],
    listing_synced_at: at.toISOString(),
  };
  if (Array.isArray(live.group_listings)) fields.group_listings = live.group_listings;
  return fields;
}

/** Pull current listing CMS data onto campaign fields used by renderEmailHtml. */
export async function hydrateCampaignListing(campaign: CampaignRow): Promise<CampaignRow> {
  const listingId = String(campaign.listing_id || "");
  const isGroup = campaign.campaign_kind === "group" || (Array.isArray(campaign.group_listings) && (campaign.group_listings as unknown[]).length > 0);
  const cards = Array.isArray(campaign.group_listings) ? (campaign.group_listings as Record<string, unknown>[]) : [];
  const ids = isGroup
    ? cards.map((c) => String(c.listing_id || "")).filter(Boolean)
    : listingId && !listingId.startsWith("group:") ? [listingId] : [];
  if (ids.length === 0) return campaign;

  try {
    const items = await fetchListings();
    const byId = new Map(items.map((i) => [i.id, i]));
    let next = { ...campaign };
    if (!isGroup) {
      const item = byId.get(listingId);
      if (item) next = overlayListingOnCampaign(next, item);
      return next;
    }
    next.group_listings = cards.map((card) => {
      const item = byId.get(String(card.listing_id || ""));
      return item ? overlayGroupCard(card, item) : card;
    });
    return next;
  } catch (err) {
    console.warn("[hydrateCampaignListing]", err);
    return campaign;
  }
}
