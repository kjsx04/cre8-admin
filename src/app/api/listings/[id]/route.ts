import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/admin-constants";

/**
 * GET /api/listings/[id]
 *
 * Fetches a single listing by ID.
 * The Worker doesn't support single-item GET, so we fetch all and filter.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${API_BASE}/listings`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Worker returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const items = data.items || [];
    const item = items.find(
      (i: { id: string; isArchived?: boolean }) =>
        i.id === params.id && !i.isArchived
    );

    if (!item) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (err) {
    console.error("Failed to fetch listing:", err);
    return NextResponse.json(
      { error: "Failed to fetch listing" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/listings/[id]
 *
 * Updates a listing via the Cloudflare Worker proxy → Webflow PATCH.
 * Body: { fieldData: { ...fields } }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    const res = await fetch(`${API_BASE}/listings/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Worker PATCH failed:", res.status, text);
      console.error("PATCH payload was:", JSON.stringify(body).slice(0, 500));
      return NextResponse.json(
        { error: `Worker returned ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to update listing:", err);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/listings/[id]
 *
 * Deletes a listing from the Webflow CMS via the Cloudflare Worker proxy.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${API_BASE}/listings/${params.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Worker DELETE failed:", res.status, text);
      return NextResponse.json(
        { error: `Worker returned ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    // Webflow DELETE returns 204 with no body
    if (res.status === 204) {
      return NextResponse.json({ success: true });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to delete listing:", err);
    return NextResponse.json(
      { error: "Failed to delete listing" },
      { status: 500 }
    );
  }
}
