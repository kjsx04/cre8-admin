/**
 * Run: npx tsx src/lib/listings/webflow-mirror.test.ts
 *
 * The mirror copies listings out of Webflow into Supabase. The parts worth
 * pinning down are the ones that would do damage if wrong: a draft leaking to
 * the public, a truncated Webflow response being read as "these were deleted",
 * and a failed file copy leaving a row pointing at nothing.
 */

import {
  listingStatus,
  mapItemToRow,
  filesFor,
  needsSync,
  safeToRemove,
  imagePath,
  docPath,
  extOf,
  type WebflowItem,
} from "./webflow-mirror";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const CDN = "https://cdn.prod.website-files.com/site";
const item: WebflowItem = {
  id: "item1",
  isDraft: false,
  createdOn: "2026-09-08T19:47:55.629Z",
  lastUpdated: "2026-09-08T21:10:12.621Z",
  lastPublished: "2026-09-09T15:36:03.421Z",
  fieldData: {
    name: "Hunt & Attaway",
    slug: "hunt-attaway",
    "square-feet": 7.345,
    "building-sqft": "12000.4",
    "list-price": "Call for Pricing",
    "listing-type-2": "13f04de01e08de37ea5f8ec4427d2dc4",
    "property-type": "1e01fc2af78fe67044bfde09e9e9c4e1",
    "listing-brokers": ["wfA", "wfUnknown"],
    "traffic-count": 25000,
    "under-contract": true,
    sold: false,
    floorplan: { fileId: "f1", url: `${CDN}/f1_card.jpeg`, alt: "card" },
    gallery: [
      { fileId: "f1", url: `${CDN}/f1_card.jpeg`, alt: "one" },
      { fileId: "f2", url: `${CDN}/f2_two.PNG`, alt: null },
    ],
    "package-2": `${CDN}/abc_Hunt%20%26%20Attaway%20package.pdf`,
  },
};

// ── Status ──
assert(listingStatus(item) === "live", "published, not sold → live");
assert(listingStatus({ ...item, isDraft: true }) === "draft", "isDraft → draft");
assert(listingStatus({ ...item, lastPublished: null }) === "draft", "never published → draft (stays private)");
assert(listingStatus({ ...item, fieldData: { ...item.fieldData, sold: true } }) === "sold", "sold flag → sold");

// ── Paths ──
assert(extOf("https://x/y/photo.JPEG?v=1", "jpg") === "jpeg", "extension is lower-cased, query ignored");
assert(extOf("https://x/y/noext", "jpg") === "jpg", "no extension → fallback");
assert(imagePath("item1", item.fieldData.gallery[1]) === "item1/f2.png", "image path is <item>/<fileId>.<ext>");
assert(docPath("item1", item.fieldData["package-2"]) === "item1/abc_Hunt-Attaway-package.pdf", "doc name is decoded and made storage-safe");

// ── Files ──
const files = filesFor(item);
assert(files.length === 3, "card image shared with gallery photo 1 is copied once (2 images + 1 pdf)");
assert(files.filter((f) => f.bucket === "listing-packages").length === 1, "pdf goes to the packages bucket");

// ── Row mapping ──
const urls = { [`${CDN}/f1_card.jpeg`]: "https://sb/f1.jpeg" }; // f2 and the pdf "failed" to copy
const row = mapItemToRow(item, { wfA: "uuid-a" }, urls);
assert(row.acres === 7.345, "acres come from the misnamed square-feet field, unrounded");
assert(row.building_sqft === 12000, "building sqft is a whole number");
assert(row.listing_type === "For Sale/Lease" && row.listing_type_id === "13f04de01e08de37ea5f8ec4427d2dc4", "listing type keeps name + raw id");
assert(row.property_type === "Land", "property type is a display name");
assert(row.traffic_count === "25000", "traffic count is stored as text");
assert(row.under_contract === true, "under contract carries over");
assert(row.broker_ids.length === 1 && row.broker_ids[0] === "uuid-a", "known brokers map to Supabase ids, unknown ones are dropped");
assert(row.webflow_broker_ids.length === 2, "raw Webflow broker ids are all kept");
assert(row.marketing_image === "https://sb/f1.jpeg", "card image points at the Supabase copy");
assert(row.gallery[0].url === "https://sb/f1.jpeg" && row.gallery[0].source_url === `${CDN}/f1_card.jpeg`, "gallery keeps where each photo came from");
assert(row.gallery[1].url === `${CDN}/f2_two.PNG`, "a photo that failed to copy keeps its Webflow URL");
assert(row.package_url === item.fieldData["package-2"], "a pdf that failed to copy keeps its Webflow URL");
assert(row.list_price === "Call for Pricing", "price stays text");
assert(row.webflow_field_data === item.fieldData, "the raw Webflow record is stored whole");

const bare = mapItemToRow({ id: "x", lastPublished: "2026-01-01T00:00:00Z", fieldData: { slug: "s", name: "n" } }, {});
assert(bare.acres === null && bare.gallery.length === 0 && bare.marketing_image === null, "missing fields become null, not errors");
assert(bare.under_contract === false && bare.available === true, "flags default sensibly");

// ── Change detection ──
const stored = { webflow_updated_at: "2026-09-08T21:10:12.621+00:00", published_at: "2026-09-09T15:36:03.421+00:00", status: "live" };
assert(needsSync(item, stored) === false, "same timestamps in a different format → unchanged");
assert(needsSync(item, undefined) === true, "no row yet → sync");
assert(needsSync(item, { ...stored, webflow_updated_at: null }) === true, "blanked marker (failed copy) → retry");
assert(needsSync({ ...item, lastUpdated: "2026-10-01T00:00:00Z" }, stored) === true, "edited in Webflow → sync");
assert(needsSync({ ...item, lastPublished: "2026-10-01T00:00:00Z" }, stored) === true, "re-published → sync");

// ── Deletion safety ──
assert(safeToRemove(64, 64, 60) === true, "full response → deletions allowed");
assert(safeToRemove(100, 130, 100) === false, "truncated page → never delete");
assert(safeToRemove(64, undefined, 60) === false, "no total reported → never delete");
assert(safeToRemove(10, 10, 60) === false, "collection suddenly a fraction of its size → never delete");
assert(safeToRemove(0, 0, 60) === false, "empty response → never delete");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall webflow-mirror checks passed");
