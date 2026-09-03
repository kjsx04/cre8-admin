/**
 * Email API auth helper.
 *
 * The admin portal is MSAL-protected on the client. API routes trust the
 * `x-user-email` header the client sends (same convention as /api/flow and
 * /api/listings). Every email route that changes data must call requireUser().
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Returns the caller's email, or a 401 response to return immediately.
 * Usage:
 *   const auth = requireUser(request);
 *   if (auth.response) return auth.response;
 *   const email = auth.email;
 */
export function requireUser(request: NextRequest): { email: string; response: null } | { email: null; response: NextResponse } {
  const email = request.headers.get("x-user-email");
  if (!email) {
    return {
      email: null,
      response: NextResponse.json({ error: "Missing x-user-email header" }, { status: 401 }),
    };
  }
  return { email, response: null };
}
