/**
 * Run: npx tsx src/lib/email/listing-context.test.ts
 */

import { isBodyLength, serializeListingFacts } from "./listing-context";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const facts = serializeListingFacts({
  id: "abc",
  fieldData: {
    name: "West Valley Land",
    "full-address": "4120 E Indian School Rd, Phoenix, AZ",
    "city-county": "Phoenix, Maricopa",
    "list-price": "$4,250,000",
    "square-feet": 12.4,
    zoning: "C-2",
    "property-overview": "Pad-ready retail site at a signalized corner.",
    "listing-brokers": ["6987fb6d372758be66e14cb8"],
    gallery: [{ url: "https://x/a.jpg", alt: "Aerial of the pad" }, { url: "https://x/b.jpg", alt: "" }],
  },
});

assert(facts.includes("Name: West Valley Land"), "includes name");
assert(facts.includes("Price: $4,250,000"), "includes price");
assert(facts.includes("Acres: 12.4"), "includes acres");
assert(facts.includes("Listing brokers: Kevin Smith"), "resolves broker id");
assert(facts.includes("Photo captions: Aerial of the pad"), "includes photo alt, skips empty");
assert(!facts.includes("https://x/a.jpg"), "does not dump photo URLs");
assert(!/invent|comp/i.test(facts), "no invented extra fields");
assert(isBodyLength("2-sentences") && !isBodyLength("essay"), "length guard");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall listing-context tests passed");
