import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/admin-constants";
import { requireUser } from "@/lib/email/auth";
import { readListingsFromMirror, refreshMirrorIfStale } from "@/lib/listings/mirror-read";

/**
 * GET /api/listings
 *
 * FAST PATH: reads the Supabase copy of every listing (one quick query), and
 * quietly refreshes that copy from Webflow in the background if it hasn't been
 * checked in 5 minutes. See src/lib/listings/mirror-read.ts for how it stays current.
 *
 * FALLBACK: if the copy can't be read, asks the Cloudflare Worker → Webflow
 * like before. Archived items are filtered out either way.
 *
 * This returned ~250 KB of live listing data to anyone on the internet until
 * the middleware landed.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  // ── Fast path: the Supabase copy ──
  const mirrored = await readListingsFromMirror();
  if (mirrored) {
    refreshMirrorIfStale(); // catches edits made directly in Webflow
    return NextResponse.json({ items: mirrored });
  }

  // ── Fallback: live from Webflow (slow) ──
  try {
    const res = await fetch(`${API_BASE}/listings`, {
      headers: { "Content-Type": "application/json" },
      // Don't cache — always get fresh data
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Cloudflare Worker returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Filter out archived items (same as the current admin dashboard)
    const items = (data.items || []).filter(
      (item: { isArchived?: boolean }) => !item.isArchived
    );

    return NextResponse.json({ items });
  } catch (err) {
    console.error("Failed to fetch listings:", err);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}
