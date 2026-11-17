/**
 * Run: npx tsx src/lib/demand/match.test.ts
 */

import { readFileSync } from "fs";
import { DEFAULT_TIERS, tierForValue } from "./tiers";
import { circlePolygon, haversineMiles, spacingCue } from "./geo";
import { deriveSpaces, parseSpacesHtml } from "./spaces";
import { groupTitle } from "./format";
import { CONTACT_CSV_HEADERS, TENANT_CSV_HEADERS, parseContactCsv, parseTenantCsv } from "./csv";
import { classifySpace, dealTypeFit, effectiveRequirement, groupSpaceMatches, marketMatches, matchSpaces, suggestAlsoPitch } from "./match";
import type { CategoryDefault, DemandSpace, ListingContext, SizeTier, TenantInput, TenantLocation } from "./types";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

const tiers: SizeTier[] = DEFAULT_TIERS.map((t, i) => ({ ...t, id: `t${i}` }));
const tier = (name: string) => tiers.find((t) => t.name === name)!;

assert(tierForValue(1.49, tiers, "acres")?.name === "0-1.5 ac", "1.49 ac is in 0-1.5");
assert(tierForValue(1.5, tiers, "acres")?.name === "1.5-2.5 ac", "1.5 ac starts the next tier");
assert(tierForValue(2.5, tiers, "acres")?.name === "2.5-5 ac", "2.5 ac starts 2.5-5");
assert(tierForValue(5, tiers, "acres")?.name === "5-10 ac", "5 ac starts 5-10");
assert(tierForValue(10, tiers, "acres")?.name === "10+ ac", "10 ac is 10+");
assert(tierForValue(0, tiers, "acres")?.name === "0-1.5 ac", "0 ac is in 0-1.5");
assert(tierForValue(1499, tiers, "sf")?.name === "<1,500 SF", "1,499 SF is the small shop tier");
assert(tierForValue(1500, tiers, "sf")?.name === "1,500-3,000 SF", "1,500 SF starts the next shop tier");
assert(tierForValue(15000, tiers, "sf")?.name === "15,000+ SF", "15,000 SF is the open shop tier");

const listing: ListingContext = {
  id: "listing-1",
  name: "Mesa parcel",
  city: "Mesa",
  county: "Maricopa",
  marketLabel: "Mesa",
  lat: 33.4484,
  lng: -112.074,
  zoning: "C-2",
  propertyType: "Land",
  propertyFamily: "land",
};

function space(partial: Partial<DemandSpace> & Pick<DemandSpace, "id" | "label" | "spaceType">): DemandSpace {
  return {
    acres: null,
    sf: null,
    driveThru: null,
    deal: "both",
    priceRate: null,
    status: "available",
    notes: null,
    sortOrder: 0,
    ...partial,
  };
}

function tenant(partial: Partial<TenantInput> & Pick<TenantInput, "id" | "brandName">): TenantInput {
  return {
    category: "other",
    subcategory: null,
    formats: [],
    sfMin: null,
    sfMax: null,
    acresMin: null,
    acresMax: null,
    tierIds: [],
    driveThruRequired: null,
    azMarkets: [],
    spacingMiles: null,
    active: true,
    dealLease: true,
    dealBuy: true,
    dealGroundLease: true,
    dealBts: true,
    freestanding: true,
    inline: true,
    dealTypesSource: null,
    dealTypesConfidence: null,
    researchStatus: null,
    researchPriority: null,
    lastResearched: null,
    storeCount: 0,
    ...partial,
  };
}

const qsrDefault: CategoryDefault = {
  category: "QSR",
  formats: ["pad", "ground lease", "BTS"],
  sfMin: 1800,
  sfMax: 3200,
  acresMin: 0.7,
  acresMax: 1.5,
  tierIds: [tier("0-1.5 ac").id],
  driveThruTypical: true,
  spacingMiles: 1,
};

const blank = tenant({ id: "blank", brandName: "Blank", category: "QSR" });
const inherited = effectiveRequirement(blank, qsrDefault, tiers);
assert(inherited.formats.includes("pad") && inherited.acresMin === 0.7, "null fields fall back to the category");
assert(inherited.driveThruRequired === true, "drive-thru falls back to the category typical");

const sfOnly = effectiveRequirement(
  tenant({ id: "sf", brandName: "SF only", sfMin: 2000, sfMax: 3000, formats: [] }),
  null,
  tiers
);
assert(sfOnly.treatedAsInline && sfOnly.formats.length === 1 && sfOnly.formats[0] === "inline", "SF only, no acreage or pad, is inline shop");

const namedPad = effectiveRequirement(
  tenant({ id: "pad", brandName: "Named pad", formats: ["pad"], sfMin: 2000, sfMax: 3000 }),
  null,
  tiers
);
assert(!namedPad.treatedAsInline && namedPad.formats.includes("pad"), "a listed pad format is not rewritten to inline");

const bigSite = space({ id: "site", label: "Parcel", spaceType: "land parcel", acres: 4.2, driveThru: false, deal: "sale" });
const tooBig = classifySpace(
  listing,
  bigSite,
  tenant({
    id: "burger",
    brandName: "Burger",
    formats: ["pad"],
    acresMin: 0.8,
    acresMax: 1.5,
    driveThruRequired: true,
    azMarkets: ["Mesa"],
  }),
  null,
  tiers,
  [],
  null
);
assert(tooBig.bucket === "excluded", "4.2 ac site is excluded for a 0.8-1.5 ac tenant");
assert(tooBig.reasons.includes("Needs 0.8-1.5 ac; site is 4.2 ac"), "size reason uses plain language");

const fitSite = space({ id: "fit", label: "Parcel", spaceType: "land parcel", acres: 1.1, driveThru: true, deal: "sale" });
const fit = classifySpace(
  listing,
  fitSite,
  tenant({
    id: "burger",
    brandName: "Burger",
    formats: ["pad", "ground lease"],
    acresMin: 0.8,
    acresMax: 1.5,
    driveThruRequired: true,
    azMarkets: ["Mesa"],
  }),
  null,
  tiers,
  [],
  null
);
assert(fit.bucket === "optimal", "1.1 ac in Mesa with drive-thru is optimal");
assert(fit.reasons.some((r) => r.includes("1.1 ac")), "optimal explains the size fit");

const shop = space({ id: "shop", label: "Suite 104", spaceType: "inline", sf: 2400, driveThru: false, deal: "lease" });
const noDt = classifySpace(
  { ...listing, propertyFamily: "retail", propertyType: "Retail" },
  shop,
  tenant({ id: "cafe", brandName: "Cafe", formats: ["inline"], sfMin: 2000, sfMax: 4000, driveThruRequired: true, azMarkets: ["Mesa"] }),
  null,
  tiers,
  [],
  null
);
assert(noDt.bucket === "excluded" && noDt.reasons.includes("Needs drive-thru; suite has none"), "missing drive-thru excludes a shop suite");

const wrongMarket = classifySpace(
  listing,
  fitSite,
  tenant({ id: "tucson", brandName: "Tucson", formats: ["pad"], acresMin: 0.8, acresMax: 1.5, azMarkets: ["Tucson"] }),
  null,
  tiers,
  [],
  null
);
assert(wrongMarket.bucket === "excluded" && wrongMarket.reasons.includes("Not in this market"), "a city that is not listed is out of market");
assert(marketMatches(["Phoenix metro"], "Mesa", "Maricopa"), "Phoenix metro covers Mesa");
assert(!marketMatches(["Phoenix"], "Mesa", "Maricopa"), "Phoenix the city does not cover Mesa");

const near: TenantLocation[] = [{ id: "loc", tenantId: "burger", name: "Existing", address: null, lat: 33.4484 + 1.1 / 69, lng: -112.074, status: "open" }];
const spaced = classifySpace(
  listing,
  fitSite,
  tenant({ id: "burger", brandName: "Burger", formats: ["pad"], acresMin: 0.8, acresMax: 1.5, spacingMiles: 3, azMarkets: ["Mesa"] }),
  null,
  tiers,
  near,
  null
);
assert(spaced.bucket === "excluded" && spaced.reasons.some((r) => /^Existing store 1\.\d mi away; spacing 3 mi$/.test(r)), "a store inside the spacing ring excludes");
const noStores = classifySpace(
  listing,
  fitSite,
  tenant({ id: "burger", brandName: "Burger", formats: ["pad"], acresMin: 0.8, acresMax: 1.5, spacingMiles: 3, azMarkets: ["Mesa"] }),
  null,
  tiers,
  [],
  null
);
assert(noStores.bucket === "optimal", "spacing is skipped when the tenant has no locations");

const salePad = space({ id: "sale-pad", label: "Pad A", spaceType: "pad", acres: 1.1, driveThru: true, deal: "sale" });
const buyer = tenant({
  id: "buyer",
  brandName: "Buyer",
  formats: ["pad"],
  acresMin: 0.8,
  acresMax: 1.5,
  azMarkets: ["Mesa"],
  dealLease: false,
  dealGroundLease: false,
  dealBts: false,
  inline: false,
});
assert(classifySpace(listing, salePad, buyer, null, tiers, [], null).bucket === "optimal", "a buyer of freestanding pads is optimal on a pad for sale");

const unknownDeal = tenant({
  id: "unknown",
  brandName: "Unknown",
  formats: ["pad"],
  acresMin: 0.8,
  acresMax: 1.5,
  azMarkets: ["Mesa"],
  dealBuy: null,
  dealGroundLease: null,
  dealBts: null,
});
const unknownResult = classifySpace(listing, salePad, unknownDeal, null, tiers, [], null);
assert(unknownResult.bucket === "possible" && unknownResult.reasons.includes("deal type unknown"), "unknown deal type is possible, not optimal");

const inlineOnly = tenant({
  id: "inline-only",
  brandName: "Inline only",
  formats: ["pad", "inline"],
  acresMin: 0.8,
  acresMax: 1.5,
  azMarkets: ["Mesa"],
  dealBuy: false,
  dealGroundLease: false,
  dealBts: false,
  freestanding: true,
  inline: true,
  dealLease: true,
});
const inlineOnlyResult = classifySpace(listing, salePad, inlineOnly, null, tiers, [], null);
assert(
  inlineOnlyResult.bucket === "excluded" && inlineOnlyResult.reasons.includes("Leases inline only; does not buy pads"),
  "an inline lessee is excluded from a pad for sale"
);

const groundPad = space({ id: "gl-pad", label: "Pad A", spaceType: "pad", acres: 1.1, driveThru: true, deal: "lease" });
const groundTenant = tenant({
  id: "gl",
  brandName: "Ground",
  formats: ["ground lease"],
  acresMin: 0.8,
  acresMax: 1.5,
  azMarkets: ["Mesa"],
  dealBuy: false,
  dealLease: false,
  dealBts: false,
});
assert(classifySpace(listing, groundPad, groundTenant, null, tiers, [], null).bucket === "optimal", "a ground-lease tenant fits a pad for lease");
const noGround = classifySpace(listing, groundPad, { ...groundTenant, dealGroundLease: false }, null, tiers, [], null);
assert(noGround.bucket === "excluded" && noGround.reasons.includes("Does not ground lease"), "a tenant who does not ground lease is excluded from a lease pad");

const shopLease = space({ id: "shop-lease", label: "Suite 100", spaceType: "inline", sf: 2400, deal: "lease" });
const shopTenant = tenant({
  id: "shopper",
  brandName: "Shopper",
  formats: ["inline"],
  sfMin: 2000,
  sfMax: 4000,
  azMarkets: ["Mesa"],
  freestanding: false,
  dealBuy: false,
  dealGroundLease: false,
  dealBts: false,
});
assert(classifySpace({ ...listing, propertyFamily: "retail", propertyType: "Retail" }, shopLease, shopTenant, null, tiers, [], null).bucket === "optimal", "an inline lessee is optimal on a lease suite");
const officeListing = { ...listing, propertyFamily: "office" as const, propertyType: "Office" };
const dentalOnOffice = classifySpace(officeListing, shopLease, { ...shopTenant, category: "Medical/Dental" }, null, tiers, [], null);
assert(!dentalOnOffice.reasons.includes("Property type is Office"), "Medical/Dental is not a mismatch on an office listing");
const oldDentalOnOffice = classifySpace(officeListing, shopLease, { ...shopTenant, category: "medical/dental" }, null, tiers, [], null);
assert(!oldDentalOnOffice.reasons.includes("Property type is Office"), "the old medical/dental label is still medical");
const groceryOnOffice = classifySpace(officeListing, shopLease, { ...shopTenant, category: "Grocery" }, null, tiers, [], null);
assert(groceryOnOffice.reasons.includes("Property type is Office"), "Grocery on an office listing is called out");
const notInline = classifySpace(
  { ...listing, propertyFamily: "retail", propertyType: "Retail" },
  shopLease,
  { ...shopTenant, inline: false },
  null,
  tiers,
  [],
  null
);
assert(notInline.bucket === "excluded" && notInline.reasons.includes("Does not take inline space"), "explicit inline = no excludes a shop suite");
assert(dealTypeFit(shopLease, { ...shopTenant, dealLease: null }).status === "unknown", "a blank lease flag is unknown");

const bare = tenant({
  id: "bare",
  brandName: "",
  formats: undefined as unknown as string[],
  azMarkets: undefined as unknown as string[],
  tierIds: undefined as unknown as string[],
  dealLease: null,
  dealBuy: null,
  dealGroundLease: null,
  dealBts: null,
  freestanding: null,
  inline: null,
});
const bareResult = classifySpace(listing, salePad, bare, null, [], [], null);
assert(bareResult.bucket === "possible" && bareResult.reasons.includes("deal type unknown"), "blank research and empty arrays stay possible instead of throwing");

const pads = ["A", "B", "C", "D"].map((letter, i) =>
  space({
    id: `pad-${letter}`,
    label: `Pad ${letter}`,
    spaceType: "pad",
    acres: [0.9, 1.0, 1.2, 1.4][i],
    sortOrder: i,
    driveThru: true,
  })
);
const wide = space({ id: "pad-E", label: "Parcel E", spaceType: "land parcel", acres: 6, sortOrder: 4, driveThru: true });
const tierTenant = tenant({
  id: "tiered",
  brandName: "Tiered",
  formats: ["pad", "ground lease"],
  tierIds: [tier("0-1.5 ac").id],
  azMarkets: ["Mesa"],
});
const grouped = groupSpaceMatches(
  matchSpaces({
    listing,
    spaces: [...pads, wide],
    tenants: [tierTenant],
    defaults: [],
    tiers,
    locations: [],
    overrides: [],
  }),
  tiers
);
assert(grouped.length === 2, "a 6 ac parcel does not share a group with the small pads");
assert(grouped[0].title === "Pads A, B, C, D, 0-1.5 ac", "small pads collapse to one group label");
assert(grouped[0].tenants[0].bucket === "optimal", "the shared group is the optimal set");
assert(grouped[1].tenants[0].bucket === "excluded", "the 6 ac parcel is its own excluded result");
assert(groupTitle(pads, "0-1.5 ac") === "Pads A, B, C, D, 0-1.5 ac", "group title pluralizes pad labels");

const split = groupSpaceMatches(
  matchSpaces({
    listing,
    spaces: pads,
    tenants: [tierTenant],
    defaults: [],
    tiers,
    locations: [],
    overrides: [{ spaceId: "pad-A", tenantId: "tiered", decision: "exclude", reason: "Owner asked us to skip Pad A" }],
  }),
  tiers
);
assert(split.length === 2, "a per-pad override pulls that pad out of the shared group");
assert(split.some((g) => g.spaces.length === 1 && g.spaces[0].id === "pad-A"), "the overridden pad stands alone");

const openTenant = tenant({ id: "open", brandName: "Open", formats: ["pad"], azMarkets: ["Mesa"] });
const tierSplit = groupSpaceMatches(
  matchSpaces({
    listing,
    spaces: [
      space({ id: "small", label: "Pad A", spaceType: "pad", acres: 1.2, sortOrder: 0, driveThru: true }),
      space({ id: "mid", label: "Pad B", spaceType: "pad", acres: 4, sortOrder: 1, driveThru: true }),
    ],
    tenants: [openTenant],
    defaults: [],
    tiers,
    locations: [],
    overrides: [],
  }),
  tiers
);
assert(tierSplit.length === 2, "pads in different acre tiers stay in separate groups");
assert(tierSplit[0].tierName === "0-1.5 ac" && tierSplit[1].tierName === "2.5-5 ac", "each group keeps its acre tier");

const renter = tenant({
  id: "renter",
  brandName: "Renter",
  formats: ["pad"],
  acresMin: 0.8,
  acresMax: 1.5,
  azMarkets: ["Mesa"],
  dealLease: true,
  dealBuy: false,
  dealGroundLease: null,
  dealBts: null,
  freestanding: true,
  inline: true,
});
const renterResult = classifySpace(listing, salePad, renter, null, tiers, [], null);
assert(renterResult.bucket !== "optimal", "a lease-only brand is not pitched for a pad that is for sale");

const forced = classifySpace(listing, bigSite, tenant({ id: "x", brandName: "X", formats: ["inline"], sfMin: 1000, sfMax: 2000 }), null, tiers, [], {
  spaceId: "site",
  tenantId: "x",
  decision: "include",
  reason: "Landlord asked",
});
assert(forced.bucket === "optimal" && forced.reasons[0].includes("Included by override"), "include override moves a tenant to optimal");

const html = `<table><tbody>
<tr><td>Pad A</td><td>1.3 Acres</td></tr>
<tr><td>Pad B</td><td>.75 Acres</td></tr>
</tbody></table>`;
const derived = deriveSpaces({
  id: "l",
  name: "Center",
  acres: 28,
  propertyType: "Retail Pads",
  listingType: "For Sale/Lease",
  spacesHtml: html,
  overview: "Drive-thru opportunity",
});
assert(derived.length === 2 && derived[0].acres === 1.3 && derived[1].acres === 0.75, "pad rows are used instead of the 28 ac site total");
assert(derived.every((s) => s.spaceType === "pad" && s.driveThru === true), "parsed pads keep drive-thru from the overview");
const shopsOnPadSite = deriveSpaces({
  id: "l2",
  name: "Blossom",
  acres: 28,
  propertyType: "Retail Pads",
  listingType: "For Sale",
  spacesHtml: "<table><tr><td>PAD A</td><td>1.3 Acres</td></tr><tr><td>SHOPS A</td><td>8000 SF</td></tr><tr><td>PAD C</td><td>2.0 Acres</td></tr></table>",
});
assert(shopsOnPadSite.length === 3, "each pad and shop row is its own space");
assert(shopsOnPadSite[0].spaceType === "pad" && shopsOnPadSite[0].acres === 1.3, "an acre pad stays a pad");
assert(shopsOnPadSite[1].spaceType === "inline" && shopsOnPadSite[1].sf === 8000, "shop square footage stays shop space on a pad site");
assert(shopsOnPadSite[2].spaceType === "pad" && shopsOnPadSite[2].acres === 2, "a 2.0 acre pad is not folded into the shop row");
const suite = parseSpacesHtml("<table><tr><td>Suite 104</td><td>2,400 SF</td></tr></table>");
assert(suite.length === 1 && suite[0].amount === 2400 && suite[0].unit === "sf", "a suite row keeps the square footage");

const miles = haversineMiles(33.45, -112.07, 33.45 + 1 / 69, -112.07);
assert(miles > 0.9 && miles < 1.1, "one degree-minute of latitude is about a mile");
const ring = circlePolygon(-112.07, 33.45, 3);
const edge = haversineMiles(33.45, -112.07, ring[0][1], ring[0][0]);
assert(edge > 2.8 && edge < 3.2, "a spacing ring is drawn at the requested radius");

const cue = spacingCue(
  { lat: 33.4484, lng: -112.074 },
  [{ brandName: "Burger", spacingMiles: 3, locations: [{ name: "Store", lat: near[0].lat as number, lng: near[0].lng as number }] }]
);
assert(cue.tone === "close", "the map cue flags a listing inside a ring");
assert(spacingCue({ lat: 33.45, lng: -112 }, [{ brandName: "Burger", spacingMiles: 1, locations: [] }]).tone === "no-locations", "no stored locations is called out");

const chicken = tenant({ id: "chicken", brandName: "Chicken", category: "QSR", formats: ["pad"], tierIds: [tier("0-1.5 ac").id] });
const wash = tenant({ id: "wash", brandName: "Wash", category: "Car Wash", formats: ["pad"], tierIds: [tier("0-1.5 ac").id] });
const pitches = suggestAlsoPitch({
  tenantId: "tiered",
  tenants: [{ ...tierTenant, category: "QSR" }, chicken, wash],
  defaults: [],
  tiers,
  relationships: [{ id: "r", tenantId: "tiered", relatedTenantId: "chicken", relation: "competitor" }],
  space: pads[0],
  buckets: new Map([
    ["chicken", "optimal"],
    ["wash", "optimal"],
  ]),
});
assert(pitches.length === 1 && pitches[0].brandName === "Chicken" && pitches[0].why === "Competitor", "a linked competitor is the pitch, not every pad user");

const sameCategory = suggestAlsoPitch({
  tenantId: "tiered",
  tenants: [{ ...tierTenant, category: "QSR w/ drive-thru" }, chicken],
  defaults: [],
  tiers,
  relationships: [],
  space: pads[0],
  buckets: new Map([["chicken", "possible"]]),
});
assert(sameCategory[0]?.why === "Same category, compatible format", "QSR and the old QSR label still pitch together");

const tenantCsv = parseTenantCsv(
  `${TENANT_CSV_HEADERS.join(",")}\nEXAMPLE — Bowl,Fast Casual,,inline|endcap,2000,4000,,,"1,500-3,000 SF|3,000-6,000 SF",,Mesa|Chandler,,Broker call,2026-01-15,"Quoted, keep",true\n`
);
assert(tenantCsv.errors.length === 0 && tenantCsv.rows[0].formats[0] === "inline", "tenant CSV reads pipe-separated formats");
assert(tenantCsv.rows[0].sizeTiers.length === 2 && tenantCsv.rows[0].azMarkets[1] === "Chandler", "tenant CSV reads tiers and markets");
assert(tenantCsv.rows[0].notes === "Quoted, keep", "quoted commas stay inside the notes field");

const contactCsv = parseContactCsv(
  `${CONTACT_CSV_HEADERS.join(",")}\nEXAMPLE — Bowl,broker,EXAMPLE — Sonoran,Jane Doe,Associate,jane@example.test,602-555-0100,true,seed,High,2026-11-01\n`
);
assert(contactCsv.errors.length === 0 && contactCsv.rows[0].contactType === "broker" && contactCsv.rows[0].confidence === "High", "contact CSV reads a broker row");
assert(parseContactCsv("brand_name,contact_type,name\nX,vendor,Pat\n").errors.length === 1, "a bad contact type is rejected");

const sql = readFileSync("supabase/migrations/2026-11-17_demand.sql", "utf8");
for (const name of ["0-1.5 ac", "1.5-2.5 ac", "2.5-5 ac", "5-10 ac", "10+ ac", "<1,500 SF", "15,000+ SF"]) {
  assert(sql.includes(`'${name}'`), `migration seeds ${name}`);
}
assert(!sql.includes("0-2 ac") && !sql.includes("15+ ac") && !sql.includes("5-15 ac"), "the old acreage tiers are not seeded");

const researchSql = readFileSync("supabase/migrations/2026-11-17_tenant_research.sql", "utf8");
for (const column of ["deal_lease", "deal_buy", "deal_ground_lease", "deal_bts", "freestanding", "inline", "deal_types_source", "deal_types_confidence", "research_status", "research_priority", "last_researched", "tenant_research_log"]) {
  assert(researchSql.includes(column), `research migration includes ${column}`);
}
assert(researchSql.includes("add column if not exists") && researchSql.includes("create table if not exists"), "research migration is idempotent");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
