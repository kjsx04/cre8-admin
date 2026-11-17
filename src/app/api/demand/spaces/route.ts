import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asBoolean, asNumber, asString, DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { saveSpaces, type SpaceInput } from "@/lib/demand/service";
import type { Deal, SpaceType } from "@/lib/demand/types";

export async function PUT(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    const listingId = String(body.listingId || "");
    if (!UUID_RE.test(listingId)) throw new DemandError("listingId is required.", 400);
    if (!Array.isArray(body.spaces)) throw new DemandError("spaces must be a list.", 400);
    const spaces: SpaceInput[] = body.spaces.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: UUID_RE.test(String(row.id || "")) ? String(row.id) : undefined,
        label: asString(row.label) || "Space",
        spaceType: String(row.spaceType || "inline") as SpaceType,
        acres: asNumber(row.acres),
        sf: asNumber(row.sf),
        driveThru: asBoolean(row.driveThru),
        deal: (asString(row.deal) || "both") as Deal,
        priceRate: asString(row.priceRate),
        status: asString(row.status),
        notes: asString(row.notes),
      };
    });
    await saveSpaces(listingId, spaces);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
