import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asString, DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { clearOverride, setOverride } from "@/lib/demand/service";

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    const listingId = String(body.listingId || "");
    const tenantId = String(body.tenantId || "");
    const spaceIds = Array.isArray(body.spaceIds) ? body.spaceIds.map(String).filter((id) => UUID_RE.test(id)) : [];
    if (!UUID_RE.test(listingId) || !UUID_RE.test(tenantId) || !spaceIds.length) {
      throw new DemandError("listingId, tenantId, and spaceIds are required.", 400);
    }
    if (body.clear === true) {
      await clearOverride(spaceIds, tenantId);
      return NextResponse.json({ ok: true });
    }
    const decision = body.decision === "include" ? "include" : body.decision === "exclude" ? "exclude" : null;
    if (!decision) throw new DemandError("decision must be include or exclude.", 400);
    await setOverride({
      listingId,
      spaceIds,
      tenantId,
      decision,
      reason: asString(body.reason) || "",
      createdBy: auth.email,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
