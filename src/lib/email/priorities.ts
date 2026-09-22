/**
 * Listing priorities — one ranked list, rank 1 = most important.
 *
 * Stored in `listing_priorities` (listing_id, listing_name, rank). Only listings
 * with campaigns on the schedule need a row. The AI scheduler and the week
 * optimizer read the rank; the Priorities panel writes it.
 *
 * Server-only (imports the service-role Supabase client).
 */

import { supabase } from "@/lib/flow/supabase";

export interface ListingRank {
  listing_id: string;
  listing_name: string | null;
  rank: number;
}

/** All ranks, sorted. */
export async function getRanks(): Promise<ListingRank[]> {
  const { data } = await supabase
    .from("listing_priorities")
    .select("listing_id, listing_name, rank")
    .order("rank", { ascending: true });
  return (data || []) as ListingRank[];
}

/** listing_id → rank */
export async function getRankMap(): Promise<Map<string, number>> {
  const rows = await getRanks();
  return new Map(rows.map((r) => [r.listing_id, r.rank]));
}

/**
 * Replace the whole ranking. Input order = new order; ranks are renumbered 1..N.
 * Listings not in the list keep their rows but are pushed below (renumbered after N).
 */
export async function setRanks(ordered: { listing_id: string; listing_name?: string | null }[]): Promise<ListingRank[]> {
  const existing = await getRanks();
  const seen = new Set<string>();
  const next: ListingRank[] = [];

  ordered.forEach((o) => {
    if (seen.has(o.listing_id)) return;
    seen.add(o.listing_id);
    const prev = existing.find((e) => e.listing_id === o.listing_id);
    next.push({ listing_id: o.listing_id, listing_name: o.listing_name ?? prev?.listing_name ?? null, rank: next.length + 1 });
  });
  // Anything not mentioned trails in its old order
  existing
    .filter((e) => !seen.has(e.listing_id))
    .forEach((e) => next.push({ ...e, rank: next.length + 1 }));

  if (next.length > 0) {
    const { error } = await supabase
      .from("listing_priorities")
      .upsert(next.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "listing_id" });
    if (error) throw error;
  }
  return next;
}

/**
 * Make sure a listing has a rank. New listings go to the top or the bottom;
 * listings that already have a rank are left alone.
 */
export async function placeListing(
  listingId: string,
  listingName: string | null,
  position: "top" | "bottom"
): Promise<void> {
  const existing = await getRanks();
  if (existing.some((e) => e.listing_id === listingId)) return;
  const entry = { listing_id: listingId, listing_name: listingName };
  const ordered = position === "top" ? [entry, ...existing] : [...existing, entry];
  await setRanks(ordered);
}

/** Drop listings that no longer have anything on the schedule */
export async function pruneRanks(activeListingIds: Set<string>): Promise<void> {
  const existing = await getRanks();
  const keep = existing.filter((e) => activeListingIds.has(e.listing_id));
  const drop = existing.filter((e) => !activeListingIds.has(e.listing_id)).map((e) => e.listing_id);
  if (drop.length > 0) {
    await supabase.from("listing_priorities").delete().in("listing_id", drop);
    await setRanks(keep);
  }
}

/**
 * Put a listing at an exact rank (1 = top), moving everything else down to make room.
 * Works whether or not the listing already has a rank. Ranks past the end clamp to the bottom.
 */
export async function placeListingAt(listingId: string, listingName: string | null, rank: number): Promise<void> {
  const existing = (await getRanks()).filter((e) => e.listing_id !== listingId);
  const idx = Math.max(0, Math.min(existing.length, Math.round(rank) - 1));
  const entry = { listing_id: listingId, listing_name: listingName };
  const ordered = [...existing.slice(0, idx), entry, ...existing.slice(idx)];
  await setRanks(ordered);
}

/** Priority fields as they should be stored, from whatever the composer sent */
export function normalizePriority(body: { priority?: unknown; priority_rank?: unknown }): { priority: "high" | "normal" | "custom"; priority_rank: number | null } {
  const rank = Number(body.priority_rank);
  if (body.priority === "high") return { priority: "high", priority_rank: null };
  if (body.priority === "custom" && Number.isFinite(rank) && rank >= 1) return { priority: "custom", priority_rank: Math.round(rank) };
  return { priority: "normal", priority_rank: null };
}

/**
 * Place a campaign's listing in the ranked list according to its priority:
 *   Top    → #1 (moves it there even if it was already ranked)
 *   Custom → exactly priority_rank
 *   Fit    → bottom, but only if the listing isn't ranked yet
 * Returns true when the caller should also rebalance the weeks (Top / Custom).
 */
export async function placeForCampaign(campaign: { listing_id?: unknown; listing_name?: unknown; priority?: unknown; priority_rank?: unknown }): Promise<boolean> {
  const listingId = typeof campaign.listing_id === "string" ? campaign.listing_id : "";
  if (!listingId) return false;
  const name = typeof campaign.listing_name === "string" ? campaign.listing_name : null;
  if (campaign.priority === "high") { await placeListingAt(listingId, name, 1); return true; }
  if (campaign.priority === "custom") { await placeListingAt(listingId, name, Number(campaign.priority_rank) || 1); return true; }
  await placeListing(listingId, name, "bottom");
  return false;
}
