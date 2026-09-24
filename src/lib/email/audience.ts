/**
 * Audience sizes — server side.
 *
 * Lists every live Resend segment (GET /segments) and counts the contacts in
 * each one via GET /segments/{id}/contacts (full pagination). Resend has no
 * segment.total field. Composer chips show `subscribed` (broadcast recipients);
 * `total` includes unsubscribed. Cached 10 minutes; ?refresh=1 forces a recount.
 *
 * Brokers is counted first (alone). Promise.all of Brokers + Buyers + Sellers
 * hits Resend's 10 req/s cap mid-page; a thrown 429 used to cache Brokers as 0
 * while the bigger lists finished.
 */

import { listSegments, countSegmentContacts, isProviderConfigured, invalidateContactCaches } from "./provider";
import { AudienceCount } from "./types";
import {
  isManagedAudienceName,
  isPreferredAudienceName,
  pickCountOnError,
  shouldCacheAudienceCounts,
  sortAudienceSegments,
} from "./audience-count";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Module-level cache: survives across requests on a warm serverless instance
let cache: { at: number; data: AudienceCount[] } | null = null;

async function countOne(
  seg: { id: string; name: string },
  force: boolean,
  previous?: AudienceCount | null
): Promise<{ row: AudienceCount; failed: boolean }> {
  try {
    const c = await countSegmentContacts(seg.id, force);
    return { row: { id: seg.id, name: seg.name, ...c }, failed: false };
  } catch (err) {
    console.error(`[audience] count failed for ${seg.id}:`, err);
    const failed: AudienceCount = { id: seg.id, name: seg.name, total: 0, subscribed: 0, unsubscribed: 0 };
    return { row: pickCountOnError(failed, previous), failed: true };
  }
}

/** Counts for every live Resend segment, cached. Pass force=true to bypass the cache. */
export async function getAudienceCounts(force = false): Promise<AudienceCount[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!isProviderConfigured()) return [];
  const previous = cache?.data || [];
  const prevById = new Map(previous.map((row) => [row.id, row]));
  if (force) {
    cache = null;
    invalidateContactCaches();
  }

  // Managed union lists are internal plumbing — never offer them as a choice
  const segments = sortAudienceSegments((await listSegments()).filter((s) => !isManagedAudienceName(s.name)));
  const preferred = segments.filter((seg) => isPreferredAudienceName(seg.name));
  const rest = segments.filter((seg) => !isPreferredAudienceName(seg.name));

  // Preferred lists sequentially — Brokers (~760) finishes before Buyers/Sellers
  // start paging (~5k contacts) and burning the shared rate limit.
  const preferredResults: Array<{ row: AudienceCount; failed: boolean }> = [];
  for (const seg of preferred) {
    preferredResults.push(await countOne(seg, force, prevById.get(seg.id)));
  }
  const restResults = await Promise.all(rest.map((seg) => countOne(seg, force, prevById.get(seg.id))));
  const results = [...preferredResults, ...restResults];
  const data = results.map((r) => r.row);
  const anyFailed = results.some((r) => r.failed);

  if (shouldCacheAudienceCounts(data, { anyFailed })) {
    cache = { at: Date.now(), data };
  } else {
    console.error("[audience] incomplete or zero counts — not caching", {
      anyFailed,
      zeros: data.filter((d) => !d.total && !d.subscribed).map((d) => d.name),
    });
  }
  return data;
}
