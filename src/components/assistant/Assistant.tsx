"use client";

/**
 * The CRE8 Assistant: the floating orb (bottom-right on every page) and the chat it opens.
 *
 *   Phone:   tap the orb → the chat slides up full screen. Close it any time; an answer
 *            in progress keeps coming. The orb spins fast while it works, then pops and
 *            ripples with a green dot when the answer is ready. Tap to read it.
 *   Desktop: the chat docks as a panel on the right. Same behaviour.
 *
 * Mounted once in AppShell. The conversation itself lives in
 * src/lib/assistant/client-store.ts so it survives closing the panel and changing pages.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, ChevronDown, RotateCcw, Square, X } from "lucide-react";
import { cn, FOCUS_RING } from "@/components/ui/cn";
import {
  closeAssistant,
  newChat,
  openAssistant,
  sendMessage,
  stopAnswer,
  useAssistant,
} from "@/lib/assistant/client-store";
import AssistantMessage from "./AssistantMessage";
import AssistantOrb, { type OrbState } from "./AssistantOrb";

const SUGGESTIONS = [
  "Which listings are live in Mesa?",
  "What deals are in due diligence or closing?",
  "How do I publish a listing?",
];

export default function Assistant() {
  const { open, running, unseen } = useAssistant();
  const pathname = usePathname();

  // Not on the bot sign-in screen.
  if (pathname?.startsWith("/bot-login")) return null;

  const orbState: OrbState = running ? "thinking" : unseen ? "done" : "idle";

  return (
    <>
      {/* ── The floating orb ── hidden while the chat is open */}
      {!open && (
        <button
          type="button"
          onClick={openAssistant}
          aria-label={running ? "CRE8 Assistant (working on an answer)" : unseen ? "CRE8 Assistant (answer ready)" : "Open CRE8 Assistant"}
          title="CRE8 Assistant"
          className={cn(
            "orb-button fixed z-40 right-4 md:right-6 rounded-pill animate-fade-in",
            // Sits above the iPhone home bar.
            "bottom-[calc(16px+env(safe-area-inset-bottom))] md:bottom-6",
            FOCUS_RING,
          )}
        >
          <AssistantOrb state={orbState} size={56} />
          {/* Green dot: an answer finished while the chat was closed */}
          {unseen && !running && (
            <span className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-pill bg-accent ring-2 ring-white" />
          )}
        </button>
      )}

      {open && <ChatPanel />}
    </>
  );
}

function ChatPanel() {
  const { messages, running, statusText } = useAssistant();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Follow the answer as it streams, unless the person scrolled up to read.
  const stickToBottom = useRef(true);

  const last = messages[messages.length - 1];
  const waitingForFirstWords = running && last?.role === "assistant" && !last.content;

  // Esc closes the chat (the answer keeps coming).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAssistant();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the box on desktop. On a phone, wait for a tap so the keyboard doesn't jump up.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  // Keep the newest text in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, statusText]);

  // Start at the bottom when reopened.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // The text box grows with what's typed, up to about 6 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function submit(text = draft) {
    if (!text.trim() || running) return;
    stickToBottom.current = true;
    setDraft("");
    void sendMessage(text);
  }

  return (
    <>
      {/* Desktop: a light backdrop that closes the panel when clicked. Phone: the panel covers everything. */}
      <div className="hidden md:block fixed inset-0 z-50 bg-black/10 animate-fade-in" onClick={closeAssistant} aria-hidden="true" />

      <section
        role="dialog"
        aria-label="CRE8 Assistant"
        className={cn(
          "fixed z-50 m-0 flex flex-col bg-canvas",
          // Phone: full screen, sized to the visible area so the keyboard doesn't hide the box.
          "inset-0 h-dvh animate-slide-up",
          // Desktop: docked on the right.
          "md:inset-auto md:top-0 md:right-0 md:bottom-0 md:h-auto md:w-full md:max-w-md md:border-l md:border-border md:shadow-modal md:animate-slide-in-right",
        )}
      >
        {/* ── Header ── */}
        <header className="flex items-center gap-3 px-4 h-14 border-b border-border bg-surface pt-[env(safe-area-inset-top)] box-content">
          <AssistantOrb state={running ? "thinking" : "idle"} size={28} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-text leading-tight">CRE8 Assistant</h2>
            <p className="text-xs text-text-3 truncate">{running ? statusText || "Working…" : "Listings, deals and how-tos · read-only"}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={newChat}
              aria-label="New chat"
              title="New chat"
              className={cn("inline-flex items-center gap-1.5 h-control-sm px-2.5 rounded-control text-sm text-text-2 hover:bg-surface-2 hover:text-text transition-colors", FOCUS_RING)}
            >
              <RotateCcw size={14} />
              {/* Icon only on phones, so the header doesn't crowd the title */}
              <span className="hidden sm:inline">New chat</span>
            </button>
          )}
          <button
            type="button"
            onClick={closeAssistant}
            aria-label={running ? "Close (the answer keeps coming)" : "Close"}
            title={running ? "Close. The answer keeps coming." : "Close"}
            className={cn("inline-flex items-center justify-center w-control h-control rounded-control text-text-2 hover:bg-surface-2 hover:text-text transition-colors", FOCUS_RING)}
          >
            {/* A down chevron on phones reads as "minimize"; an X on desktop. */}
            <ChevronDown size={20} className="md:hidden" />
            <X size={18} className="hidden md:block" />
          </button>
        </header>

        {/* ── Messages ── */}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 space-y-5"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 pb-8">
              <AssistantOrb state="idle" size={88} />
              <div>
                <p className="text-md font-semibold text-text">How can I help?</p>
                <p className="text-sm text-text-2 mt-1 max-w-xs">Ask about CRE8 listings, your deals, or how to do something in the admin.</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className={cn("text-left text-sm text-text-2 bg-surface border border-border rounded-card px-3 py-2.5 hover:bg-surface-2 hover:text-text transition-colors", FOCUS_RING)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <AssistantMessage key={m.id} message={m} />)
          )}

          {/* While it looks things up, before any words arrive */}
          {waitingForFirstWords && (
            <div className="flex items-center gap-2.5 animate-fade-in">
              <AssistantOrb state="thinking" size={20} />
              <span className="assistant-shimmer text-sm font-medium">{statusText || "Thinking…"}</span>
            </div>
          )}
        </div>

        {/* ── Input ── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="border-t border-border bg-surface px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]"
        >
          <div className="flex items-end gap-2 rounded-modal border border-border-strong bg-surface px-3 py-2 focus-within:border-text-3 transition-colors">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter adds a line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={running ? "Working on your answer…" : "Ask about a listing, a deal, or how to…"}
              // 16px on phones stops iOS from zooming the page when the box is tapped.
              className="flex-1 resize-none bg-transparent text-md md:text-base text-text placeholder:text-text-3 outline-none py-1 max-h-40"
              aria-label="Message the CRE8 Assistant"
            />
            {running ? (
              <button
                type="button"
                onClick={stopAnswer}
                aria-label="Stop"
                title="Stop"
                className={cn("inline-flex items-center justify-center h-8 w-8 rounded-pill bg-surface-2 text-text hover:bg-border transition-colors shrink-0", FOCUS_RING)}
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send"
                title="Send"
                className={cn("inline-flex items-center justify-center h-8 w-8 rounded-pill bg-ink text-white hover:bg-ink-hover disabled:opacity-30 transition-colors shrink-0", FOCUS_RING)}
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
          <p className="text-label normal-case tracking-normal text-text-3 text-center mt-2">
            Read-only. Answers can be wrong. Check anything important.
          </p>
        </form>
      </section>
    </>
  );
}
