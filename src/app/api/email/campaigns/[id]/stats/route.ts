import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { campaignStats } from "@/lib/email/stats";

/** GET /api/email/campaigns/[id]/stats — delivery/open/click counts from Resend events */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await campaignStats(params.id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Stats failed" }, { status: 500 });
  }
}
