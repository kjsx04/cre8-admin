"use client";

/**
 * The CRE8 Assistant: the floating orb (bottom-right on every page) and the chat it opens.
 *
 *   Phone:   tap the orb → the chat slides up full screen. Close it any time; an answer
 *            in progress keeps coming. The orb spins fast while it works, then pops and
 *            ripples with a green dot when the answer is ready. Tap to read it.
 *   Desktop: the chat floats bottom-right, inset from the edges, a third of the
 *            screen tall. Expand makes it full height. It stays up (through page
 *            changes and refreshes) until Minimize sends it back to the orb.
 *
 * Mounted once at the root (src/app/layout.tsx), above every page and every modal,
 * so it never disappears or reloads as you move around the admin. The conversation
 * lives in src/lib/assistant/client-store.ts and is kept through a refresh until
 * /clear, New chat or sign-out.
 */

import { useEffect, useRef, useState } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { useBotSession } from "@/lib/bot-session";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Maximize2, Minimize2, Minus, RotateCcw, Square } from "lucide-react";
import { cn, FOCUS_RING } from "@/components/ui/cn";
import {
  closeAssistant,
  newChat,
  openAssistant,
  setAssistantNavigator,
  sendMessage,
  stopAnswer,
  toggleExpanded,
  useAssistant,
} from "@/lib/assistant/client-store";
import { isClearCommand } from "@/lib/assistant/chat-memory";
import AssistantMessage from "./AssistantMessage";
import AssistantOrb, { type OrbState } from "./AssistantOrb";

const SUGGESTIONS = [
  "Which listings are live in Mesa?",
  "What deals are in due diligence or closing?",
  "How do I publish a listing?",
];

// The orb looks small but the tap area stays 44px (Apple's minimum for a finger).
const ORB_SIZE = 16;

export default function Assistant() {
  const { open, running, unseen } = useAssistant();
  const pathname = usePathname();
  const isAuthenticated = useIsAuthenticated();
  const botSession = useBotSession();
  // An off-screen text box focused in the same tap that opens the chat. iPhones only
  // raise the keyboard for a focus that happens inside the tap itself; the chat box
  // then takes the focus over and the keyboard stays up.
  const keyboardProxy = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Let the assistant move the page ("take me there"). Flow listens for the event
  // so /flow?deal=… opens the deal even when Flow is already on screen.
  useEffect(() => {
    setAssistantNavigator((href) => {
      router.push(href);
      window.dispatchEvent(new CustomEvent("cre8-assistant-navigate", { detail: href }));
    });
    return () => setAssistantNavigator(null);
  }, [router]);

  // Signed-in staff only, and not on the bot sign-in screen.
  if ((!isAuthenticated && !botSession) || pathname?.startsWith("/bot-login")) return null;

  function launch() {
    keyboardProxy.current?.focus();
    openAssistant();
  }

  const orbState: OrbState = running ? "thinking" : unseen ? "done" : "idle";

  return (
    <>
      <input
        ref={keyboardProxy}
        aria-hidden="true"
        tabIndex={-1}
        // 16px so iOS doesn't zoom; off-screen and invisible.
        className="fixed -left-[9999px] top-0 h-px w-px opacity-0 text-md"
      />

      {/* ── The orb ── on every page, above everything. The open chat takes its place. */}
      {!open && (
        <button
          type="button"
          onClick={launch}
          aria-label={running ? "CRE8 Assistant (working on an answer)" : unseen ? "CRE8 Assistant (answer ready)" : "Open CRE8 Assistant"}
          title="CRE8 Assistant"
          className={cn(
            // A 44px tap area with the small orb centered in it, tucked into the corner.
            "orb-button fixed z-[70] right-1 md:right-2 h-11 w-11 flex items-center justify-center rounded-pill",
            // Sits above the iPhone home bar.
            "bottom-[calc(4px+env(safe-area-inset-bottom))] md:bottom-2",
            FOCUS_RING,
          )}
        >
          <AssistantOrb state={orbState} size={ORB_SIZE} />
          {/* Green dot: an answer finished while the chat was closed */}
          {unseen && !running && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-pill bg-accent ring-2 ring-white" />
          )}
        </button>
      )}

      {open && <ChatPanel />}
    </>
  );
}

function ChatPanel() {
  const { messages, running, statusText, expanded } = useAssistant();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Follow the answer as it streams, unless the person scrolled up to read.
  const stickToBottom = useRef(true);

  const last = messages[messages.length - 1];
  const waitingForFirstWords = running && last?.role === "assistant" && !last.content;

  // Ready to type the moment it opens. On phones the keyboard is already up (see launch()).
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Keep the newest text in view (also after Expand / collapse changes the height).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, statusText, expanded]);

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
    // /clear works even mid-answer; anything else waits for the answer to finish.
    if (!text.trim() || (running && !isClearCommand(text))) return;
    stickToBottom.current = true;
    setDraft("");
    void sendMessage(text);
  }

  return (
    <>
      <section
        role="dialog"
        aria-label="CRE8 Assistant"
        className={cn(
          "fixed z-[70] m-0 flex flex-col bg-canvas",
          // Phone: full screen, sized to the visible area so the keyboard doesn't hide the box.
          "inset-0 h-dvh animate-slide-up",
          // Desktop: floats bottom-right, inset 16px from the edges, rounded with a shadow so it sits
          // on top of the page. No backdrop: the page behind stays usable.
          "md:inset-auto md:right-4 md:bottom-4 md:w-full md:max-w-md md:rounded-modal md:border md:border-border md:shadow-modal md:overflow-hidden md:animate-slide-up",
          // A third of the screen (never so short the last reply can't show), or full height when expanded.
          expanded ? "md:top-4 md:h-auto" : "md:h-[max(33.333vh,360px)]",
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
          {/* Expand to full height / back to a third. Desktop only: on a phone it is already full screen. */}
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? "Shrink" : "Expand"}
            title={expanded ? "Shrink" : "Expand"}
            className={cn("hidden md:inline-flex items-center justify-center w-control-sm h-control-sm rounded-control text-text-2 hover:bg-surface-2 hover:text-text transition-colors", FOCUS_RING)}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {/* Minimize: back down to the orb. An answer in progress keeps coming. */}
          <button
            type="button"
            onClick={closeAssistant}
            aria-label={running ? "Minimize (the answer keeps coming)" : "Minimize"}
            title={running ? "Minimize. The answer keeps coming." : "Minimize"}
            className={cn("inline-flex items-center justify-center w-control h-control md:w-control-sm md:h-control-sm rounded-control text-text-2 hover:bg-surface-2 hover:text-text transition-colors", FOCUS_RING)}
          >
            <Minus size={18} />
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
            <div className={cn("min-h-full flex flex-col items-center justify-center text-center gap-4 pb-8", !expanded && "md:gap-3 md:pb-0")}>
              <span className={cn(!expanded && "md:hidden")}>
                <AssistantOrb state="idle" size={88} />
              </span>
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
              placeholder={running ? "Working on your answer… (/clear to start over)" : "Ask anything. /clear starts over."}
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
            Read-only. Kept in this browser until /clear. Check anything important.
          </p>
        </form>
      </section>
    </>
  );
}
