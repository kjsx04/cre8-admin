"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  PreviewField,
  PREVIEW_FOCUS_CLASS,
  extractBodyInner,
} from "@/lib/email/preview-wrapper";

interface LivePreviewFrameProps {
  /** Full HTML document (already wrapped by wrapPreviewHtml) */
  html: string;
  /** Region to outline in green, or null */
  activeField: PreviewField | null;
  /** Called when the user clicks a region in the email */
  onFieldClick?: (field: PreviewField) => void;
  className?: string;
}

/**
 * The live email preview.
 *
 * Why it's built this way:
 * - The iframe document is set ONCE (srcDoc). Re-setting srcDoc on every keystroke
 *   would reload the whole document, including the Google Fonts import, and the
 *   Bebas heading would flash on every key. Instead, on each change we swap only
 *   the <body> contents, so fonts, images and styles stay put.
 * - The iframe is same-origin (srcDoc, no sandbox), so the parent can read and
 *   listen to its document directly. No script is injected into the email HTML.
 * - Height follows the content, so the surrounding pane scrolls naturally and the
 *   iframe never shows its own scrollbar.
 */
export default function LivePreviewFrame({
  html,
  activeField,
  onFieldClick,
  className = "",
}: LivePreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The initial document — captured once so React never re-sets srcDoc
  const initialHtmlRef = useRef(html);
  const loadedRef = useRef(false);
  const [height, setHeight] = useState(600);

  // Keep the latest callback without re-binding the iframe listener
  const onFieldClickRef = useRef(onFieldClick);
  onFieldClickRef.current = onFieldClick;

  /** Measure the document and size the iframe to it */
  const syncHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.documentElement) return;
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
    if (h > 0) setHeight(h);
  }, []);

  /** Apply (or clear) the green outline on the active region */
  const applyFocus = useCallback((field: PreviewField | null) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll(`.${PREVIEW_FOCUS_CLASS}`).forEach((el) =>
      el.classList.remove(PREVIEW_FOCUS_CLASS)
    );
    if (!field) return;
    const el = doc.querySelector(`[data-field="${field}"]`);
    if (!el) return;
    el.classList.add(PREVIEW_FOCUS_CLASS);
    // Scroll the region into view in the surrounding pane (the iframe itself never scrolls)
    const iframe = iframeRef.current!;
    const pane = iframe.closest<HTMLElement>("[data-scroll-pane]");
    if (pane) {
      const elTop = (el as HTMLElement).getBoundingClientRect().top; // relative to iframe viewport == document
      const iframeTop = iframe.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
      const target = iframeTop + elTop - pane.clientHeight / 2 + 60;
      pane.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  }, []);

  /** First (and only) document load: wire click handling + image-load height updates */
  const handleLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    loadedRef.current = true;

    // Document-level listeners survive body swaps
    doc.addEventListener("click", (e) => {
      e.preventDefault(); // never follow links inside the preview
      const target = (e.target as Element | null)?.closest?.("[data-field]");
      const field = target?.getAttribute("data-field") as PreviewField | null;
      if (field) onFieldClickRef.current?.(field);
    });
    // Images loading later change the height
    doc.addEventListener("load", () => syncHeight(), true);

    syncHeight();
    applyFocus(activeField);
    // If the html prop already moved on before load finished, catch up
    if (html !== initialHtmlRef.current) {
      doc.body.innerHTML = extractBodyInner(html);
      syncHeight();
      applyFocus(activeField);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncHeight, applyFocus]);

  // Every content change after load: swap the body only
  useEffect(() => {
    if (!loadedRef.current) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.innerHTML = extractBodyInner(html);
    syncHeight();
    applyFocus(activeField); // classes were wiped with the old body
    // Images inside the new body may still be loading — re-measure shortly after
    const t = window.setTimeout(syncHeight, 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  // Focus changes on their own
  useEffect(() => {
    if (!loadedRef.current) return;
    applyFocus(activeField);
  }, [activeField, applyFocus]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={initialHtmlRef.current}
      onLoad={handleLoad}
      title="Email preview"
      className={`w-full border-0 block ${className}`}
      style={{ height, minHeight: 600 }}
    />
  );
}
