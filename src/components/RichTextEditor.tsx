"use client";

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { sanitizeRichText, plainTextToRichText } from "@/lib/rich-text";

/** What a parent can ask the editor to do from outside (the + Insert menu). */
export interface RichTextEditorHandle {
  /** Drop plain text in at the caret, or at the end if the editor was never focused */
  insertText: (text: string) => void;
}

/** Is the caret sitting inside a link right now? Drives the Link button's highlight. */
function caretInLink(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  let node: Node | null = sel.getRangeAt(0).startContainer;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "A") return true;
    node = node.parentNode;
  }
  return false;
}

/** Put https:// in front of a bare address so "cre8advisors.com" still links. */
function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url)) return `mailto:${url}`; // typed an email address
  return `https://${url}`;
}

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
   Toolbar: Bold, Italic, Bullets, Numbers, Link.

   The rules:
   - Whatever you paste is cleaned to paragraphs, lists, bold, italic. Fonts,
     sizes, colors and Word/Docs junk are stripped, so the text always takes
     the site's formatting.
   - Lines that start with •, -, * or "1." become real list items.
   - Links keep their address; anything that isn't http/https/mailto/tel
     becomes plain words.
   - Enter makes a new paragraph, not a <div>.
   - The saved HTML is always the clean version.
   ============================================================ */
const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
  value,
  onChange,
  placeholder = "Enter property overview...",
}, handleRef) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);
  const [active, setActive] = useState({ bold: false, italic: false, ul: false, ol: false, link: false });

  // Link bar: open/closed, the URL being typed, and the selection to apply it to.
  // The browser throws the selection away when focus moves to the input, so we
  // save the Range on open and put it back before running the command.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRange = useRef<Range | null>(null);

  // Where the caret last was inside this editor. Clicking a toolbar button or
  // the + menu moves focus out and the browser drops the selection, so we keep
  // our own copy and put it back before inserting anything.
  const caretRange = useRef<Range | null>(null);

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

  /** Remember the caret, but only while it's actually inside this editor */
  const rememberCaret = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    caretRange.current = range.cloneRange();
  }, []);

  /**
   * Insert plain text where the caret was.
   *
   * The + menu lives outside the editor, so by the time this runs the
   * selection is gone — we restore the remembered Range first. With nothing
   * remembered (the editor was never focused) the text goes on the end.
   */
  const insertText = useCallback(
    (text: string) => {
      const el = editorRef.current;
      if (!el || !text) return;
      el.focus();
      const sel = window.getSelection();
      const saved = caretRange.current;
      if (saved && el.contains(saved.commonAncestorContainer)) {
        sel?.removeAllRanges();
        sel?.addRange(saved);
      } else {
        // Never focused — put the caret at the very end
        const end = document.createRange();
        end.selectNodeContents(el);
        end.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(end);
      }
      // insertText keeps it as plain text, so braces stay braces
      document.execCommand("insertText", false, text);
      rememberCaret();
      emit();
    },
    [emit, rememberCaret]
  );

  useImperativeHandle(handleRef, () => ({ insertText }), [insertText]);

  /** Toolbar state follows the caret */
  const refreshState = useCallback(() => {
    rememberCaret();
    try {
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        link: caretInLink(),
      });
    } catch {
      /* ignore */
    }
  }, [rememberCaret]);

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

  /** Open the link bar, remembering what was selected before focus left the editor */
  const openLinkBar = useCallback(() => {
    const sel = window.getSelection();
    savedRange.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    setLinkUrl("");
    setLinkOpen(true);
  }, []);

  /** Put the saved selection back so execCommand knows what to act on */
  const restoreRange = useCallback(() => {
    editorRef.current?.focus();
    const range = savedRange.current;
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  /** Apply the typed URL to the saved selection */
  const applyLink = useCallback(() => {
    const url = normalizeUrl(linkUrl);
    if (!url) return;
    restoreRange();
    const sel = window.getSelection();
    // Nothing selected? Drop the address in as its own clickable text.
    if (!sel || sel.isCollapsed) {
      document.execCommand("insertHTML", false, `<a href="${url.replace(/"/g, "&quot;")}">${linkUrl.trim()}</a>`);
    } else {
      document.execCommand("createLink", false, url);
    }
    setLinkOpen(false);
    setLinkUrl("");
    savedRange.current = null;
    emit();
    refreshState();
  }, [linkUrl, restoreRange, emit, refreshState]);

  /** Strip the link around the caret, keeping the words */
  const removeLink = useCallback(() => {
    editorRef.current?.focus();
    document.execCommand("unlink", false);
    setLinkOpen(false);
    emit();
    refreshState();
  }, [emit, refreshState]);

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
        {/* Link — turns the selected words into a link, or drops one in at the caret */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (active.link ? removeLink() : openLinkBar())}
          className={`${btn(active.link || linkOpen)} text-xs`}
          title={active.link ? "Remove link" : "Add link"}
        >
          {active.link ? "⊘" : "🔗"}
        </button>
        <span className="ml-2 text-[11px] text-[#999]">Paste anything — it takes the site&apos;s formatting</span>
      </div>

      {/* Link bar — appears under the toolbar, never a browser popup */}
      {linkOpen && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); applyLink(); }
              if (e.key === "Escape") { e.preventDefault(); setLinkOpen(false); setLinkUrl(""); }
            }}
            placeholder="cre8advisors.com/listings  or  kevin@cre8advisors.com"
            className="flex-1 h-8 px-2.5 bg-white border border-[#E5E5E5] rounded-btn text-xs text-[#333] outline-none focus:border-green"
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={applyLink} className="h-8 px-3 rounded-btn bg-charcoal text-white text-xs font-medium hover:bg-black">
            Add
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setLinkOpen(false); setLinkUrl(""); }} className="h-8 px-2 text-xs text-[#666] hover:text-[#333]">
            Cancel
          </button>
        </div>
      )}

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
                     [&_a]:text-green [&_a]:underline
                     [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[#BBB]"
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
});

export default RichTextEditor;
