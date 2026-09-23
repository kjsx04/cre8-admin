/**
 * Catches typo'd versions of domains we send to a lot.
 *
 * Real case (2026-09-22): a campaign was addressed to `kevin@cre8adivsors.com`
 * — "adivsors" instead of "advisors". It looks right at a glance and would have
 * bounced silently. One transposition away from a known domain is worth a warning.
 */

/** Domains worth protecting. Add more as they come up. */
const KNOWN_DOMAINS = ["cre8advisors.com"];

/** Levenshtein distance, capped for speed — we only care about 1-2 edits. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * The domain this address was probably meant to use, or null when it looks fine.
 *   "kevin@cre8adivsors.com" → "cre8advisors.com"
 *   "kevin@cre8advisors.com" → null  (exact match)
 *   "kevin@gmail.com"        → null  (nothing like a known domain)
 */
export function lookalikeDomain(email: string): string | null {
  const domain = (email.split("@")[1] || "").trim().toLowerCase();
  if (!domain) return null;
  for (const known of KNOWN_DOMAINS) {
    if (domain === known) return null;
    if (editDistance(domain, known) <= 2) return known;
  }
  return null;
}

/** Warning text for the composer, or null when the address looks fine. */
export function lookalikeWarning(email: string): string | null {
  const meant = lookalikeDomain(email);
  return meant ? `Did you mean @${meant}? This address may be a typo.` : null;
}
