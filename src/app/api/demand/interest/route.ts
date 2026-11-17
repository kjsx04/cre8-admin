import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asString, DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { setInterest } from "@/lib/demand/service";
import type { InterestStatus } from "@/lib/demand/types";

const STATUSES = new Set(["submitted", "interested", "touring", "LOI", "passed"]);

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
    const raw = asString(body.status);
    const status = raw && STATUSES.has(raw) ? (raw as InterestStatus) : null;
    if (raw && !status) throw new DemandError("Unknown interest status.", 400);
    await setInterest({ listingId, spaceIds, tenantId, status, notes: asString(body.notes) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
