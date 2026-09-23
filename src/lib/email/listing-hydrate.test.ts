/**
 * Run: npx tsx src/lib/email/listing-hydrate.test.ts
 */

import { overlayListingOnCampaign, overlayGroupCard, listingStaysLive, listingSnapshotFields, resolveHeroPhoto } from "./listing-hydrate";
import type { ListingItem } from "@/lib/admin-constants";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const listing: ListingItem = {
  id: "list-1",
  isArchived: false,
  fieldData: {
    name: "Live Name",
    slug: "live-name",
    "list-price": "$9",
    "square-feet": 10,
    gallery: [{ url: "https://cdn.prod.website-files.com/x/hero.jpg", alt: "" }],
  },
};

const campaign = overlayListingOnCampaign(
  {
    listing_id: "list-1",
    listing_name: "Old Name",
    photo_url: "https://cdn.prod.website-files.com/x/old.jpg", // a CMS photo that no longer exists
    heading_text: "Keep heading",
    intro_text: "Keep intro",
    body_text: "Keep body",
    partner_logo_url: "https://cdn/logo.png",
    broker_name: "Kevin Smith",
    highlights: ["Price: $1", "Custom: stay"],
  },
  listing
);

assert(campaign.listing_name === "Live Name", "listing name is live");
assert(campaign.photo_url === "https://cdn.prod.website-files.com/x/hero.jpg", "non-gallery photo falls back to first gallery photo");
assert(campaign.listing_page_url === "https://cre8advisors.com/listings/live-name", "slug url is live");
assert(campaign.heading_text === "Keep heading", "heading stays campaign copy");
assert(campaign.intro_text === "Keep intro", "intro stays campaign copy");
assert(campaign.body_text === "Keep body", "body stays campaign copy");
assert(campaign.partner_logo_url === "https://cdn/logo.png", "partner logo stays");
assert(campaign.broker_name === "Kevin Smith", "broker stays");
// Stats rows are the user's text — the overlay never rewrites them (only an
// explicit listing save does, via listing-sync). This is what made typing in the
// composer's Details rows appear to do nothing.
assert((campaign.highlights as string[])[0] === "Price: $1", "typed stat row is left alone");
assert((campaign.highlights as string[])[1] === "Custom: stay", "custom highlight stays");

// The overlay never rewrites stats, whatever the CMS says
const cmsChanged = overlayListingOnCampaign(
  { listing_id: "list-1", highlights: ["Acreage: 1-28 Acres", "Location: ds"] },
  listing
);
assert((cmsChanged.highlights as string[])[0] === "Acreage: 1-28 Acres", "typed acreage survives a CMS value");
assert((cmsChanged.highlights as string[])[1] === "Location: ds", "typed location survives a CMS value");


// Hero photo rules (single emails)
const twoPhotos = [{ url: "https://cdn.prod.website-files.com/a/1.jpg" }, { url: "https://cdn.prod.website-files.com/a/2.jpg" }];
assert(resolveHeroPhoto("https://cdn.prod.website-files.com/a/2.jpg", twoPhotos) === "https://cdn.prod.website-files.com/a/2.jpg", "picked gallery photo #2 stays");
assert(resolveHeroPhoto("https://cdn.prod.website-files.com/a/gone.jpg", twoPhotos) === "https://cdn.prod.website-files.com/a/1.jpg", "stale CMS photo → first gallery photo");
assert(resolveHeroPhoto("https://example.com/custom.jpg", twoPhotos) === "https://example.com/custom.jpg", "pasted custom URL stays");
assert(resolveHeroPhoto("", twoPhotos) === "https://cdn.prod.website-files.com/a/1.jpg", "empty → first gallery photo");
assert(resolveHeroPhoto("https://cdn.prod.website-files.com/a/old.jpg", null) === "https://cdn.prod.website-files.com/a/old.jpg", "listing with no gallery keeps the stored photo");

const keptPhoto = overlayGroupCard(
  { listing_id: "list-1", name: "Old", photo_url: "https://cdn/picked.jpg", url: "", summary: "", chip: "" },
  listing
);
assert(keptPhoto.photo_url === "https://cdn/picked.jpg", "hand-picked group photo stays");
assert(keptPhoto.name === "Live Name", "group card name is live");

const filledPhoto = overlayGroupCard(
  { listing_id: "list-1", name: "Old", photo_url: "", url: "", summary: "", chip: "" },
  listing
);
assert(filledPhoto.photo_url === "https://cdn.prod.website-files.com/x/hero.jpg", "empty group photo fills from listing");

// Summary: what was typed in the composer wins; only an empty one is filled from the CMS
const typedSummary = overlayGroupCard(
  { listing_id: "list-1", name: "Old", photo_url: "", url: "", summary: "28 Acres · Ironwood & Warner", chip: "" },
  listing
);
assert(typedSummary.summary === "28 Acres · Ironwood & Warner", "hand-typed summary stays");
const emptySummary = overlayGroupCard(
  { listing_id: "list-1", name: "Old", photo_url: "", url: "", summary: "", chip: "" },
  listing
);
assert(emptySummary.summary === "10 Acres", "empty summary fills from the listing");

assert(listingStaysLive("draft") && listingStaysLive(null) && listingStaysLive(undefined), "drafts stay live");
assert(!listingStaysLive("scheduled") && !listingStaysLive("active") && !listingStaysLive("completed"), "scheduled+ is frozen");

const snap = listingSnapshotFields(campaign, new Date("2026-09-19T15:00:00.000Z"));
assert(snap.listing_name === "Live Name", "snapshot name");
assert(snap.photo_url === "https://cdn.prod.website-files.com/x/hero.jpg", "snapshot photo");
assert(snap.listing_synced_at === "2026-09-19T15:00:00.000Z", "snapshot time");
assert(!("heading_text" in snap) && !("intro_text" in snap) && !("body_text" in snap), "snapshot omits campaign copy");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall listing-hydrate tests passed");
