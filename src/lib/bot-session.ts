"use client";

/**
 * The automation bot's session in the browser. It is not a Microsoft login:
 * the token comes from /bot-login and is kept in localStorage so a new tab
 * stays signed in. The password itself is never stored.
 */

import { useEffect, useState } from "react";
import { BOT_EMAIL } from "@/lib/bot-identity";

const STORAGE_KEY = "cre8-admin-bot-session";
const SESSION_EVENT = "cre8-admin-bot-session";

export type BotSession = { token: string; email: string; expiresAt: number };

function notify() {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function storeBotSession(token: string, expiresAtIso: string): void {
  const session: BotSession = { token, email: BOT_EMAIL, expiresAt: new Date(expiresAtIso).getTime() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  notify();
}

export function clearBotSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

/** The live bot session, or null. An expired one is removed. */
export function readBotSession(): BotSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as BotSession;
    if (typeof session.token === "string" && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now() + 60_000) {
      return session;
    }
  } catch {
    // Unreadable means unusable; fall through and clear it.
  }
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

export function useBotSession(): BotSession | null {
  const [session, setSession] = useState<BotSession | null>(() => readBotSession());

  useEffect(() => {
    const sync = () => setSession(readBotSession());
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    const timer = window.setInterval(sync, 60_000);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.clearInterval(timer);
    };
  }, []);

  return session;
}

/** Same-origin path only, so ?next= cannot send the bot off-site. */
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return "/";
  return raw;
}
