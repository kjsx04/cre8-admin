/**
 * Run: npx tsx src/lib/email/group-intro.test.ts
 *
 * Multiple emails keep intro above listing cards and body below them.
 * Switching type must not relocate body_text into the intro slot.
 */

import { buildTemplateVars, renderEmailHtml } from "./constants";
import { wrapPreviewHtml } from "./preview-wrapper";

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
assert(html.includes("padding-bottom:75%"), "photos are 4:3 landscape");
assert(!html.includes("padding-bottom:100%"), "photos are no longer 1:1 squares");
assert(html.includes("table-layout:fixed"), "fixed 50/50 columns keep cards the same width");
assert(html.includes('class="group-title"'), "title is a clamped slot");
assert(html.includes('class="group-summary"'), "summary is a reserved slot");
assert(html.includes('class="group-chip"'), "chip slot is always reserved");
assert(html.includes("height:44px"), "title box is two clamped lines");
assert(html.includes("-webkit-line-clamp: 2"), "title clamps to 2 lines");
assert((html.match(/class="group-photo"/g) || []).length === 2, "both cards use the same 4:3 photo box");
assert((html.match(/position:relative;width:100%;height:0;padding-bottom:75%/g) || []).length === 2, "empty-photo placeholders match the photo box");
assert(html.includes("max-width: 480px"), "mobile stacks below 480px, not 600");
assert(!html.includes("@media only screen and (max-width: 600px)"), "600px no longer stacks group cards");
assert(html.includes("padding:20px 32px 0 32px"), "grid inset matches heading/intro 32px");
assert(html.includes("padding:0 3px 6px 0"), "left card gutter 3+3=6 between cards");
assert(html.includes("padding:0 0 6px 3px"), "right card gutter matches left");
assert(html.includes("border-radius:3px"), "card corners are a few pixels, not pill");
assert(html.includes('bgcolor="#FFFFFF"'), "listing cards are white/light");
assert(html.includes("background-color:#FFFFFF;border-radius:3px"), "white card chrome");
assert(html.includes("padding:0;line-height:0;font-size:0;overflow:hidden"), "photo is full-bleed to card edges");
assert(html.includes("padding:14px 14px 14px 14px"), "white meta block has tight inner padding");
assert(html.includes('class="group-cta"'), "card CTA is a solid button, not a text link");
assert(html.includes("background-color:#8CC644") && html.includes(">View listing</a>"), "CRE8 green View listing button");
assert(!html.includes("View listing &rarr;"), "old green text-link CTA is gone");
assert(html.includes("color:#111111"), "title is dark on the light card");
assert(html.includes("color:#6B7280"), "meta is muted gray on the light card");

const preview = wrapPreviewHtml(html);
assert(preview.includes('id="cre8-preview-style"'), "composer preview wraps the live email HTML");
assert(preview.includes("background-color: #FFFFFF !important"), "composer preview pins Option C white cards");
assert(preview.includes(">View listing</a>"), "composer preview keeps the solid View listing button");
assert(!preview.includes("View listing &rarr;"), "composer preview does not keep the old text-link CTA");
assert(!html.includes("border-radius:6px;height:100%"), "listing cards no longer use 6px radius");
assert(!html.includes("background-color:#111111;border:1px solid #FFFFFF"), "old dark card chrome is gone");
assert(!html.includes("padding:6px 6px 0 6px"), "old photo inner padding is gone");

const withPhotos = renderEmailHtml(buildTemplateVars({
  campaign_kind: "group",
  email_label: "West Valley",
  heading_text: "LAND · WEST VALLEY",
  group_listings: [
    { listing_id: "a", name: "Queen Creek Station", photo_url: "https://cdn/aerial-wide.jpg", url: "https://cre8advisors.com/listings/a", summary: "6 acres", chip: "" as const },
    { listing_id: "b", name: "Meridian & Pecos", photo_url: "https://cdn/aerial-wide.jpg", url: "https://cre8advisors.com/listings/b", summary: "24 acres", chip: "" as const },
  ],
  broker_id: "6987fb6d372758be66e14cb8",
  broker_name: "Kevin Smith",
  broker_email: "Kevin@cre8advisors.com",
}));
assert(withPhotos.includes("padding-bottom:75%"), "photo cards use 4:3 box");
assert(withPhotos.includes("object-fit:cover"), "cover crop, not letterbox");
assert(withPhotos.includes("object-position:center center"), "cover is centered");
assert(withPhotos.includes('width="265"') && withPhotos.includes('height="199"'), "Outlook 4:3 fallback 265×199");

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

const mixed = renderEmailHtml(buildTemplateVars({
  campaign_kind: "group",
  email_label: "West Valley",
  heading_text: "LAND · WEST VALLEY",
  group_listings: [
    { listing_id: "a", name: "A Very Long Listing Name That Would Wrap Across Several Lines If Unclamped", photo_url: "https://cdn/aerial-wide.jpg", url: "https://cre8advisors.com/listings/a", summary: "76.57 Acres · Buckeye · extra meta that should stay one line", chip: "Under Contract" as const },
    { listing_id: "b", name: "Short", photo_url: "", url: "https://cre8advisors.com/listings/b", summary: "", chip: "" as const },
    { listing_id: "c", name: "Odd last card", photo_url: "", url: "https://cre8advisors.com/listings/c", summary: "10 acres", chip: "Price Reduced" as const },
  ],
  broker_id: "6987fb6d372758be66e14cb8",
  broker_name: "Kevin Smith",
  broker_email: "Kevin@cre8advisors.com",
}));
assert((mixed.match(/class="group-card"/g) || []).length === 3, "three listing cards");
assert((mixed.match(/class="group-col[^"]*"/g) || []).length === 4, "odd last row still uses two 50% columns");
assert((mixed.match(/class="group-col group-col-empty"/g) || []).length === 1, "empty mate of the odd last card is marked");
assert(mixed.includes(".group-col-empty"), "mobile CSS hides the empty odd-row cell");
assert((mixed.match(/class="group-title"/g) || []).length === 3, "every card has the same title slot");
assert((mixed.match(/class="group-summary"/g) || []).length === 3, "every card has the same summary slot");
assert((mixed.match(/class="group-chip"/g) || []).length === 3, "every card has the same chip slot");
assert((mixed.match(/padding-bottom:75%/g) || []).length >= 3, "every card photo box is 4:3 including placeholders");
assert(mixed.includes('width="265"') && mixed.includes('height="199"') && mixed.includes('bgcolor="#222222"'), "Outlook empty placeholder is the same 265×199 box");
assert(mixed.includes("VIEW ALL LISTINGS"), "group CTA unchanged");
assert(mixed.includes("color:#C2410C"), "Under Contract status is amber/brown");
assert((mixed.match(/class="group-cta"/g) || []).length === 3, "every card has a solid View listing button");

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
