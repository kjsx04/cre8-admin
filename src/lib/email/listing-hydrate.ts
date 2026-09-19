/**
 * Overlay live CMS listing fields onto a campaign row for preview / next send.
 * Never touches user copy (heading, body, partner logo, broker, audience).
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
  const hero = fd.gallery?.[0]?.url;
  if (hero) next.photo_url = hero;
  if (fd.slug) next.listing_page_url = `https://cre8advisors.com/listings/${fd.slug}`;
  next.highlights = refreshHighlights((campaign.highlights as string[]) || [], fd);
  return next;
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
