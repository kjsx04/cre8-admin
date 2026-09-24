/**
 * How many real people a multi-list send reaches.
 *
 * Buyers holds 2,616 and Sellers 2,440, but 883 people are on both — so
 * "Buyers + Sellers" is 4,173 recipients, not 5,056. Adding the two list sizes
 * together overstates the audience and would make the composer lie about the
 * size of a send.
 *
 * The contact mirror groups every contact by the exact set of lists it belongs
 * to (`audience_overlaps()` in Postgres). Those groups are disjoint by
 * construction: a contact appears in exactly one of them. So the union of any
 * selection is just the sum of the groups that touch the selection — no
 * inclusion-exclusion, and it stays exact for any number of lists.
 */

/** One membership combination and how many contacts hold exactly that combination. */
export type AudienceOverlap = {
  /** Sorted Resend segment ids — the exact set of lists these contacts are on */
  segment_ids: string[];
  total: number;
  subscribed: number;
};

export type UniqueCount = {
  total: number;
  subscribed: number;
  unsubscribed: number;
};

/**
 * Exact de-duplicated size of a selection.
 * Returns null when there's nothing to work from, so callers can fall back to
 * summing the per-list counts rather than showing a zero.
 */
export function uniqueAcross(
  overlaps: AudienceOverlap[] | undefined | null,
  segmentIds: string[]
): UniqueCount | null {
  if (!overlaps || overlaps.length === 0) return null;
  if (segmentIds.length === 0) return null;

  const wanted = new Set(segmentIds);
  let total = 0;
  let subscribed = 0;

  for (const group of overlaps) {
    // A group counts once if it touches the selection at all
    if (!group.segment_ids.some((id) => wanted.has(id))) continue;
    total += group.total;
    subscribed += group.subscribed;
  }

  if (total === 0) return null; // mirror hasn't been synced for these lists yet
  return { total, subscribed, unsubscribed: Math.max(0, total - subscribed) };
}

/**
 * How many people are on more than one of the selected lists.
 * Drives the "883 are on both lists and get one email" note in the composer.
 */
export function overlapCount(
  overlaps: AudienceOverlap[] | undefined | null,
  segmentIds: string[]
): number {
  if (!overlaps || segmentIds.length < 2) return 0;
  const wanted = new Set(segmentIds);
  let n = 0;
  for (const group of overlaps) {
    const hits = group.segment_ids.filter((id) => wanted.has(id)).length;
    if (hits > 1) n += group.total;
  }
  return n;
}
