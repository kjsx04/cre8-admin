import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { isProviderConfigured, searchContacts } from "@/lib/email/provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/email/contacts?q= — search Resend contacts by email, name, or company.
 * Case-insensitive partial match against the live (cached) contact list.
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
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to search contacts" },
      { status: 500 }
    );
  }
}
