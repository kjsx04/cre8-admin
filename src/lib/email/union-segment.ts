/**
 * Union lists — one email per person when a campaign targets several lists.
 *
 * A Resend broadcast goes to exactly one segment, so picking Buyers AND Sellers
 * used to create two broadcasts. 883 people are on both of those lists, so they
 * would have received the same email twice.
 *
 * Resend segments are static membership lists — there are no filters and no way
 * to say "Buyers or Sellers" or "Sellers except Buyers". So for a multi-list
 * campaign we keep a managed segment holding the de-duplicated union and send a
 * single broadcast to that.
 *
 * Membership comes from the local contact mirror (`email_contacts`), which the
 * nightly cron rebuilds from Resend. Adds go through the bulk CSV import endpoint
 * (one request for thousands of contacts); removals are rare and go one at a time.
 */

import { supabase } from "@/lib/flow/supabase";

/** Managed segments are named so they're obvious in Resend's dashboard */
export const UNION_PREFIX = "Auto:";

/**
 * Stable name for a combination, so the same pick always finds the same segment.
 * Sorted by name, not id, so it reads properly: "Auto: Buyers + Sellers".
 */
export function unionSegmentName(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return `${UNION_PREFIX} ${clean.join(" + ")}`;
}

/** Same set of ids in any order = same key. */
export function unionKey(segmentIds: string[]): string {
  return Array.from(new Set(segmentIds)).sort().join(",");
}

/**
 * Who should be in the union, straight from the mirror.
 * Returns lowercase emails, de-duplicated, unsubscribed contacts excluded
 * (Resend skips them anyway, but there's no reason to carry them).
 */
export async function unionMembers(segmentIds: string[]): Promise<string[]> {
  if (segmentIds.length === 0) return [];

  // Supabase caps a select at 1,000 rows. Buyers + Sellers is 4,173, so an
  // unpaged read silently returned the first 1,000 and the send would have
  // reached a quarter of the list.
  const PAGE = 1000;
  const emails = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("email_contacts")
      .select("email")
      .overlaps("segment_ids", segmentIds)
      .eq("unsubscribed", false)
      .order("email", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read the contact mirror: ${error.message}`);
    const rows = data || [];
    for (const r of rows) emails.add((r.email as string).toLowerCase());
    if (rows.length < PAGE) break;
  }
  return Array.from(emails);
}

/**
 * What has to change to make `current` match `target`.
 * Pure so the diffing is testable without touching Resend.
 */
export function membershipDiff(
  current: string[],
  target: string[]
): { add: string[]; remove: string[] } {
  const have = new Set(current.map((e) => e.toLowerCase()));
  const want = new Set(target.map((e) => e.toLowerCase()));
  return {
    add: Array.from(want).filter((e) => !have.has(e)),
    remove: Array.from(have).filter((e) => !want.has(e)),
  };
}

/** A CSV the bulk import endpoint accepts — email only, everything else already exists. */
export function membersCsv(emails: string[]): string {
  return ["email", ...emails].join("\n");
}
