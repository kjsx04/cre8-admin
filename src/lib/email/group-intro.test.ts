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
assert(!html.includes('class="group-col"'), "cards are not a 2-up grid");
assert(!html.includes('width="50%"'), "no half-width columns");
assert(html.includes("padding-bottom:64.7059%"), "photos are 17:11 (5100×3300)");
assert(!html.includes("padding-bottom:75%"), "photos are no longer 4:3");
assert(html.includes('width="42%"'), "photo column is about 42% wide");
assert((html.match(/class="group-card"/g) || []).length === 2, "one full-width strip per listing");
assert(html.includes('class="group-title"'), "title renders");
assert(html.includes('class="group-summary"'), "summary renders");
assert(!html.includes('class="group-chip"'), "empty eyebrow is omitted");
assert((html.match(/class="group-photo"/g) || []).length === 2, "both cards use the 17:11 photo box");
assert((html.match(/position:relative;width:100%;height:0;padding-bottom:64\.7059%/g) || []).length === 2, "empty-photo placeholders match the photo box");
assert(html.includes("padding:16px 32px 0 32px"), "strip stack keeps the 32px inset");
assert(html.includes("padding:0 0 10px 0"), "10px gap between stacked strips");
assert(html.includes("border-radius:3px"), "card corners are a few pixels");
assert(html.includes('bgcolor="#111111"'), "listing cards are near-black");
assert(html.includes("background-color:#111111;border:1px solid #2a2a2a;border-radius:3px"), "Option D card chrome");
assert(!html.includes('bgcolor="#FFFFFF"'), "listing cards are not white");
assert(html.includes("View listing &rarr;"), "card CTA is a text link");
assert(!html.includes(">View listing</a>"), "solid View listing button is gone");
assert(html.includes("color:#FFFFFF;line-height:1.25"), "title is white");
assert(html.includes("color:#A3A3A3"), "meta is muted gray");
assert(html.includes('class="card-bg group-shell"'), "Multiple email keeps the shell class");
assert(html.includes("max-width:600px;width:100%;background-color:#000000"), "Multiple chrome is black");
assert(!html.includes("background-color:#F5F5F5"), "Multiple email is not the light grey shell");
assert(html.includes("color:#FFFFFF;line-height:1.15;letter-spacing:1px"), "heading is white on the black shell");
assert(html.includes('data-field="intro"') && html.includes("color:#BFBFBF;line-height:1.65"), "intro is light on black");
assert(html.includes('data-field="body"') && html.includes("color:#BFBFBF;line-height:1.65"), "body copy is light on black");
assert(html.includes("color-scheme: light dark"), "dark chrome opts into light and dark");
assert(!html.includes("color-scheme: light only"), "Multiple emails are not pinned to light");
assert(html.includes("cre8-white.png"), "Multiple uses the white CRE8 logo on black");
assert(!html.includes("cre8-logo-color.png"), "Multiple does not use the color logo");
assert(html.includes("padding:26px 32px 12px 32px"), "Multiple header is 4px shorter");
assert(html.includes('data-field="cta" style="padding:24px 32px 20px 32px'), "CTA has even space above and below");
assert(html.includes('data-field="broker"') && html.includes('class="group-band group-rule"') && html.includes("background-color:#000000;border-top:1px solid #333333;padding:12px 32px 20px 32px"), "broker band is black with a short gap under the CTA");
assert(html.includes("class=\"group-broker-name\"") && html.includes("color:#FFFFFF;line-height:1.3"), "broker name is white on the black band");
assert((html.match(/class="group-band group-rule"/g) || []).length === 2, "broker and footer each have a section rule");

const preview = wrapPreviewHtml(html);
assert(preview.includes('id="cre8-preview-style"'), "composer preview wraps the live email HTML");
assert(preview.includes("background-color: #111111 !important"), "composer preview pins Option D dark cards");
assert(preview.includes("background-color: #F5F5F5 !important"), "composer preview page behind the card stays light");
assert(!preview.includes(".group-label, .group-copy, .group-broker-name { color: #1A1A1A !important; }"), "composer preview does not force dark text on a light shell");
assert(preview.includes("View listing &rarr;"), "composer preview keeps the text-link CTA");
assert(!preview.includes(">View listing</a>"), "composer preview does not keep the solid View listing button");
assert(!html.includes("border-radius:6px;height:100%"), "listing cards no longer use 6px radius");
assert(!html.includes("background-color:#111111;border:1px solid #FFFFFF"), "old white-border dark chrome is gone");
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
assert(withPhotos.includes("padding-bottom:64.7059%"), "photo cards use a 17:11 box");
assert(withPhotos.includes("object-fit:cover"), "cover crop, not letterbox");
assert(withPhotos.includes("object-position:center center"), "cover is centered");
assert(withPhotos.includes('width="225"') && withPhotos.includes('height="146"'), "Outlook 17:11 fallback 225×146");

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
assert((four.match(/class="group-card"/g) || []).length === 4, "four listings → four stacked strips");
assert(!four.includes('class="group-col"'), "four listings stay full-width, not 2-up");
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
assert(!mixed.includes('class="group-col"'), "odd count does not leave an empty half column");
assert((mixed.match(/class="group-title"/g) || []).length === 3, "every card has a title");
assert((mixed.match(/class="group-summary"/g) || []).length === 2, "empty summary is omitted");
assert((mixed.match(/class="group-chip"/g) || []).length === 2, "only non-empty eyebrows render");
assert(mixed.includes("UNDER CONTRACT") === false && mixed.includes("Under Contract"), "stored chip text renders as typed");
assert(mixed.includes("Price Reduced"), "custom or stored eyebrow text is kept");
assert(mixed.includes("color:#f59e0b"), "eyebrow is amber on the dark card");
assert(!mixed.includes("color:#C2410C"), "preset chip colors are gone");
assert((mixed.match(/padding-bottom:64\.7059%/g) || []).length >= 3, "every card photo box is 17:11 including placeholders");
assert(mixed.includes('width="225"') && mixed.includes('height="146"') && mixed.includes('bgcolor="#1A1A1A"'), "Outlook empty placeholder is the same 225×146 box");
assert(mixed.includes("VIEW ALL LISTINGS"), "group CTA unchanged");
assert((mixed.match(/class="group-cta"/g) || []).length === 3, "every card has a text-link CTA");
assert(mixed.includes("Coming Soon") === false, "sanity");

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
assert(single.includes("max-width:600px;width:100%;background-color:#1A1A1A"), "single keeps dark chrome");
assert(!single.includes('class="card-bg group-shell"'), "single does not use the Multiple light shell");
assert(single.includes("color:#FFFFFF;line-height:1.15;letter-spacing:1px"), "single heading stays white on dark");
assert(single.includes("color:#BFBFBF"), "single body stays light-on-dark");
assert(single.includes("cre8-white.png"), "single keeps the white CRE8 logo");
assert(!single.includes("cre8-logo-color.png"), "single does not use the color logo");
assert(single.includes('data-field="broker" style="background-color:#000000'), "single broker band stays black");
assert(single.includes("padding:26px 32px;"), "single header is 4px shorter");
assert(single.includes("padding:12px 32px 20px 32px"), "single broker band top gap is tightened");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall group-intro tests passed");
