import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { isProviderConfigured, searchContacts, lookupContactByEmail } from "@/lib/email/provider";
import { searchMirror, hydrateCompanies } from "@/lib/email/contact-mirror";
import { contactSearchScore } from "@/lib/email/contact-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LIMIT = 12;

/**
 * GET /api/email/contacts?q= — search contacts by email, name, or company.
 *
 * Reads the local mirror in Supabase (rebuilt nightly by /api/email/cron), so a
 * search is one indexed query instead of ~60 paginated Resend calls. Two fallbacks:
 *   - exact email typed → also ask Resend directly, so a contact added today is found
 *   - mirror empty (never synced) → fall back to the old live Resend search
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ data: [] });

  const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate" };

  try {
    const hits = await searchMirror(q, LIMIT);

    // Typed a full email that isn't mirrored yet — ask Resend for just that one
    if (EMAIL_RE.test(q.toLowerCase()) && !hits.some((h) => h.email === q.toLowerCase())) {
      if (isProviderConfigured()) {
        const exact = await lookupContactByEmail(q.toLowerCase()).catch(() => null);
        if (exact) hits.unshift({ ...exact, segment_ids: [] });
      }
    }

    if (hits.length > 0) {
      const ranked = hits
        .sort((a, b) => contactSearchScore(b, q) - contactSearchScore(a, q))
        .slice(0, LIMIT);
      // Company isn't in Resend's list payload — fill it for just these rows (cached after)
      const withCompany = await hydrateCompanies(ranked);
      return NextResponse.json({ data: withCompany, source: "mirror" }, { headers: noStore });
    }

    // Mirror has nothing (first run, or a genuinely empty search) — try live Resend
    if (!isProviderConfigured()) return NextResponse.json({ data: [] }, { headers: noStore });
    const live = await searchContacts(q);
    return NextResponse.json({ data: live, source: "resend" }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to search contacts" },
      { status: 500 }
    );
  }
}
