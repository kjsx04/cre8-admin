/**
 * Run: npx tsx src/lib/email/group-intro.test.ts
 *
 * Multiple emails keep intro above listing cards and body below them.
 * Switching type must not relocate body_text into the intro slot.
 */

import { buildTemplateVars, renderEmailHtml } from "./constants";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const cards = [
  { listing_id: "a", name: "Queen Creek Station", photo_url: "", url: "https://cre8advisors.com/listings/a", summary: "6 acres", chip: "" as const },
  { listing_id: "b", name: "Meridian & Pecos", photo_url: "", url: "https://cre8advisors.com/listings/b", summary: "24 acres", chip: "" as const },
];

const vars = buildTemplateVars({
  campaign_kind: "group",
  email_label: "West Valley",
  heading_text: "LAND · WEST VALLEY",
  intro_text: "INTRO_SLOT_COPY",
  body_text: "BODY_SLOT_COPY",
  group_listings: cards,
  broker_id: "6987fb6d372758be66e14cb8",
  broker_name: "Kevin Smith",
  broker_email: "Kevin@cre8advisors.com",
});

assert(vars.introText === "INTRO_SLOT_COPY", "intro maps from intro_text");
assert(vars.bodyText === "BODY_SLOT_COPY", "body stays on body_text");
assert(vars.groupListings.length === 2, "group cards present");

const html = renderEmailHtml(vars);
const introAt = html.indexOf("INTRO_SLOT_COPY");
const cardAt = html.indexOf("Queen Creek Station");
const bodyAt = html.indexOf("BODY_SLOT_COPY");

assert(introAt > 0, "intro renders");
assert(cardAt > 0, "listing card renders");
assert(bodyAt > 0, "body renders");
assert(introAt < cardAt, "intro is above listing cards");
assert(cardAt < bodyAt, "body is under listing cards");
assert(html.includes('data-field="intro"'), "intro is clickable in preview");
assert(html.includes('data-field="body"'), "body is clickable in preview");
assert((html.match(/class="group-col"/g) || []).length === 2, "two 50% columns for two listings");
assert(html.includes('width="50%"'), "columns are half-width");
assert(html.includes("padding-bottom:100%"), "photos are square (1:1 crop)");
assert(html.includes("max-width: 480px"), "mobile stacks below 480px, not 600");
assert(!html.includes("@media only screen and (max-width: 600px)"), "600px no longer stacks group cards");
assert(html.includes("padding:20px 32px 0 32px"), "grid inset matches heading/intro 32px");
assert(html.includes("padding:0 16px 32px 0"), "left card gutter 16+16=32 between cards");
assert(html.includes("padding:0 0 32px 16px"), "right card gutter matches left");

const four = renderEmailHtml(buildTemplateVars({
  campaign_kind: "group",
  email_label: "West Valley",
  heading_text: "LAND · WEST VALLEY",
  intro_text: "INTRO_SLOT_COPY",
  body_text: "BODY_SLOT_COPY",
  group_listings: [
    ...cards,
    { listing_id: "c", name: "Third Listing", photo_url: "", url: "https://cre8advisors.com/listings/c", summary: "10 acres", chip: "" as const },
    { listing_id: "d", name: "Fourth Listing", photo_url: "", url: "https://cre8advisors.com/listings/d", summary: "8 acres", chip: "" as const },
  ],
  broker_id: "6987fb6d372758be66e14cb8",
  broker_name: "Kevin Smith",
  broker_email: "Kevin@cre8advisors.com",
}));
assert((four.match(/class="group-col"/g) || []).length === 4, "four listings → two 2-up rows");
assert(four.indexOf("INTRO_SLOT_COPY") < four.indexOf("Queen Creek Station"), "intro stays above cards with 4 listings");
assert(four.indexOf("Fourth Listing") < four.indexOf("BODY_SLOT_COPY"), "body stays under cards with 4 listings");

const single = renderEmailHtml(buildTemplateVars({
  campaign_kind: "single",
  email_label: "Just Listed",
  heading_text: "Queen Creek Station",
  intro_text: "INTRO_SHOULD_NOT_RENDER",
  body_text: "SINGLE_BODY",
  photo_url: "https://cdn/hero.jpg",
  broker_id: "6987fb6d372758be66e14cb8",
  broker_name: "Kevin Smith",
  broker_email: "Kevin@cre8advisors.com",
}));

assert(single.includes("SINGLE_BODY"), "single still renders body");
assert(!single.includes("INTRO_SHOULD_NOT_RENDER"), "single ignores intro_text");
assert(single.indexOf("cdn/hero.jpg") < single.indexOf("SINGLE_BODY"), "single body stays under photo");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall group-intro tests passed");
