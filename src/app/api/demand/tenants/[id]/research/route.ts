import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { saveDealResearch } from "@/lib/demand/service";
import { dealFlags } from "@/lib/demand/write";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(new DemandError("Unknown tenant.", 400));
  try {
    await saveDealResearch(params.id, dealFlags(await readJson(request)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
