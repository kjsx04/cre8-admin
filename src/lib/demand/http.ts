import { NextRequest, NextResponse } from "next/server";
import { DemandError } from "./coerce";

export function jsonError(err: unknown) {
  const status = err instanceof DemandError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Demand request failed";
  if (!(err instanceof DemandError) || status >= 500) console.error("[demand]", err);
  return NextResponse.json({ error: message }, { status });
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DemandError("Expected a JSON object.", 400);
  return body as Record<string, unknown>;
}
