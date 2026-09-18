import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { isProviderConfigured, searchContacts } from "@/lib/email/provider";

/**
 * GET /api/email/contacts?q= — search Resend contacts by email or name.
 * Exact emails use a single lookup; other queries scan the first few pages.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const q = request.nextUrl.searchParams.get("q") || "";
  if (q.trim().length < 2) return NextResponse.json({ data: [] });

  try {
    const data = await searchContacts(q);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to search contacts" },
      { status: 500 }
    );
  }
}
