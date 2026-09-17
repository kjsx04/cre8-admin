/**
 * Audience sizes — server side.
 *
 * Answers "who does this campaign go to, and how many?" for every enabled
 * segment in EMAIL_SEGMENTS by counting the contacts in the matching Resend
 * segment. Counting means paging through the segment (see provider.ts), so the
 * result is cached in memory for 10 minutes per server instance. Contacts are
 * imported rarely, so a slightly stale number is fine.
 */

import { EMAIL_SEGMENTS } from "./constants";
import { resolveSegmentId, countSegmentContacts, isProviderConfigured } from "./provider";
import { AudienceCount } from "./types";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Module-level cache: survives across requests on a warm serverless instance
let cache: { at: number; data: AudienceCount[] } | null = null;

/** Counts for every enabled segment, cached. Pass force=true to bypass the cache. */
export async function getAudienceCounts(force = false): Promise<AudienceCount[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!isProviderConfigured()) return [];

  const enabled = EMAIL_SEGMENTS.filter((s) => s.enabled);
  const data = await Promise.all(
    enabled.map(async (seg): Promise<AudienceCount> => {
      const resendId = resolveSegmentId(seg.id);
      if (!resendId) return { id: seg.id, name: seg.name, total: 0, subscribed: 0, unsubscribed: 0 };
      try {
        const c = await countSegmentContacts(resendId);
        return { id: seg.id, name: seg.name, ...c };
      } catch (err) {
        // One bad segment shouldn't blank the others — report zero and log it
        console.error(`[audience] count failed for ${seg.id}:`, err);
        return { id: seg.id, name: seg.name, total: 0, subscribed: 0, unsubscribed: 0 };
      }
    })
  );

  cache = { at: Date.now(), data };
  return data;
}
