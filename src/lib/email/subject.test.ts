/**
 * Run: npx tsx src/lib/email/subject.test.ts
 *
 * The Blossom Rock send showed the same sentence twice on a phone: the subject
 * was "<label>: <listing>" and the preview was "<label>: <heading>", so both
 * opened with the same 56 characters. These cover the fix.
 */

import {
  buildSubjectLine,
  buildPreviewText,
  openingLine,
  previewEchoesSubject,
  SUBJECT_PHONE,
} from "./subject";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

// ── The real campaign that went out 2026-09-23 ──
const blossom = {
  campaign_kind: "single",
  email_label: "Retail pads available in the heart of superstition vistas",
  listing_name: "Marketplace at Blossom Rock",
  heading_text: "Just Listed",
  body_text:
    "Introducing the Marketplace at Blossom Rock, a prime retail pad opportunity located at the northwest corner of Ironwood and Warner in Apache Junction, AZ. This 28-acre site is zoned C-2.",
};

const oldSubject = `${blossom.email_label}: ${blossom.listing_name}`;
const oldPreview = `${blossom.email_label}: ${blossom.heading_text}`;
assert(previewEchoesSubject(oldSubject, oldPreview), "the old pairing is correctly flagged as a duplicate");

const newPreview = buildPreviewText(blossom);
assert(!previewEchoesSubject(buildSubjectLine(blossom), newPreview), "the new preview no longer echoes the subject");
assert(newPreview.startsWith("Introducing the Marketplace"), "the preview now opens with the body copy");

// ── A typed subject always wins ──
assert(
  buildSubjectLine({ ...blossom, email_subject: "Blossom Rock: retail pads from 1.1 acres" }) ===
    "Blossom Rock: retail pads from 1.1 acres",
  "a typed subject is used exactly as written"
);
assert(
  buildSubjectLine({ ...blossom, email_subject: "   " }) === oldSubject,
  "an all-whitespace subject falls back rather than sending a blank line"
);
assert(buildSubjectLine(blossom) === oldSubject, "with no typed subject the old format still applies");

// A typed subject is never rebuilt when the listing changes
const renamed = { ...blossom, email_subject: "Blossom Rock pads", listing_name: "Something Else Entirely" };
assert(buildSubjectLine(renamed) === "Blossom Rock pads", "a typed subject survives a listing rename");

// ── Group emails ──
assert(
  buildSubjectLine({ campaign_kind: "group", email_label: "West Valley Land", listing_name: "ignored" }) ===
    "West Valley Land",
  "a group email uses the heading as the subject"
);
assert(
  buildSubjectLine({ campaign_kind: "group", email_subject: "Five pads under $2M", email_label: "West Valley Land" }) ===
    "Five pads under $2M",
  "a typed subject wins for group emails too"
);
assert(buildSubjectLine({ campaign_kind: "group" }) === "Featured Listings", "a group email always has some subject");

// ── Typed preview wins ──
assert(
  buildPreviewText({ ...blossom, preview_text: "28 acres on Ironwood, 40,297 cars a day" }) ===
    "28 acres on Ironwood, 40,297 cars a day",
  "typed preview text is used as written"
);

// ── Fallback chain when there is no body copy ──
const noBody = { campaign_kind: "single", email_label: "Just Listed", listing_name: "Beloat 76", heading_text: "Land" };
const p2 = buildPreviewText(noBody);
assert(p2 === "Land", "with no body copy the heading is used");
assert(!previewEchoesSubject(buildSubjectLine(noBody), p2), "the fallback still doesn't echo the subject");

// The heading is skipped when the subject already contains it
const echoHeading = { campaign_kind: "single", email_label: "Just Listed", listing_name: "Beloat 76", heading_text: "Just Listed" };
assert(buildPreviewText(echoHeading) !== "Just Listed", "a heading already in the subject is not reused");

// Nothing at all is better than a repeat
assert(buildPreviewText({ campaign_kind: "single", email_label: "Just Listed", listing_name: "Beloat 76" }) === "", "no preview beats a duplicated one");

// ── HTML in the body never leaks into the inbox ──
const withHtml = { campaign_kind: "single", email_label: "Just Listed", listing_name: "X", body_text: "<p>Great <strong>retail</strong> pads&nbsp;here.</p>" };
const cleaned = buildPreviewText(withHtml);
assert(!cleaned.includes("<"), "tags are stripped from the preview");
assert(!cleaned.includes("&nbsp;"), "entities are decoded");
assert(cleaned.startsWith("Great retail pads"), "the text reads normally");

// ── Trimming ──
assert(openingLine("Short one.") === "Short one.", "a short line is untouched");
const long = "A".repeat(200);
assert(openingLine(long).length <= 91, "a long line is trimmed");
assert(openingLine(long).endsWith("…"), "a trimmed line is marked");
assert(openingLine("") === "", "empty copy gives an empty preview");
// Copy that fits is kept whole — the preview line is short and every word counts
const twoShort = "This is the opening sentence. And a second one.";
assert(openingLine(twoShort) === twoShort, "copy that already fits is used whole");
// Copy that overruns is cut at a sentence end when one falls near the limit
const longFirst = "This first sentence runs on for a good long while before it finally stops here. " + "And then a second sentence carries on well past the limit.";
const cut = openingLine(longFirst);
assert(cut.endsWith("."), "a long opening is cut at the end of a sentence");
assert(!cut.includes("second sentence"), "the overflow is dropped");
assert(!openingLine("word ".repeat(40)).includes("wor…"), "trimming never cuts a word in half");

// ── Duplicate detection ──
assert(previewEchoesSubject("Same words here now", "Same words here now"), "identical lines are a duplicate");
assert(!previewEchoesSubject("Just Listed: Beloat 76", "76 acres in Buckeye"), "genuinely different lines are fine");
assert(!previewEchoesSubject("", "anything"), "an empty subject is not a duplicate");
const sharedOpening = "x".repeat(SUBJECT_PHONE + 10);
assert(previewEchoesSubject(sharedOpening + " one", sharedOpening + " two"), "lines that differ only past the phone cut still count as duplicates");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall subject tests passed");
