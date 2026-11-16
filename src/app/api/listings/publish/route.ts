import { NextRequest, NextResponse } from "next/server";
import { workerWriteHeaders } from "@/lib/worker-auth";
import { requireUser } from "@/lib/email/auth";
import { API_BASE } from "@/lib/admin-constants";

/**
 * POST /api/listings/publish
 *
 * Publishes listing(s) to the live Webflow site via the Worker.
 * Body: { itemIds: ["id1", ...] }
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json();

    const res = await fetch(`${API_BASE}/listings/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...workerWriteHeaders() },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Publish failed:", res.status, text);
      return NextResponse.json(
        { error: `Worker returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to publish listing:", err);
    return NextResponse.json(
      { error: "Failed to publish listing" },
      { status: 500 }
    );
  }
}
