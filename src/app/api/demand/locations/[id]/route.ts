import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError } from "@/lib/demand/http";
import { deleteLocation } from "@/lib/demand/service";

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
