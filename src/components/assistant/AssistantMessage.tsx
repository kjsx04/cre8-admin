"use client";

/**
 * One chat message. The assistant writes plain text with a little markdown
 * (**bold**, "- " bullets, "1. " numbered lines). This renders just that, as
 * React elements, never as raw HTML, so nothing in an answer can inject markup.
 */

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ExternalLink } from "lucide-react";
import { closeAssistant, isAdminPath, type ChatMessage } from "@/lib/assistant/client-store";

/** http(s) links open in a new tab; nothing else (javascript:, data:…) is ever a link. */
const isWebUrl = (href: string) => /^https?:\/\//i.test(href);

/**
 * A link in an answer or a source chip.
 *   Admin page ("/flow?deal=…") → opens right here. On a phone the chat closes so you see the page.
 *   Website ("https://…")       → opens in a new tab.
 * Anything else renders as plain text.
 */
export function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  if (isAdminPath(href)) {
    return (
      <Link
        href={href}
        className={className}
        onClick={() => {
          if (window.matchMedia("(max-width: 767px)").matches) closeAssistant();
          window.dispatchEvent(new CustomEvent("cre8-assistant-navigate", { detail: href }));
        }}
      >
        {children}
      </Link>
    );
  }
  if (isWebUrl(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return <span className={className}>{children}</span>;
}

const LINK_CLASS = "text-accent-strong underline underline-offset-2 decoration-accent/50 hover:decoration-accent-strong";

/** **bold**, [text](url) and bare https:// links. Everything else stays text. */
function inline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const md = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (md) {
      return (
        <SmartLink key={key} href={md[2]} className={LINK_CLASS}>
          {md[1].replace(/\*\*/g, "")}
        </SmartLink>
      );
    }
    if (/^https?:\/\//.test(part)) {
      // A bare URL: drop trailing punctuation from the link itself.
      const url = part.replace(/[.,;:!?]+$/, "");
      return (
        <span key={key}>
          <SmartLink href={url} className={LINK_CLASS}>{url}</SmartLink>
          {part.slice(url.length)}
        </span>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

/** Group lines into paragraphs and lists. */
function renderText(text: string) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p${blocks.length}`} className="whitespace-pre-wrap">
          {inline(para.join("\n"), `p${blocks.length}`)}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item, i) => <li key={i}>{inline(item, `li${blocks.length}-${i}`)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={`l${blocks.length}`} className="list-decimal pl-5 space-y-1">{items}</ol>
        ) : (
          <ul key={`l${blocks.length}`} className="list-disc pl-5 space-y-1">{items}</ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      // Drop markdown heading marks; keep the words.
      para.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export default function AssistantMessage({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[85%] rounded-modal rounded-br-control bg-ink text-white px-3.5 py-2.5 text-md md:text-base whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-slide-up">
      {/* Lookups that failed: shown loudly, so a failure is never read as "not found". */}
      {message.toolErrors?.length ? (
        <div className="flex items-start gap-2 rounded-control bg-warning-bg text-warning-fg px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-px shrink-0" />
          <span>{message.toolErrors[message.toolErrors.length - 1]}</span>
        </div>
      ) : null}

      {message.content ? (
        <div className="text-md md:text-base text-text space-y-2 break-words">{renderText(message.content)}</div>
      ) : null}

      {message.error ? (
        <div className="flex items-start gap-2 rounded-control bg-danger-bg text-danger-fg px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-px shrink-0" />
          <span>{message.error}</span>
        </div>
      ) : null}

      {/* Where the answer came from. Internal links open in the admin. */}
      {!message.pending && message.sources?.length ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {message.sources.map((s, i) =>
            s.href ? (
              <SmartLink
                key={i}
                href={s.href}
                className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs text-text-2 hover:bg-surface-2 hover:text-text transition-colors"
              >
                {s.label}
                {/* Arrow out of the box = opens a new tab; plain arrow = a page in the admin */}
                {isWebUrl(s.href) ? <ExternalLink size={12} /> : <ArrowUpRight size={12} />}
              </SmartLink>
            ) : (
              <span key={i} className="inline-flex items-center rounded-pill border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-3">
                {s.label}
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
