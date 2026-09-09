/**
 * Rich text cleaner for the Property Overview editor.
 *
 * Anything pasted or typed ends up as this and only this:
 *   <p>, <ul>, <ol>, <li>, <strong>, <em>, <br>
 * No fonts, sizes, colors, spans, classes, or inline styles — the site's own
 * CSS decides how it looks, so pasted text always matches the destination.
 *
 * Also turns "fake" bullets into real lists:
 *   - Word / Google Docs paragraphs that start with •, ·, -, *, ▪, ‣, or "1." / "1)"
 *   - Word's MsoListParagraph blocks
 *   - Plain-text pastes, line by line
 *
 * Browser-only (uses DOMParser).
 */

const BULLET_RE = /^\s*(?:[•·\-–—*▪‣◦●o]|•)\s+/;
const NUMBER_RE = /^\s*\d{1,3}[.)]\s+/;

const INLINE_KEEP = new Set(["STRONG", "EM", "BR"]);

/** Clean an HTML string down to the allowed subset */
export function sanitizeRichText(html: string): string {
  if (!html || !html.trim()) return "";
  if (typeof window === "undefined") return html; // server: leave it alone
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root")!;
  const blocks = collectBlocks(root);
  return blocksToHtml(blocks);
}

/** Clean a plain-text paste into paragraphs and lists */
export function plainTextToRichText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    blocks.push(classifyLine(line, escapeHtml(line)));
  }
  return blocksToHtml(blocks);
}

// ── Internal representation ──
type Block = { kind: "p" | "ul" | "ol"; html: string }; // html = inline content (already clean)

function classifyLine(rawText: string, inlineHtml: string): Block {
  if (BULLET_RE.test(rawText)) return { kind: "ul", html: stripLeading(inlineHtml, BULLET_RE) };
  if (NUMBER_RE.test(rawText)) return { kind: "ol", html: stripLeading(inlineHtml, NUMBER_RE) };
  return { kind: "p", html: inlineHtml };
}

/** Remove a leading bullet/number marker from inline HTML (marker is always plain text at the start) */
function stripLeading(inlineHtml: string, re: RegExp): string {
  // The marker may be wrapped in a tag like <strong>• </strong>; handle the plain case and the wrapped case
  const plain = inlineHtml.replace(re, "");
  if (plain !== inlineHtml) return plain.trim();
  return inlineHtml.replace(/^(<[^>]+>)+\s*(?:[•·\-–—*▪‣◦●o]|\d{1,3}[.)])\s+/, "$1").trim();
}

/** Walk the pasted DOM and produce blocks */
function collectBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = [];
  let pending = ""; // inline content accumulating into the current paragraph

  const flush = () => {
    const t = pending.trim();
    if (t) {
      const text = textOf(t);
      blocks.push(classifyLine(text, t));
    }
    pending = "";
  };

  const visit = (node: Node, listKind: "ul" | "ol" | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pending += escapeHtml((node.textContent || "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === "SCRIPT" || tag === "STYLE" || tag === "META" || tag === "LINK") return;

    if (tag === "BR") {
      pending += "<br>";
      return;
    }

    // Lists
    if (tag === "UL" || tag === "OL") {
      flush();
      const kind = tag === "UL" ? "ul" : "ol";
      Array.from(el.children).forEach((child) => visit(child, kind));
      return;
    }
    if (tag === "LI") {
      flush();
      const inline = inlineOf(el);
      const text = textOf(inline);
      blocks.push({ kind: listKind || "ul", html: stripLeading(inline, BULLET_RE) || text });
      // nested lists inside the li
      Array.from(el.children).forEach((child) => {
        if (child.tagName === "UL" || child.tagName === "OL") visit(child, child.tagName === "UL" ? "ul" : "ol");
      });
      return;
    }

    // Google Docs wraps the whole paste in <b style="font-weight:normal"> and any
    // formatting tag can contain blocks/lists — treat those as plain containers.
    const normalWeight = el.style?.fontWeight === "normal" || el.style?.fontWeight === "400";
    if ((tag === "STRONG" || tag === "B" || tag === "EM" || tag === "I" || tag === "SPAN" || tag === "FONT") && (hasBlockChild(el) || (tag === "B" && normalWeight))) {
      Array.from(el.childNodes).forEach((child) => visit(child, listKind));
      return;
    }

    // Inline formatting we keep
    if (tag === "STRONG" || tag === "B") {
      const inner = inlineOf(el);
      if (inner.trim()) pending += `<strong>${inner}</strong>`;
      return;
    }
    if (tag === "EM" || tag === "I") {
      const inner = inlineOf(el);
      if (inner.trim()) pending += `<em>${inner}</em>`;
      return;
    }
    // Bold/italic expressed as styles (Google Docs does this)
    const fw = el.style?.fontWeight;
    const fs = el.style?.fontStyle;
    if ((tag === "SPAN" || tag === "FONT") && (fw === "bold" || Number(fw) >= 600)) {
      const inner = inlineOf(el);
      if (inner.trim()) pending += `<strong>${inner}</strong>`;
      return;
    }
    if ((tag === "SPAN" || tag === "FONT") && fs === "italic") {
      const inner = inlineOf(el);
      if (inner.trim()) pending += `<em>${inner}</em>`;
      return;
    }

    // Block-level: paragraph boundary
    const isBlock = ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "SECTION", "ARTICLE", "TR", "TD", "TABLE", "TBODY", "PRE"].includes(tag);
    if (isBlock) {
      flush();
      // Word list paragraphs
      const isMsoList = /MsoListParagraph/i.test(el.className || "");
      const inline = inlineOf(el);
      const text = textOf(inline);
      if (!text.trim()) return;
      if (isMsoList || BULLET_RE.test(text)) blocks.push({ kind: "ul", html: stripLeading(inline, BULLET_RE) });
      else if (NUMBER_RE.test(text)) blocks.push({ kind: "ol", html: stripLeading(inline, NUMBER_RE) });
      else blocks.push({ kind: "p", html: inline });
      return;
    }

    // Anything else (span, a, font, u, …): keep the content, drop the tag
    Array.from(el.childNodes).forEach((child) => visit(child, listKind));
  };

  Array.from(root.childNodes).forEach((n) => visit(n, null));
  flush();
  return blocks;
}

/** Does this element contain any block-level or list element? */
function hasBlockChild(el: HTMLElement): boolean {
  return !!el.querySelector("p, div, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote, table");
}

/** Inline HTML of an element: text + strong/em/br only, no nested blocks/lists */
function inlineOf(el: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeHtml((node.textContent || "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const e = node as HTMLElement;
    const tag = e.tagName;
    if (tag === "UL" || tag === "OL") return; // handled by the caller
    if (tag === "BR") { out += "<br>"; return; }
    if (tag === "STRONG" || tag === "B" || (e.style && (e.style.fontWeight === "bold" || Number(e.style.fontWeight) >= 600))) {
      const before = out; out = "";
      Array.from(e.childNodes).forEach(walk);
      const inner = out; out = before + (inner.trim() ? `<strong>${inner}</strong>` : inner);
      return;
    }
    if (tag === "EM" || tag === "I" || (e.style && e.style.fontStyle === "italic")) {
      const before = out; out = "";
      Array.from(e.childNodes).forEach(walk);
      const inner = out; out = before + (inner.trim() ? `<em>${inner}</em>` : inner);
      return;
    }
    Array.from(e.childNodes).forEach(walk);
  };
  Array.from(el.childNodes).forEach(walk);
  // Collapse runs of <br> and trim
  return out.replace(/(<br>\s*){3,}/g, "<br><br>").replace(/^(\s|<br>)+|(\s|<br>)+$/g, "").trim();
}

/** Group consecutive list blocks into one <ul>/<ol> */
function blocksToHtml(blocks: Block[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind === "p") {
      if (b.html.trim()) out.push(`<p>${b.html}</p>`);
      i++;
      continue;
    }
    const kind = b.kind;
    const items: string[] = [];
    while (i < blocks.length && blocks[i].kind === kind) {
      if (blocks[i].html.trim()) items.push(`<li>${blocks[i].html}</li>`);
      i++;
    }
    if (items.length) out.push(`<${kind}>${items.join("")}</${kind}>`);
  }
  return out.join("");
}

function textOf(inlineHtml: string): string {
  return inlineHtml.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, " ");
}

// Reserved for callers that want to check the inline-only set
export const RICH_TEXT_INLINE_TAGS = INLINE_KEEP;
