import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { syncContactMirror, mirrorStatus, backfillCompanies } from "@/lib/email/contact-mirror";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the walk is ~60 paginated Resend calls

/**
 * GET  /api/email/contacts/sync — how many contacts are mirrored and when it last ran
 * POST /api/email/contacts/sync — rebuild the mirror now (the nightly cron does this too)
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  return NextResponse.json(await mirrorStatus());
}

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    // ?companies=N fills in company names only (skips the full Resend walk)
    const only = Number(request.nextUrl.searchParams.get("companies"));
    if (Number.isFinite(only) && only > 0) {
      return NextResponse.json(await backfillCompanies(only));
    }
    const result = await syncContactMirror();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Contact sync failed" },
      { status: 500 }
    );
  }
}
