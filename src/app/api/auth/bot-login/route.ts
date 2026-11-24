/**
 * POST /api/auth/bot-login: password sign-in for the automation bot only.
 * People keep signing in with Microsoft. See src/lib/bot-auth.ts.
 *
 * The middleware lets this route through without a token (it is how the bot
 * gets one). It answers 404 when ADMIN_BOT_PASSWORD is unset or too short, so a
 * deployment without the variable has no bot sign-in at all.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  BOT_FAILURE_DELAY_MS,
  BOT_PASSWORD_ENV,
  BOT_PASSWORD_MIN_LENGTH,
  BotFailureLimiter,
  checkBotPassword,
  configuredBotPassword,
  signBotToken,
} from "@/lib/bot-auth";
import { BOT_EMAIL } from "@/lib/bot-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failures = new BotFailureLimiter();
let warnedShort = false;

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  const password = configuredBotPassword();
  if (!password) {
    const raw = process.env[BOT_PASSWORD_ENV];
    if (raw && !warnedShort) {
      warnedShort = true;
      console.warn(`[bot-login] ${BOT_PASSWORD_ENV} is shorter than ${BOT_PASSWORD_MIN_LENGTH} characters; bot sign-in is off.`);
    }
    return reply(404, { error: "Not found" });
  }

  const ip = clientIp(request);
  if (failures.isLocked(ip)) {
    await delay(BOT_FAILURE_DELAY_MS);
    return reply(429, { error: "Too many attempts. Try again later." });
  }

  let candidate: unknown = null;
  try {
    candidate = ((await request.json()) as { password?: unknown } | null)?.password;
  } catch {
    candidate = null;
  }

  if (!(await checkBotPassword(candidate, password))) {
    failures.recordFailure(ip);
    console.warn(`[bot-login] failed attempt from ${ip}`);
    await delay(BOT_FAILURE_DELAY_MS);
    return reply(401, { error: "Unauthorized" });
  }

  const { token, expiresAt } = await signBotToken(password);
  console.info(`[bot-login] bot signed in from ${ip}`);
  return reply(200, {
    token,
    email: BOT_EMAIL,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  });
}
