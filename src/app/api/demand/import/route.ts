import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asString, DemandError } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { importCsv } from "@/lib/demand/service";

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    const kind = asString(body.kind);
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (kind !== "tenants" && kind !== "contacts") throw new DemandError("kind must be tenants or contacts.", 400);
    if (!csv.trim()) throw new DemandError("Paste or upload a CSV.", 400);
    if (csv.length > 1_000_000) throw new DemandError("CSV is too large.", 400);
    return NextResponse.json(await importCsv(kind, csv));
  } catch (err) {
    return jsonError(err);
  }
}
