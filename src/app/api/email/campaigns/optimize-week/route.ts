import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { optimizeWeek } from "@/lib/email/scheduler";

/**
 * POST /api/email/campaigns/optimize-week — rebalance one week's sends.
 * Body: { week_start: "YYYY-MM-DD" } (a Monday). Used by the planner's "Re-optimize week" button.
 */
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const weekStart = typeof body.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start) ? body.week_start : null;
  if (!weekStart) {
    return NextResponse.json({ error: "week_start (YYYY-MM-DD) is required" }, { status: 400 });
  }

  try {
    const baseUrl = new URL(request.url).origin;
    const result = await optimizeWeek(baseUrl, weekStart);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[optimize-week] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Optimize failed" }, { status: 500 });
  }
}
