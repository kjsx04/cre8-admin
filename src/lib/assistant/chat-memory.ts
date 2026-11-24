/**
 * Keeping the chat through a page refresh.
 *
 * The conversation is saved in this browser only (localStorage), under the
 * signed-in person's email, so a refresh mid-task doesn't lose it. Nothing is
 * saved on the server. It is wiped by:
 *   - typing /clear (or tapping New chat)
 *   - signing out
 *
 * Pure helpers here, so they are tested without a browser (chat-memory.test.ts).
 */

import type { ChatMessage } from "./client-store";

/** Only the most recent messages are kept. */
export const MAX_SAVED_MESSAGES = 60;

const KEY_PREFIX = "cre8-assistant-chat:";

export function memoryKey(email: string): string {
  return `${KEY_PREFIX}${email.trim().toLowerCase() || "unknown"}`;
}

/** Is this localStorage key one of ours? Used to wipe every saved chat on sign-out. */
export function isMemoryKey(key: string | null): boolean {
  return Boolean(key && key.startsWith(KEY_PREFIX));
}

/** Typed commands that start over. "/clear", "/new" or "/reset". */
export function isClearCommand(text: string): boolean {
  return /^\/(clear|new|reset)\s*$/i.test(text.trim());
}

/** What gets written to storage. */
export function serializeMessages(messages: ChatMessage[]): string {
  return JSON.stringify({ v: 1, messages: messages.slice(-MAX_SAVED_MESSAGES) });
}

/**
 * Read a saved chat back. Anything unreadable gives an empty chat rather than
 * an error. An answer that was still arriving when the page was refreshed is
 * marked as interrupted, because that stream is gone.
 */
export function restoreMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { v?: number; messages?: unknown };
    if (parsed?.v !== 1 || !Array.isArray(parsed.messages)) return [];
    return parsed.messages
      .filter(
        (m): m is ChatMessage =>
          Boolean(m) &&
          typeof (m as ChatMessage).id === "string" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
          typeof (m as ChatMessage).content === "string",
      )
      .slice(-MAX_SAVED_MESSAGES)
      .map((m) =>
        m.pending
          ? { ...m, pending: false, error: m.error ?? "This answer was interrupted by a page refresh. Ask again." }
          : m,
      );
  } catch {
    return [];
  }
}

/** The next free message id after a restore, so new ids never collide with saved ones. */
export function nextIdAfter(messages: ChatMessage[]): number {
  let max = 0;
  for (const m of messages) {
    const n = Number(m.id.replace(/^m/, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
