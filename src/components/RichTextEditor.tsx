"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { sanitizeRichText, plainTextToRichText } from "@/lib/rich-text";

/* ============================================================
   PROPS
   ============================================================ */
interface RichTextEditorProps {
  /** Current HTML content */
  value: string;
  /** Called on content change with clean HTML (p / ul / ol / li / strong / em / br only) */
  onChange: (html: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
}

/* ============================================================
   COMPONENT — contenteditable rich text editor, kept deliberately small.
   Toolbar: Bold, Italic, Bullets, Numbers.

   The rules:
   - Whatever you paste is cleaned to paragraphs, lists, bold, italic. Fonts,
     sizes, colors and Word/Docs junk are stripped, so the text always takes
     the site's formatting.
   - Lines that start with •, -, * or "1." become real list items.
   - Enter makes a new paragraph, not a <div>.
   - The saved HTML is always the clean version.
   ============================================================ */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Enter property overview...",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);
  const [active, setActive] = useState({ bold: false, italic: false, ul: false, ol: false });

  // Store onChange in ref so it's always current
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ---- Set initial content once on mount (cleaned, so old pasted junk goes away) ----
  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      const clean = sanitizeRichText(value || "");
      editorRef.current.innerHTML = clean;
      isInitialized.current = true;
      if (clean !== (value || "")) onChangeRef.current(clean);
      // Enter → <p>, not <div>
      try {
        document.execCommand("defaultParagraphSeparator", false, "p");
        document.execCommand("styleWithCSS", false, "false");
      } catch {
        /* older browsers */
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Report the current content (cleaned) to the parent */
  const emit = useCallback(() => {
    if (!editorRef.current) return;
    const raw = editorRef.current.innerHTML;
    const isEmpty = raw === "<br>" || raw === "<p><br></p>" || raw === "" || !editorRef.current.textContent?.trim();
    onChangeRef.current(isEmpty ? "" : sanitizeRichText(raw));
  }, []);

  /** Toolbar state follows the caret */
  const refreshState = useCallback(() => {
    try {
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshState);
    return () => document.removeEventListener("selectionchange", refreshState);
  }, [refreshState]);

  // ---- Paste: clean it, then insert ----
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");
      const clean = html ? sanitizeRichText(html) : plainTextToRichText(text);
      if (!clean) return;
      document.execCommand("insertHTML", false, clean);
      emit();
    },
    [emit]
  );

  // ---- Blur: rewrite the DOM with the clean version so what you see is what's saved ----
  const handleBlur = useCallback(() => {
    if (!editorRef.current) return;
    const raw = editorRef.current.innerHTML;
    const clean = sanitizeRichText(raw);
    if (clean !== raw) editorRef.current.innerHTML = clean;
    emit();
  }, [emit]);

  // ---- Toolbar actions ----
  const execCmd = useCallback(
    (cmd: string) => {
      editorRef.current?.focus();
      document.execCommand(cmd, false);
      emit();
      refreshState();
    },
    [emit, refreshState]
  );

  const btn = (on: boolean) =>
    `w-8 h-8 rounded-btn border flex items-center justify-center text-sm transition-colors ${
      on
        ? "border-green bg-[#F0F9E5] text-[#1A1A1A]"
        : "border-[#E5E5E5] text-[#666] hover:bg-[#F5F5F5] hover:text-[#333]"
    }`;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-1.5">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("bold")} className={`${btn(active.bold)} font-bold`} title="Bold (⌘B)">
          B
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("italic")} className={`${btn(active.italic)} italic`} title="Italic (⌘I)">
          I
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("insertUnorderedList")} className={`${btn(active.ul)} text-xs`} title="Bullet list">
          &#8226;&#8801;
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("insertOrderedList")} className={`${btn(active.ol)} text-[11px] font-semibold`} title="Numbered list">
          1.
        </button>
        <span className="ml-2 text-[11px] text-[#999]">Paste anything — it takes the site&apos;s formatting</span>
      </div>

      {/* Editable area — styled like the site's overview so lists and paragraphs look the same here */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={emit}
          onBlur={handleBlur}
          onPaste={handlePaste}
          onKeyUp={refreshState}
          onMouseUp={refreshState}
          className="w-full min-h-[200px] bg-white border border-[#E5E5E5] rounded-btn px-3 py-2
                     text-sm text-[#333] leading-relaxed outline-none focus:border-green transition-colors
                     [&_p]:mb-3 [&_p:last-child]:mb-0
                     [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3
                     [&_li]:mb-1 [&_strong]:font-semibold [&_strong]:text-[#1A1A1A] [&_em]:italic
                     [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[#BBB]"
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}
