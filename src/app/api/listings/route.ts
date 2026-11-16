import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/admin-constants";
import { requireUser } from "@/lib/email/auth";

/**
 * GET /api/listings
 *
 * Proxies to the Cloudflare Worker to fetch all listings from Webflow CMS.
 * Filters out archived items before returning.
 *
 * This returned ~250 KB of live listing data to anyone on the internet until
 * the middleware landed.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

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
