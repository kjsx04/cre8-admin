import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asNumber, asString, DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { locationStatus } from "@/lib/demand/location-status";
import { createLocation, listLocations, listLocationsFor } from "@/lib/demand/service";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const tenantId = new URL(request.url).searchParams.get("tenantId") || "";
  if (!UUID_RE.test(tenantId)) return jsonError(new DemandError("tenantId is required.", 400));
  try {
    return NextResponse.json(await listLocations(tenantId));
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    const tenantIds = Array.isArray(body.tenantIds) ? body.tenantIds.map((id) => String(id)).filter((id) => UUID_RE.test(id)) : [];
    if (!tenantIds.length) return NextResponse.json([]);
    return NextResponse.json(await listLocationsFor(tenantIds));
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    const tenantId = asString(body.tenantId) || "";
    const lat = asNumber(body.lat);
    const lng = asNumber(body.lng);
    if (!UUID_RE.test(tenantId) || lat == null || lng == null) {
      throw new DemandError("tenantId, lat, and lng are required.", 400);
    }
    const location = await createLocation({
      tenantId,
      lat,
      lng,
      status: locationStatus(asString(body.status)),
      address: asString(body.address),
    });
    return NextResponse.json(location);
  } catch (err) {
    return jsonError(err);
  }
}
