/**
 * Run: npx tsx src/lib/email/listing-hydrate.test.ts
 */

import { overlayListingOnCampaign, overlayGroupCard, listingStaysLive, listingSnapshotFields } from "./listing-hydrate";
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
    gallery: [{ url: "https://cdn/hero.jpg", alt: "" }],
  },
};

const campaign = overlayListingOnCampaign(
  {
    listing_id: "list-1",
    listing_name: "Old Name",
    photo_url: "https://cdn/old.jpg",
    heading_text: "Keep heading",
    body_text: "Keep body",
    partner_logo_url: "https://cdn/logo.png",
    broker_name: "Kevin Smith",
    highlights: ["Price: $1", "Custom: stay"],
  },
  listing
);

assert(campaign.listing_name === "Live Name", "listing name is live");
assert(campaign.photo_url === "https://cdn/hero.jpg", "hero photo is live");
assert(campaign.listing_page_url === "https://cre8advisors.com/listings/live-name", "slug url is live");
assert(campaign.heading_text === "Keep heading", "heading stays campaign copy");
assert(campaign.body_text === "Keep body", "body stays campaign copy");
assert(campaign.partner_logo_url === "https://cdn/logo.png", "partner logo stays");
assert(campaign.broker_name === "Kevin Smith", "broker stays");
assert((campaign.highlights as string[])[0] === "Price: $9", "auto highlight refreshes");
assert((campaign.highlights as string[])[1] === "Custom: stay", "custom highlight stays");

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
assert(filledPhoto.photo_url === "https://cdn/hero.jpg", "empty group photo fills from listing");

assert(listingStaysLive("draft") && listingStaysLive(null) && listingStaysLive(undefined), "drafts stay live");
assert(!listingStaysLive("scheduled") && !listingStaysLive("active") && !listingStaysLive("completed"), "scheduled+ is frozen");

const snap = listingSnapshotFields(campaign, new Date("2026-09-19T15:00:00.000Z"));
assert(snap.listing_name === "Live Name", "snapshot name");
assert(snap.photo_url === "https://cdn/hero.jpg", "snapshot photo");
assert(snap.listing_synced_at === "2026-09-19T15:00:00.000Z", "snapshot time");
assert(!("heading_text" in snap), "snapshot omits campaign copy");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall listing-hydrate tests passed");
