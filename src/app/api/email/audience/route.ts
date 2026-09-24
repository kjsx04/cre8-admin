import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { getAudienceCounts } from "@/lib/email/audience";
import { loadAudienceOverlaps } from "@/lib/email/contact-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * GET /api/email/audience — live Resend segments + contact counts
 *   [{ id: "<resend-uuid>", name: "Buyers", total: 120, subscribed: 118, unsubscribed: 2 }, …]
 * Chips show `subscribed`. Cached 10 minutes. Add ?refresh=1 to force a recount.
 *
 * `overlaps` groups contacts by the exact set of lists they're on, so the
 * composer can show the real size of a multi-list send instead of adding two
 * list sizes together and double-counting everyone on both.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    const [data, overlaps] = await Promise.all([getAudienceCounts(force), loadAudienceOverlaps()]);
    return NextResponse.json(
      { data, overlaps, fetched_at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to count audience" }, { status: 500 });
  }
}
