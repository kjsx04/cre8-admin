import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError } from "@/lib/demand/http";
import { exportCsv, getMatch } from "@/lib/demand/service";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const listingId = request.nextUrl.searchParams.get("listingId") || "";
  if (!UUID_RE.test(listingId)) return jsonError(new DemandError("listingId is required.", 400));
  try {
    const match = await getMatch(listingId);
    const csv = exportCsv(match, request.nextUrl.searchParams.get("includeRest") === "1");
    const slug = match.listing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "listing";
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="demand-${slug}.csv"`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
