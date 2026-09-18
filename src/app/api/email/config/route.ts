import { NextRequest, NextResponse } from "next/server";
import { EMAIL_SENDERS, BROKER_HEADSHOTS } from "@/lib/email/constants";
import { requireUser } from "@/lib/email/auth";
import { getAudienceCounts } from "@/lib/email/audience";

// GET /api/email/config — senders + live Resend segments for the campaign form
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  let segments: { id: string; name: string; enabled: boolean }[] = [];
  try {
    const live = await getAudienceCounts();
    segments = live.map((s) => ({ id: s.id, name: s.name, enabled: true }));
  } catch (err) {
    console.error("[email/config] audience load failed:", err);
  }

  return NextResponse.json({
    senders: EMAIL_SENDERS,
    segments,
    headshots: BROKER_HEADSHOTS,
  });
}
