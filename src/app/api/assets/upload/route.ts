import { NextRequest, NextResponse } from "next/server";
import { workerWriteHeaders } from "@/lib/worker-auth";
import { requireUser } from "@/lib/email/auth";
import { API_BASE } from "@/lib/admin-constants";

/**
 * POST /api/assets/upload
 *
 * Gets a presigned S3 upload URL from Webflow (via Worker).
 * Client then uploads directly to S3 using the returned URL + form fields.
 *
 * Body: { fileName: string, fileHash: string, parentFolder?: string }
 * Returns: { id, hostedUrl, uploadUrl, uploadDetails: { ...S3 form fields } }
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json();

    const res = await fetch(`${API_BASE}/assets/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...workerWriteHeaders() },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Asset upload init failed:", res.status, text);
      return NextResponse.json(
        { error: `Worker returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to init asset upload:", err);
    return NextResponse.json(
      { error: "Failed to init asset upload" },
      { status: 500 }
    );
  }
}
