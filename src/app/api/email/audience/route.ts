import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { getAudienceCounts } from "@/lib/email/audience";

/**
 * GET /api/email/audience — live Resend segments + contact counts
 *   [{ id: "<resend-uuid>", name: "Buyers", total: 120, subscribed: 118, unsubscribed: 2 }, …]
 * Cached server-side for 10 minutes. Add ?refresh=1 to force a recount.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    const data = await getAudienceCounts(force);
    return NextResponse.json({ data, fetched_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to count audience" }, { status: 500 });
  }
}
