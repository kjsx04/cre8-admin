import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { jsonError, readJson } from "@/lib/demand/http";
import { createTenant } from "@/lib/demand/service";
import { tenantWrite } from "@/lib/demand/write";

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const id = await createTenant(tenantWrite(await readJson(request)));
    return NextResponse.json({ id });
  } catch (err) {
    return jsonError(err);
  }
}
