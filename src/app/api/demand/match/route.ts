import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { UUID_RE } from "@/lib/demand/coerce";
import { DemandError } from "@/lib/demand/coerce";
import { jsonError } from "@/lib/demand/http";
import { getMatch } from "@/lib/demand/service";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const listingId = request.nextUrl.searchParams.get("listingId") || "";
  if (!UUID_RE.test(listingId)) return jsonError(new DemandError("listingId is required.", 400));
  try {
    return NextResponse.json(await getMatch(listingId));
  } catch (err) {
    return jsonError(err);
  }
}
