/**
 * Pure helpers for live Resend audience counts.
 * Kept fetch-free so we can test cache / refresh / pagination rules.
 */

export const PREFERRED_AUDIENCE_ORDER = ["brokers", "buyers", "sellers"] as const;

export type CountLike = {
  id: string;
  name: string;
  total: number;
  subscribed: number;
  unsubscribed: number;
};

export function isAudienceZero(row: Pick<CountLike, "total" | "subscribed">): boolean {
  return !row.total && !row.subscribed;
}

export function isPreferredAudienceName(name: string): boolean {
  return /^(brokers|test|buyers|sellers)$/i.test(name.trim());
}

export function sortAudienceSegments<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const order = PREFERRED_AUDIENCE_ORDER as readonly string[];
    const ai = order.indexOf(a.name.toLowerCase());
    const bi = order.indexOf(b.name.toLowerCase());
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });
}

/** Prefer a previous live count over a failed recount that would show 0. */
export function pickCountOnError<T extends CountLike>(failed: T, previous?: T | null): T {
  if (previous && !isAudienceZero(previous)) {
    return { ...previous, name: failed.name };
  }
  return failed;
}

/**
 * Cache only complete live reads. A mixed Brokers=0 + Buyers=2616 result is a
 * mid-pagination 429, not an empty Brokers list — caching it sticks 0 for 10 min.
 */
export function shouldCacheAudienceCounts<T extends CountLike>(
  rows: T[],
  opts: { anyFailed: boolean }
): boolean {
  if (rows.length === 0) return false;
  if (opts.anyFailed) return false;
  if (rows.every(isAudienceZero)) return false;
  return true;
}

/**
 * Soft-refresh when every list is 0, or when a preferred list (Brokers / Buyers /
 * Sellers) is 0 while a sibling has a live count. ?refresh=1 still works as a
 * manual bust.
 */
export function shouldSoftRefreshAudience<T extends Pick<CountLike, "name" | "total" | "subscribed">>(
  rows: T[]
): boolean {
  if (rows.length === 0) return false;
  if (rows.every(isAudienceZero)) return true;
  const preferred = rows.filter((row) => isPreferredAudienceName(row.name));
  if (preferred.length < 2) return false;
  const zeros = preferred.filter(isAudienceZero);
  const live = preferred.filter((row) => !isAudienceZero(row));
  return zeros.length > 0 && live.length > 0;
}

/** Advance GET /segments/{id}/contacts paging. Null means stop. */
export function nextContactPageCursor(opts: {
  rows: { id?: string }[];
  hasMore: boolean;
  after: string | null;
  added: number;
}): string | null {
  if (!opts.hasMore || opts.rows.length === 0) return null;
  const next = opts.rows[opts.rows.length - 1]?.id || null;
  if (!next || next === opts.after || opts.added === 0) return null;
  return next;
}

/** Wait after a Resend 429. Honors Retry-After seconds when present. */
export function retryAfterMs(attempt: number, retryAfterHeader?: string | null): number {
  const header = Number(retryAfterHeader);
  if (Number.isFinite(header) && header > 0) return Math.min(15_000, header * 1000);
  return Math.min(8000, 400 * 2 ** attempt);
}
