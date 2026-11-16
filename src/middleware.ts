/**
 * API authentication for the whole admin.
 *
 * WHAT THIS REPLACED
 * Until now every /api/* route was reachable from the public internet. Most of
 * them called requireUser(), which only checked that an `x-user-email` header
 * was PRESENT — any value passed, so `curl -H "x-user-email: anyone@any.com"`
 * was a valid admin. Sixteen route files had no check at all, including ones
 * that publish and delete listings on the live Webflow site, delete deals from
 * Supabase with the service-role key, and spend Anthropic/OpenAI tokens.
 *
 * HOW IT WORKS NOW
 * The client sends its Microsoft ID token as `Authorization: Bearer <jwt>`
 * (see src/lib/api-fetch.ts). This middleware verifies it against Azure AD's
 * published signing keys — see src/lib/verify-id-token.ts for the checks and
 * why it is the ID token and not an access token. Only a request that passes
 * reaches a route handler, carrying the verified identity in `x-cre8-user`.
 *
 * SPOOFING
 * `x-cre8-user` is what the route handlers trust, so this middleware strips any
 * inbound value on EVERY matched request — including the two it otherwise lets
 * straight through — and only ever sets it from verified token claims. A client
 * cannot inject it. The legacy `x-user-email` header is stripped for the same
 * reason.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";

/**
 * Routes that authenticate themselves and must NOT require a user token.
 *
 * - The Resend webhook is called by Resend, not by a signed-in person. It does
 *   full Svix signature verification and fails closed in production.
 * - The cron route is called by Vercel Cron with a CRON_SECRET bearer token,
 *   and also fails closed if the secret is unset.
 *
 * Both are stricter than a user check would be, so wrapping them in one would
 * only break them. Adding anything to this list reopens it to the internet —
 * the route must do its own verification first.
 */
const SELF_AUTHENTICATED = ["/api/email/webhook/resend", "/api/email/cron"];

function unauthorized(reason: string) {
  // The reason is deliberately coarse. A caller that fails auth doesn't need to
  // know which check it failed; the detail goes to the server log instead.
  return NextResponse.json({ error: "Unauthorized", reason }, { status: 401 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Start from the inbound headers, then remove anything a caller could use to
  // impersonate someone. This happens before the self-authenticated early
  // return, so those two routes can't be used as a spoofing side door either.
  const headers = new Headers(request.headers);
  headers.delete("x-cre8-user");
  headers.delete("x-user-email");

  if (SELF_AUTHENTICATED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers } });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return unauthorized("missing bearer token");

  try {
    const { email } = await verifyIdToken(token);
    headers.set("x-cre8-user", email);
    return NextResponse.next({ request: { headers } });
  } catch (err) {
    // An expired token is the common case and not worth a loud log — the
    // client refreshes and retries. Anything else is worth seeing.
    const message = err instanceof Error ? err.message : String(err);
    if (!/exp|expired/i.test(message)) {
      console.error("[auth] token verification failed:", message);
    }
    return unauthorized("invalid token");
  }
}

export const config = {
  // Every API route. Page routes are still gated client-side by AuthGate; the
  // pages themselves hold no data, so the API is the boundary that matters.
  matcher: "/api/:path*",
};
