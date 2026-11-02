/**
 * Run: npx tsx src/lib/email/custom-email.test.ts
 *
 * Custom emails are the third campaign kind: no listing, no photo, no stats, no
 * CTA — just a subject, a rich-text body and the CRE8 chrome around it. These
 * cover what the template keeps and what it drops, so a change to the single or
 * group branches can't quietly put listing furniture back into a custom send.
 */

import { buildTemplateVars, renderEmailHtml } from "./constants";
import { buildSubjectLine, buildPreviewText } from "./subject";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok ", msg);
  }
}

// A custom row carrying listing fields it should ignore (photo, highlights, CTA
// url) — a leftover from switching type, or a stale row. None may render.
const custom = {
  campaign_kind: "custom",
  listing_id: "custom:abc",
  listing_name: "Q4 market update",
  email_subject: "Q4 market update",
  email_label: "A quick market update",
  heading_text: "MARKET UPDATE",
  body_text:
    '<p>Hi there,</p><p>Here is what moved this quarter.</p><ul><li>Land is up</li></ul>' +
    '<p>See <a href="https://cre8advisors.com/listings">our listings</a>.</p>',
  photo_url: "https://example.com/hero.jpg",
  listing_page_url: "https://cre8advisors.com/listings/x",
  highlights: ["Price: $1,000,000"],
  broker_id: "6987fb6d372758be66e14cb8",
  broker_name: "Kevin",
  broker_email: "kevin@cre8advisors.com",
  broker_ids: ["6987fb6d372758be66e14cb8"],
};

const vars = buildTemplateVars(custom);
const html = renderEmailHtml(vars);

// ── Template vars ──
assert(vars.isCustom === true, "isCustom is set");
assert(vars.isGroup === false, "a custom email is never treated as a group");
assert(vars.bodyHtml.includes("<li>Land is up</li>"), "bodyHtml holds the cleaned rich text");

// ── Subject and preview ──
assert(buildSubjectLine(custom) === "Q4 market update", "the typed subject is used as-is");
assert(
  buildSubjectLine({ ...custom, email_subject: "" }) === "A quick market update",
  "no subject typed → the heading, never \"Just Listed: …\""
);
assert(
  !buildSubjectLine({ ...custom, email_subject: "", email_label: "", heading_text: "" }).includes("Just Listed"),
  "an empty custom email still never says Just Listed"
);
assert(
  buildPreviewText({ ...custom, preview_text: "" }).startsWith("Hi there"),
  "the preview line opens with the body copy, tags stripped"
);

// ── What renders ──
assert(html.includes("Here is what moved this quarter"), "body paragraphs render");
assert(
  html.includes('href="https://cre8advisors.com/listings" style="color:#8CC644'),
  "a body link keeps its address and gains an email-safe colour"
);
assert(html.includes("<li style=") && html.includes("Land is up"), "bullets render with inline styles");
assert(html.includes("MARKET UPDATE"), "the small top line renders");
assert(html.includes("A quick market update"), "the big heading renders");
assert(html.includes("kevin@cre8advisors.com"), "the broker card is kept");
assert(html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"), "the unsubscribe footer is kept");

// ── What doesn't ──
assert(!html.includes("hero.jpg"), "no hero photo, even with photo_url set");
assert(!html.includes("$1,000,000"), "no stats grid, even with highlights set");
assert(
  !html.includes("VIEW FULL LISTING") && !html.includes("VIEW ALL LISTINGS"),
  "no CTA button, even with listing_page_url set"
);

// ── An empty body shows the placeholder, not a broken row ──
const empty = renderEmailHtml(buildTemplateVars({ ...custom, body_text: "" }));
assert(empty.includes("Your message goes here"), "an empty body shows a placeholder line in the preview");

// ── The other two kinds are untouched ──
const single = renderEmailHtml(
  buildTemplateVars({
    campaign_kind: "single",
    listing_id: "abc",
    listing_name: "Gantzel & Combs",
    email_label: "Just Listed",
    body_text: "A short paragraph.",
    photo_url: "https://example.com/hero.jpg",
    listing_page_url: "https://cre8advisors.com/listings/x",
    highlights: ["Price: $1,000,000"],
    broker_id: "6987fb6d372758be66e14cb8",
    broker_name: "Kevin",
    broker_email: "kevin@cre8advisors.com",
  })
);
assert(single.includes("hero.jpg"), "single emails still show the hero photo");
assert(single.includes("$1,000,000"), "single emails still show the stats grid");
assert(single.includes("VIEW FULL LISTING"), "single emails still show the CTA button");
assert(single.includes("A short paragraph."), "single emails still show their plain-text body");
assert(
  buildSubjectLine({ campaign_kind: "single", email_label: "Just Listed", listing_name: "Gantzel & Combs" }) ===
    "Just Listed: Gantzel & Combs",
  "single subject fallback is unchanged"
);

console.log(failed === 0 ? "\nall custom-email tests passed" : `\n${failed} custom-email test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
