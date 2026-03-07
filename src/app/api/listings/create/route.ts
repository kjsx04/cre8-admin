import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/admin-constants";

/**
 * POST /api/listings/create
 *
 * Creates a new listing as a draft via the Cloudflare Worker → Webflow POST.
 * Body: { fieldData: { ...fields } }
 * Returns the created item with its new Webflow ID.
 *
 * Server-side duplicate check: fetches all existing listings and rejects
 * if the slug already exists. This prevents duplicate CMS items even if
 * the client-side warning is bypassed.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newSlug = (body.fieldData?.slug || "").trim().toLowerCase();

    // ---- Duplicate slug check ----
    if (newSlug) {
      try {
        const listRes = await fetch(`${API_BASE}/listings`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const items = listData.items || [];
          const existing = items.find(
            (li: { fieldData?: { slug?: string }; id?: string }) =>
              (li.fieldData?.slug || "").trim().toLowerCase() === newSlug
          );
          if (existing) {
            return NextResponse.json(
              {
                error: "DUPLICATE_SLUG",
                message: `A listing with slug "${newSlug}" already exists`,
                existingId: existing.id,
              },
              { status: 409 }
            );
          }
        }
      } catch (checkErr) {
        // Non-blocking — if the check fails, allow creation to proceed
        console.warn("Duplicate check failed, proceeding:", checkErr);
      }
    }

    // Wrap in Webflow's expected format — always create as draft
    const payload = {
      isArchived: false,
      isDraft: true,
      fieldData: body.fieldData,
    };

    const res = await fetch(`${API_BASE}/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Worker POST failed:", res.status, text);
      return NextResponse.json(
        { error: `Worker returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Failed to create listing:", err);
    return NextResponse.json(
      { error: "Failed to create listing" },
      { status: 500 }
    );
  }
}
