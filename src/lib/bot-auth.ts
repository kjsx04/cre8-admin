/**
 * Server side of the automation bot's sign-in (see src/app/bot-login).
 *
 * One secret, ADMIN_BOT_PASSWORD, set only in Vercel. It is never logged,
 * returned or stored anywhere else. When it is unset, or too short to resist
 * guessing, bot sign-in is off and every bot token is rejected.
 *
 * The session token is an HS256 JWT signed with a key derived from the
 * password, so changing the password signs every bot out. Microsoft ID tokens
 * are RS256 and are never accepted here.
 *
 * Uses Web Crypto and jose only, because src/middleware.ts runs on the Edge
 * runtime where node:crypto is not available.
 */

import { jwtVerify, SignJWT } from "jose";
import { BOT_EMAIL } from "@/lib/bot-identity";

export const BOT_PASSWORD_ENV = "ADMIN_BOT_PASSWORD";
export const BOT_PASSWORD_MIN_LENGTH = 24;
export const BOT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const BOT_TOKEN_ISSUER = "cre8-admin/bot-login";
const BOT_TOKEN_AUDIENCE = "cre8-admin";
const BOT_TOKEN_SUBJECT = "admin-bot";
const KEY_CONTEXT = "cre8-admin bot session v1";

export const BOT_FAILURE_LIMIT = 5;
export const BOT_GLOBAL_FAILURE_LIMIT = 25;
export const BOT_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const BOT_FAILURE_DELAY_MS = 1000;

/**
 * Write routes the bot may call. Everything else that is not a GET/HEAD is
 * refused, which keeps it away from Resend sends, Webflow publishing,
 * SharePoint and every database write.
 */
export const BOT_WRITE_ALLOWLIST = ["/api/assistant/chat"];

const encoder = new TextEncoder();

/** The configured password, or null when bot sign-in is off. */
export function configuredBotPassword(raw = process.env[BOT_PASSWORD_ENV]): string | null {
  if (!raw || raw.length < BOT_PASSWORD_MIN_LENGTH) return null;
  return raw;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Compares hashes of both values, so the comparison time does not depend on the password. */
export async function checkBotPassword(candidate: unknown, configured: string | null): Promise<boolean> {
  if (!configured || typeof candidate !== "string" || candidate.length === 0) return false;
  const [a, b] = await Promise.all([sha256(candidate), sha256(configured)]);
  return constantTimeEqual(a, b);
}

const keyCache = new Map<string, Uint8Array>();

async function signingKey(password: string): Promise<Uint8Array> {
  const digest = await sha256(password);
  const cacheKey = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  const hit = keyCache.get(cacheKey);
  if (hit) return hit;
  const hmacKey = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const key = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(KEY_CONTEXT)));
  keyCache.clear();
  keyCache.set(cacheKey, key);
  return key;
}

export async function signBotToken(
  password: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = nowSeconds + BOT_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ email: BOT_EMAIL, cre8_bot: true })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(BOT_TOKEN_ISSUER)
    .setAudience(BOT_TOKEN_AUDIENCE)
    .setSubject(BOT_TOKEN_SUBJECT)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(expiresAt)
    .sign(await signingKey(password));
  return { token, expiresAt };
}

/** The bot's email when the token is a valid bot token, otherwise null. Never throws. */
export async function verifyBotToken(
  token: string,
  password: string | null,
  currentDate?: Date,
): Promise<string | null> {
  if (!password || !token) return null;
  try {
    const { payload } = await jwtVerify(token, await signingKey(password), {
      algorithms: ["HS256"],
      issuer: BOT_TOKEN_ISSUER,
      audience: BOT_TOKEN_AUDIENCE,
      subject: BOT_TOKEN_SUBJECT,
      currentDate,
    });
    if (payload.cre8_bot !== true || payload.email !== BOT_EMAIL) return null;
    return BOT_EMAIL;
  } catch {
    return null;
  }
}

/** Whether the bot may make this API call. */
export function botMayCall(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  const path = pathname.replace(/\/+$/, "");
  return BOT_WRITE_ALLOWLIST.includes(path);
}

/**
 * Failed sign-ins in a sliding window, per IP and across all IPs. Lives in the
 * function instance's memory, so it resets on a cold start and is not shared
 * between instances; the minimum password length is what makes guessing
 * hopeless, this only slows it down.
 */
export class BotFailureLimiter {
  private hits = new Map<string, number[]>();
  private all: number[] = [];

  constructor(
    private perIp = BOT_FAILURE_LIMIT,
    private global = BOT_GLOBAL_FAILURE_LIMIT,
    private windowMs = BOT_FAILURE_WINDOW_MS,
  ) {}

  private prune(now: number) {
    this.all = this.all.filter((t) => now - t < this.windowMs);
    this.hits.forEach((times, ip) => {
      const recent = times.filter((t) => now - t < this.windowMs);
      if (recent.length) this.hits.set(ip, recent);
      else this.hits.delete(ip);
    });
  }

  /** True when this IP (or everyone) is locked out right now. Checked before the password. */
  isLocked(ip: string, now = Date.now()): boolean {
    this.prune(now);
    return (this.hits.get(ip)?.length ?? 0) >= this.perIp || this.all.length >= this.global;
  }

  recordFailure(ip: string, now = Date.now()): void {
    this.prune(now);
    this.hits.set(ip, [...(this.hits.get(ip) ?? []), now]);
    this.all.push(now);
  }
}
