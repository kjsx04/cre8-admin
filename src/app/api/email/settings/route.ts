import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { getSettings, saveSettings } from "@/lib/email/settings-server";

/**
 * GET /api/email/settings — current scheduler settings (defaults merged in)
 * PUT /api/email/settings — save a partial update
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  return NextResponse.json(await getSettings());
}

export async function PUT(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const clean: Record<string, unknown> = {};
    if (Number.isFinite(body.maxSendsPerDay)) clean.maxSendsPerDay = Math.max(1, Math.min(12, Math.round(body.maxSendsPerDay)));
    if (Number.isFinite(body.minGapMinutes)) clean.minGapMinutes = Math.max(15, Math.min(240, Math.round(body.minGapMinutes)));
    if (Array.isArray(body.noSendDates)) clean.noSendDates = body.noSendDates.filter((d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (Number.isFinite(body.spacingDays)) clean.spacingDays = Math.max(0, Math.min(60, Math.round(body.spacingDays)));
    if (Array.isArray(body.announcementLabels)) clean.announcementLabels = body.announcementLabels.filter((l: unknown) => typeof l === "string" && l.trim()).map((l: string) => l.trim());
    if (body.decay && typeof body.decay === "object") {
      clean.decay = {
        enabled: !!body.decay.enabled,
        weeklyToBiweeklyDays: Math.max(7, Math.round(Number(body.decay.weeklyToBiweeklyDays) || 60)),
        biweeklyToMonthlyDays: Math.max(14, Math.round(Number(body.decay.biweeklyToMonthlyDays) || 120)),
      };
    }
    if (Number.isFinite(body.staleAlertDays)) clean.staleAlertDays = Math.max(3, Math.min(365, Math.round(body.staleAlertDays)));
    if (Array.isArray(body.windows)) clean.windows = body.windows;
    return NextResponse.json(await saveSettings(clean));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save settings" }, { status: 500 });
  }
}
