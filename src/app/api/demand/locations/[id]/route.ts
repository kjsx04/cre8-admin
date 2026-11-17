import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asString, DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { locationStatus } from "@/lib/demand/location-status";
import { deleteLocation, updateLocationStatus } from "@/lib/demand/service";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(new DemandError("Unknown location.", 400));
  try {
    const body = await readJson(request);
    const location = await updateLocationStatus(params.id, locationStatus(asString(body.status)));
    return NextResponse.json(location);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(new DemandError("Unknown location.", 400));
  try {
    await deleteLocation(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
