"use client";

import { apiFetch } from "@/lib/api-fetch";

/**
 * page-cache — keeps the last copy of each page's data in memory so moving
 * between Listings, Flow and Marketing is instant.
 *
 * HOW IT WORKS
 *  - When a page loads its data, it saves a copy here (setCached).
 *  - When you come back to that page, it starts from the saved copy
 *    (getCached) instead of a blank screen and a spinner, then quietly
 *    fetches fresh data in the background and swaps it in.
 *  - Right after sign-in, AppShell calls prefetchMainPages() so the other
 *    tabs are already loaded before you tap them.
 *
 * It lives in memory only (nothing is saved to the phone), so it clears when
 * the app is closed or you sign out. The data is small (dozens of listings
 * and deals), so holding it costs nothing noticeable.
 */

// url → last JSON response for that url
const cache = new Map<string, unknown>();
// url → a request already on its way, so two callers don't fetch the same thing twice
const inflight = new Map<string, Promise<unknown>>();

/** The saved copy for this url, or undefined if we haven't loaded it yet */
export function getCached<T>(url: string): T | undefined {
  return cache.get(url) as T | undefined;
}

/** Save a fresh copy (pages call this after every successful load) */
export function setCached(url: string, data: unknown) {
  cache.set(url, data);
}

/** Forget everything (on sign-out) */
export function clearPageCache() {
  cache.clear();
  inflight.clear();
}

/** Load a url into the cache in the background. Errors are ignored: the page will retry. */
function warm(url: string) {
  if (cache.has(url) || inflight.has(url)) return;
  const p = apiFetch(url)
    .then(async (res) => {
      if (res.ok) cache.set(url, await res.json());
    })
    .catch(() => {})
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
}

/** The data behind the three main tabs. Called once after sign-in. */
export const MAIN_PAGE_URLS = {
  listings: "/api/listings",
  checklists: "/api/listings/checklists?new=true",
  deals: "/api/flow/deals",
  campaigns: "/api/email/campaigns",
} as const;

export function prefetchMainPages() {
  Object.values(MAIN_PAGE_URLS).forEach(warm);
}
