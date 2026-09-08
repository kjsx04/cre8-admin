/**
 * Preview wrapper — PREVIEW ONLY, never on the send path.
 *
 * The composer shows the real email HTML (renderEmailHtml) in an iframe. This
 * file adds the little bit of styling that only makes sense in the composer:
 * a light page background so the dark email card floats, a pointer cursor on
 * clickable regions, and the green focus outline used for click-to-focus.
 *
 * All interactivity (click → focus input, focus input → highlight region,
 * auto-height) is driven from the parent page through the same-origin iframe
 * document (see LivePreviewFrame.tsx). No script is injected into the HTML.
 *
 * provider.ts and the API routes call renderEmailHtml directly and never import
 * this file, so sent emails never contain any of this.
 */

/** Regions of the email that can be clicked / highlighted in the composer */
export type PreviewField =
  | "label"
  | "heading"
  | "body"
  | "photo"
  | "cta"
  | "broker"
  | "partner"
  | `highlight-${number}`;

/** CSS class the parent toggles on the active region */
export const PREVIEW_FOCUS_CLASS = "cre8-focus";

const PREVIEW_STYLE = `
<style id="cre8-preview-style">
  /* Light page behind the dark card so it reads as a floating email */
  html, body { background-color: #F5F5F5 !important; }
  body > table { background-color: #F5F5F5 !important; }
  /* Clickable regions */
  [data-field] { cursor: pointer; }
  [data-field] a { cursor: pointer; }
  /* Active region outline (2px CRE8 green, slightly inset) */
  .${PREVIEW_FOCUS_CLASS} {
    outline: 2px solid #8CC644 !important;
    outline-offset: 2px;
    border-radius: 4px;
    transition: outline-color 0.15s ease;
  }
  /* Keep text selectable-looking but not editable */
  * { -webkit-user-select: none; user-select: none; }
</style>`;

/**
 * Wrap rendered email HTML for the composer preview.
 * - Replaces the Resend unsubscribe merge tag so the link renders but goes nowhere
 * - Injects the preview-only stylesheet before </head>
 */
export function wrapPreviewHtml(html: string): string {
  const withUnsub = html.replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, "#");
  if (withUnsub.includes("</head>")) {
    return withUnsub.replace("</head>", `${PREVIEW_STYLE}\n</head>`);
  }
  // Defensive: template always has a head, but don't break if it ever doesn't
  return `${PREVIEW_STYLE}\n${withUnsub}`;
}

/** Pull the inner <body> markup out of a full HTML document */
export function extractBodyInner(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : html;
}
