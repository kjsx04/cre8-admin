import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError } from "@/lib/demand/http";
import { getMap } from "@/lib/demand/service";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const listingId = request.nextUrl.searchParams.get("listingId") || "";
  if (!UUID_RE.test(listingId)) return jsonError(new DemandError("listingId is required.", 400));
  try {
    return NextResponse.json(await getMap(listingId));
  } catch (err) {
    return jsonError(err);
  }
}
