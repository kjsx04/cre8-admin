/**
 * Audience sizes — server side.
 *
 * Lists every live Resend segment (GET /segments) and counts the contacts in
 * each one via GET /contacts?segment_id= (full pagination). Resend has no
 * segment.total field. Composer chips show `subscribed` (broadcast recipients);
 * `total` includes unsubscribed. Cached 10 minutes; ?refresh=1 forces a recount.
 */

import { listSegments, countSegmentContacts, isProviderConfigured, invalidateContactCaches } from "./provider";
import { AudienceCount } from "./types";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Preferred order on the composer — anything else follows alphabetically
const PREFERRED_ORDER = ["brokers", "buyers", "sellers"];

// Module-level cache: survives across requests on a warm serverless instance
let cache: { at: number; data: AudienceCount[] } | null = null;

function sortSegments<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ai = PREFERRED_ORDER.indexOf(a.name.toLowerCase());
    const bi = PREFERRED_ORDER.indexOf(b.name.toLowerCase());
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });
}

/** Counts for every live Resend segment, cached. Pass force=true to bypass the cache. */
export async function getAudienceCounts(force = false): Promise<AudienceCount[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!isProviderConfigured()) return [];
  if (force) {
    cache = null;
    invalidateContactCaches();
  }

  const segments = sortSegments(await listSegments());
  const data = await Promise.all(
    segments.map(async (seg): Promise<AudienceCount> => {
      try {
        const c = await countSegmentContacts(seg.id, force);
        return { id: seg.id, name: seg.name, ...c };
      } catch (err) {
        // One bad segment shouldn't blank the others — report zero and log it
        console.error(`[audience] count failed for ${seg.id}:`, err);
        return { id: seg.id, name: seg.name, total: 0, subscribed: 0, unsubscribed: 0 };
      }
    })
  );

  // Don't cache an all-zero result — that's almost always a failed Resend read
  const allZero = data.length > 0 && data.every((d) => d.total === 0 && d.subscribed === 0);
  if (allZero) {
    console.error("[audience] all segment counts were zero — not caching");
  } else {
    cache = { at: Date.now(), data };
  }
  return data;
}
