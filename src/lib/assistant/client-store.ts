/**
 * The assistant chat, on the browser side.
 *
 * It lives OUTSIDE React on purpose. Each section of the admin (Listings, Flow,
 * Docs…) mounts its own AppShell, so a component's state would be wiped every
 * time someone changes tabs, and an answer still streaming in would be lost.
 * Kept here, the conversation and any answer in progress survive:
 *   - closing the chat panel (the answer keeps coming; the bubble tells you when it's done)
 *   - moving to another page in the admin
 * It does NOT survive a page refresh. That is deliberate: the chat is never saved.
 *
 * Components read it with `useAssistant()` (useSyncExternalStore under the hood).
 */

import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { parseSseBuffer, type ChatSource } from "./sse-client";

export type { ChatSource } from "./sse-client";

// ── Types ───────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Links shown under an assistant answer. */
  sources?: ChatSource[];
  /** Lookups that failed while this answer was being written. */
  toolErrors?: string[];
  /** The whole request failed (network, rate limit, server error). */
  error?: string;
  /** Still streaming in. */
  pending?: boolean;
};

export type AssistantState = {
  messages: ChatMessage[];
  /** True while an answer is being written. */
  running: boolean;
  /** What it is doing right now ("Looking up listings…"), while running. */
  statusText: string;
  /** Is the chat panel open? */
  open: boolean;
  /** An answer finished while the panel was closed. Drives the bubble's "done" animation and badge. */
  unseen: boolean;
};

// ── The store ───────────────────────────────────────────────

/** How many earlier messages go to the server (it keeps the last 12 anyway). */
const HISTORY_TO_SEND = 12;

let state: AssistantState = { messages: [], running: false, statusText: "", open: false, unseen: false };
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
let nextId = 1;

function setState(patch: Partial<AssistantState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function updateMessage(id: string, patch: (m: ChatMessage) => Partial<ChatMessage>) {
  setState({ messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)) });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

/** Read the chat from any component. */
export function useAssistant(): AssistantState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function openAssistant() {
  // Opening the panel means the person has now seen the finished answer.
  setState({ open: true, unseen: false });
}

export function closeAssistant() {
  // Closing does NOT stop an answer in progress. That is the point.
  setState({ open: false });
}

/** Start over. Stops an answer in progress. */
export function newChat() {
  controller?.abort();
  controller = null;
  setState({ messages: [], running: false, statusText: "", unseen: false });
}

/** Stop the answer being written. Keeps what arrived so far. */
export function stopAnswer() {
  controller?.abort();
}

/** What page the person is on, so "this listing" means something to the assistant. */
function pageContext() {
  if (typeof window === "undefined") return undefined;
  const title = document.title.replace(/\s*[|·-]\s*CRE8 Admin\s*$/i, "").trim();
  return { path: window.location.pathname, label: title && title !== "CRE8 Admin" ? title : undefined };
}

/** Friendly words for an HTTP failure before the stream started. */
function httpErrorMessage(status: number, serverMessage: string): string {
  if (serverMessage) return serverMessage;
  if (status === 401) return "Your sign-in has expired. Refresh the page and try again.";
  if (status === 429) return "That's a lot of questions in a short time. Try again in a few minutes.";
  return "The assistant is not available right now. Try again in a moment.";
}

/** Send a question. Ignored while an answer is already being written. */
export async function sendMessage(text: string) {
  const question = text.trim();
  if (!question || state.running) return;

  const userMsg: ChatMessage = { id: `m${nextId++}`, role: "user", content: question };
  const answerId = `m${nextId++}`;
  const answer: ChatMessage = { id: answerId, role: "assistant", content: "", pending: true };

  // The history sent is everything before this question, minus failed answers.
  const history = state.messages
    .filter((m) => !m.error && m.content.trim())
    .slice(-HISTORY_TO_SEND)
    .map((m) => ({ role: m.role, content: m.content }));

  setState({ messages: [...state.messages, userMsg, answer], running: true, statusText: "Thinking…", unseen: false });

  controller = new AbortController();
  const signal = controller.signal;
  let finishedCleanly = false;

  try {
    const res = await apiFetch("/api/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [...history, { role: "user", content: question }], page: pageContext() }),
      signal,
    });

    if (!res.ok || !res.body) {
      let serverMessage = "";
      try {
        serverMessage = (await res.json())?.error ?? "";
      } catch {
        /* not JSON */
      }
      updateMessage(answerId, () => ({ pending: false, error: httpErrorMessage(res.status, serverMessage) }));
      return;
    }

    // Read the stream piece by piece and apply each event as it arrives.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        switch (event.type) {
          case "status":
            setState({ statusText: event.text });
            break;
          case "token":
            updateMessage(answerId, (m) => ({ content: m.content + event.text }));
            break;
          case "sources":
            updateMessage(answerId, () => ({ sources: event.sources }));
            break;
          case "tool_error":
            updateMessage(answerId, (m) => ({ toolErrors: [...(m.toolErrors ?? []), event.message] }));
            break;
          case "error":
            updateMessage(answerId, () => ({ error: event.message }));
            break;
          case "done":
            finishedCleanly = true;
            break;
        }
      }
    }
    if (!finishedCleanly) {
      const current = state.messages.find((m) => m.id === answerId);
      if (current && !current.error) {
        updateMessage(answerId, () => ({ error: "The answer was cut off. Try asking again." }));
      }
    }
  } catch (err) {
    const aborted = signal.aborted || (err instanceof DOMException && err.name === "AbortError");
    updateMessage(answerId, (m) =>
      aborted
        ? { content: m.content ? `${m.content}\n\n(Stopped.)` : "(Stopped.)" }
        : { error: "Couldn't reach the assistant. Check your connection and try again." },
    );
  } finally {
    // newChat() may have cleared the messages; only finish up if this answer is still here.
    const stillHere = state.messages.some((m) => m.id === answerId);
    if (stillHere) {
      updateMessage(answerId, () => ({ pending: false }));
      // Finished while the panel was closed: tell the bubble to celebrate.
      setState({ running: false, statusText: "", unseen: !state.open });
    }
    if (controller?.signal === signal) controller = null;
  }
}
