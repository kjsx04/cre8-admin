/**
 * When to renew the Microsoft ID token before sending it. Pure, so it is tested
 * without MSAL (id-token-expiry.test.ts). Used by src/lib/api-fetch.ts.
 */

/** Renew this long before the token actually expires, so it can't lapse in flight. */
export const REFRESH_MARGIN_SECONDS = 5 * 60;

/**
 * True when a token expiring at `exp` (seconds since 1970) should be renewed now.
 * A token with no readable expiry is renewed too: better one extra refresh than a 401.
 */
export function idTokenNeedsRefresh(exp: number | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (typeof exp !== "number" || !Number.isFinite(exp)) return true;
  return exp - nowSeconds <= REFRESH_MARGIN_SECONDS;
}

/**
 * Sending someone to sign in again is allowed at most once every 2 minutes. If
 * they come straight back and the server still says no, something else is wrong
 * (not an expired session), and bouncing them to Microsoft forever would hide it.
 */
export const SIGN_IN_REDIRECT_COOLDOWN_MS = 2 * 60 * 1000;

export function signInRedirectAllowed(lastAttemptMs: number | null, nowMs = Date.now()): boolean {
  if (lastAttemptMs === null || !Number.isFinite(lastAttemptMs)) return true;
  return nowMs - lastAttemptMs >= SIGN_IN_REDIRECT_COOLDOWN_MS;
}
