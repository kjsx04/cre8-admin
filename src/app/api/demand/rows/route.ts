import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { jsonError } from "@/lib/demand/http";
import { listDemandRows } from "@/lib/demand/service";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const tenants = await listDemandRows();
    return NextResponse.json({ tenants });
  } catch (err) {
    return jsonError(err);
  }
}
