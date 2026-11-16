import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";

// GET /api/flow/listings — proxy to Cloudflare Worker to fetch CRE8 listings from Webflow CMS
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const res = await fetch("https://cre8-api-proxy.kjsx04.workers.dev/listings", {
      headers: { Accept: "application/json" },
      // Cache for 5 minutes — listings don't change often
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error("[listings] Cloudflare Worker returned", res.status);
      return NextResponse.json({ error: "Failed to fetch listings" }, { status: 502 });
    }

    const data = await res.json();

    // The Cloudflare Worker returns Webflow CMS items — extract what we need
    // Webflow item shape: { id, fieldData: { name, "street-address", "list-price", "listing-type", ... } }
    interface WebflowItem {
      id: string;
      fieldData: Record<string, unknown>;
    }

    const items: WebflowItem[] = data.items || data;

    const listings = items.map((item: WebflowItem) => {
      const f = item.fieldData || {};
      return {
        id: item.id,
        name: (f.name as string) || "",
        address: (f["street-address"] as string) || "",
        price: (f["list-price"] as string) || "",
        listing_type: (f["listing-type"] as string) || "",
      };
    });

    return NextResponse.json(listings);
  } catch (err) {
    console.error("[listings] Fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}
