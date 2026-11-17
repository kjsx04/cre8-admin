import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError } from "@/lib/demand/http";
import { getReverse } from "@/lib/demand/service";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const tenantId = request.nextUrl.searchParams.get("tenantId") || "";
  if (!UUID_RE.test(tenantId)) return jsonError(new DemandError("tenantId is required.", 400));
  try {
    return NextResponse.json(await getReverse(tenantId));
  } catch (err) {
    return jsonError(err);
  }
}
