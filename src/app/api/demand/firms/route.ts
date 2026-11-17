import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asString } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { saveFirm } from "@/lib/demand/service";

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    await saveFirm({ name: asString(body.name) || "", website: asString(body.website), notes: asString(body.notes) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
