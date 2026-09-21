/**
 * Preview wrapper — PREVIEW ONLY, never on the send path.
 *
 * The composer shows the real email HTML (renderEmailHtml) in an iframe. This
 * file adds the little bit of styling that only makes sense in the composer:
 * a light page background so the email card floats, a pointer cursor on
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
  | "intro"
  | "body"
  | "photo"
  | "cta"
  | "broker"
  | "partner"
  | `highlight-${number}`
  | `group-${number}`;

/** CSS class the parent toggles on the active region */
export const PREVIEW_FOCUS_CLASS = "cre8-focus";

const PREVIEW_STYLE = `
<style id="cre8-preview-style">
  /* Light page behind the email so the card floats in the composer */
  html, body { background-color: #F5F5F5 !important; }
  body > table { background-color: #F5F5F5 !important; }
  /* Multiple emails: pin the light shell so OS dark mode cannot restore charcoal chrome */
  .group-shell, .group-header, .group-band { background-color: #F5F5F5 !important; }
  .group-label, .group-copy, .group-broker-name { color: #1A1A1A !important; }
  .group-rule { border-top: 1px solid #A3A3A3 !important; }
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
  /* Multiple cards: keep the 2-up 4:3 light-card grid in the ~600px iframe.
     Photos stay 4:3 via padding-bottom:75% — do not also set aspect-ratio.
     table-layout:fixed + clamped title/meta keep every card the same size. */
  .group-grid { width: 100% !important; table-layout: fixed !important; }
  .group-col { width: 50% !important; display: table-cell !important; vertical-align: top !important; box-sizing: border-box !important; }
  .group-card { height: 100% !important; background-color: #FFFFFF !important; border: 1px solid #E5E5E5 !important; border-radius: 3px !important; overflow: hidden !important; }
  .group-meta { background-color: #FFFFFF !important; }
  .group-title {
    color: #111111 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden !important;
    max-height: 44px !important;
  }
  .group-summary {
    color: #6B7280 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden !important;
    max-height: 17px !important;
  }
  @media only screen and (max-width: 480px) {
    .group-col { display: block !important; width: 100% !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
    .group-col-empty { display: none !important; width: 0 !important; height: 0 !important; padding: 0 !important; overflow: hidden !important; }
  }
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
