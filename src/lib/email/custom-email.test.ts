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
import { wrapPreviewHtml } from "./preview-wrapper";
import { resolveMergeTags } from "./merge-tags";

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

// ── Merge tags, end to end ──
// The rule: the tag must survive VERBATIM into the broadcast HTML (Resend does
// the per-recipient substitution), but must never reach a reader raw anywhere
// else — not in the subject, not in the inbox preview line, not in the preview
// pane, and not on the transactional path where Resend substitutes nothing.
const tagged = {
  ...custom,
  email_subject: "October market update",
  body_text:
    "<p>Hi {{{contact.first_name|there}}},</p>" +
    "<p>Reach me if {{{contact.email}}} is wrong.</p>",
};
const taggedHtml = renderEmailHtml(buildTemplateVars(tagged));

assert(taggedHtml.includes("{{{contact.first_name|there}}}"), "the broadcast HTML keeps the first-name tag for Resend");
assert(taggedHtml.includes("{{{contact.email}}}"), "the broadcast HTML keeps the email tag for Resend");
assert(taggedHtml.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"), "the unsubscribe tag is still left to Resend");

assert(!buildSubjectLine(tagged).includes("{{{"), "the subject never carries a raw tag");
assert(buildPreviewText(tagged).startsWith("Hi there,"), "the inbox preview line resolves, so it can't be cut mid-tag");
assert(!buildPreviewText(tagged).includes("{{{"), "the inbox preview line never carries a raw tag");

assert(!wrapPreviewHtml(taggedHtml).includes("{{{contact."), "the composer preview resolves the tags");
assert(wrapPreviewHtml(taggedHtml).includes("Hi there,"), "the composer preview shows the fallback");

const toBradley = resolveMergeTags(taggedHtml, { first_name: "Bradley", email: "b@x.com" });
assert(toBradley.includes("Hi Bradley,"), "a test send / hand-typed recipient gets their own name");
assert(!toBradley.includes("{{{contact."), "no raw braces survive the transactional path");
assert(
  resolveMergeTags(taggedHtml, { first_name: "", email: "b@x.com" }).includes("Hi there,"),
  "a contact with no first name gets the fallback, not \"Hi ,\""
);

console.log(failed === 0 ? "\nall custom-email tests passed" : `\n${failed} custom-email test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
