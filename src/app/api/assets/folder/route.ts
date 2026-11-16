import { NextRequest, NextResponse } from "next/server";
import { workerWriteHeaders } from "@/lib/worker-auth";
import { requireUser } from "@/lib/email/auth";
import { API_BASE } from "@/lib/admin-constants";

/**
 * POST /api/assets/folder
 *
 * Creates an asset folder in Webflow (one folder per listing, named by slug).
 * If folder already exists (409), falls back to listing existing folders
 * and returning the matching one.
 *
 * Body: { name: string, parentFolder?: string }
 * Returns: { id, displayName, ... }
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json();

    const res = await fetch(`${API_BASE}/assets/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...workerWriteHeaders() },
      body: JSON.stringify(body),
    });

    // 409 = folder already exists — find it by name
    if (res.status === 409) {
      const listRes = await fetch(`${API_BASE}/assets/folders`, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!listRes.ok) {
        return NextResponse.json(
          { error: "Failed to list folders after 409" },
          { status: 500 }
        );
      }

      const listData = await listRes.json();
      const folders = listData.assetFolders || [];
      const existing = folders.find(
        (f: { displayName: string }) => f.displayName === body.name
      );

      if (existing) {
        return NextResponse.json(existing);
      }

      return NextResponse.json(
        { error: "Folder conflict but could not find existing" },
        { status: 500 }
      );
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("Folder creation failed:", res.status, text);
      return NextResponse.json(
        { error: `Worker returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Failed to create asset folder:", err);
    return NextResponse.json(
      { error: "Failed to create asset folder" },
      { status: 500 }
    );
  }
}
