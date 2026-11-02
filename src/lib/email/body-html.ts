/**
 * Rich-text email body — cleaning and styling.
 *
 * Custom emails (campaign_kind = "custom") let you write a body the way you'd
 * write a normal email: paragraphs, bold, italic, bullets, numbers and links.
 * The composer stores that as HTML in `body_text`.
 *
 * Two jobs happen here:
 *
 *   1. sanitizeEmailBodyHtml — throw away everything that isn't on the
 *      allowlist. The editor already cleans as you type, but whatever reaches
 *      the server is cleaned again before it goes anywhere near a send.
 *
 *   2. renderEmailBodyHtml — put the styles back as INLINE styles. Email
 *      clients (Outlook especially) ignore <style> blocks for these tags, so
 *      every <p>, <ul>, <li> and <a> has to carry its own style attribute.
 *
 * Deliberately plain string work — no DOMParser — because the composer's live
 * preview renders this in the browser while Resend renders it on the server.
 */

/* ============================================================
   SANITIZE
   ============================================================ */

/** The only tags that survive. Anything else is unwrapped (its text is kept). */
const ALLOWED_TAGS = new Set(["p", "br", "strong", "em", "ul", "ol", "li", "a"]);

/** Old-school tags we rewrite rather than drop. */
const TAG_ALIASES: Record<string, string> = { b: "strong", i: "em" };

/** Tags that write themselves closed. */
const VOID_TAGS = new Set(["br"]);

/** Link protocols we'll allow through. Anything else (javascript:, data:) is dropped. */
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

/** Pull the href out of a tag's attribute string, in any quoting style. */
function readHref(attrs: string): string {
  const m = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!m) return "";
  const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  // Strip any control characters a pasted URL may be hiding (e.g. "java\0script:")
  const clean = raw.replace(/[\u0000-\u001F\u007F\s]/g, "");
  return SAFE_LINK.test(clean) ? clean : "";
}

/** Escape the characters that would otherwise start a tag or an entity. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Reduce an HTML string to <p> <br> <strong> <em> <ul> <ol> <li> <a href>.
 * Every other tag is removed and its text kept. All attributes are removed
 * except a validated href on a link.
 */
export function sanitizeEmailBodyHtml(html: string): string {
  if (!html || !html.trim()) return "";

  // Script and style blocks go completely — tag AND contents.
  let out = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Walk every tag and decide: keep it clean, or drop it and keep the text.
  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_full, slash: string, rawName: string, attrs: string) => {
    const name = TAG_ALIASES[rawName.toLowerCase()] || rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return ""; // unwrap — the inner text stays
    if (slash) return `</${name}>`;
    if (VOID_TAGS.has(name)) return `<${name}>`;
    if (name === "a") {
      const href = readHref(attrs);
      if (!href) return ""; // a link we can't trust becomes plain text
      return `<a href="${escapeAttr(href)}">`;
    }
    return `<${name}>`;
  });

  // A dangling "<" that never formed a tag would break the email — escape it.
  out = out.replace(/<(?![/a-zA-Z])/g, "&lt;");

  return out.trim();
}

/** True when the cleaned HTML has any real text in it (not just empty tags). */
export function hasBodyHtmlContent(html: string): boolean {
  return sanitizeEmailBodyHtml(html).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

/* ============================================================
   STYLE FOR EMAIL
   ============================================================ */

export interface BodyHtmlStyle {
  /** The template's font stack */
  font: string;
  /** Body copy colour */
  color: string;
  /** Link colour — CRE8 green by default */
  linkColor?: string;
  /** Base copy size in px */
  fontSize?: number;
}

/**
 * Clean the HTML, then give every tag the inline styles an email client needs.
 * Returns "" when there's nothing to show, so the caller can skip the row.
 */
export function renderEmailBodyHtml(html: string, style: BodyHtmlStyle): string {
  const clean = sanitizeEmailBodyHtml(html);
  if (!clean) return "";

  const size = style.fontSize ?? 15;
  const linkColor = style.linkColor ?? "#8CC644";

  const copy = `font-family:${style.font};font-size:${size}px;color:${style.color};line-height:1.65;`;

  const styles: Record<string, string> = {
    p: `margin:0 0 14px 0;${copy}`,
    ul: `margin:0 0 14px 0;padding-left:22px;${copy}`,
    ol: `margin:0 0 14px 0;padding-left:22px;${copy}`,
    li: `margin:0 0 6px 0;${copy}`,
    a: `color:${linkColor};text-decoration:underline;`,
  };

  return clean.replace(/<(p|ul|ol|li|a)(\s[^>]*)?>/g, (_full, tag: string, attrs: string | undefined) => {
    const existing = attrs || ""; // only ever an href on a link
    return `<${tag}${existing} style="${styles[tag]}">`;
  });
}
