/**
 * API route auth helper.
 *
 * This used to read `x-user-email` straight off the request and accept any
 * non-empty value, which meant it was not authentication at all —
 * `curl -H "x-user-email: anyone@example.com"` was a valid admin.
 *
 * Verification now happens once, in src/middleware.ts, which checks the
 * caller's Microsoft ID token against Azure AD's JWKS and then sets
 * `x-cre8-user` on the forwarded request. That header is stripped from every
 * inbound request before it is set, so it cannot be spoofed by a client.
 *
 * The signature is unchanged on purpose — every existing call site still reads:
 *
 *   const auth = requireUser(request);
 *   if (auth.response) return auth.response;
 *   const email = auth.email;
 *
 * Despite living under lib/email/, this is used by every module's routes. It
 * stays here so the ~35 existing imports keep working; moving it would be a
 * rename with no behavioural benefit.
 */

import { NextRequest, NextResponse } from "next/server";

/** The header src/middleware.ts sets after verifying the caller's ID token. */
export const VERIFIED_USER_HEADER = "x-cre8-user";

/**
 * Returns the verified caller's email, or a 401 response to return immediately.
 *
 * Reaching the `!email` branch means the request bypassed the middleware, which
 * should be impossible for anything under /api/*. It is a fail-closed guard, not
 * an expected path.
 */
export function requireUser(
  request: NextRequest
): { email: string; response: null } | { email: null; response: NextResponse } {
  const email = request.headers.get(VERIFIED_USER_HEADER);
  if (!email) {
    return {
      email: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { email, response: null };
}
