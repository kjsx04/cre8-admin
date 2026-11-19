/**
 * Run: npx tsx src/lib/listings/standard-options.test.ts
 */

import { CALL_FOR_PRICING, MUNICIPALITY_OPTIONS, countyForCity, formatCityCounty, isCallForPricing, readCityCounty, readMunicipality, tidyPrice } from "./standard-options";
import { buildSpFolderName } from "../listing-utils";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

// ---- City / County ----
assert(formatCityCounty("Mesa", "Maricopa") === "Mesa, Maricopa County, AZ", "the standard spelling");
assert(formatCityCounty("Mesa", "Maricopa County") === "Mesa, Maricopa County, AZ", "County is not doubled");
assert(formatCityCounty("", "Pinal") === "Pinal County, AZ", "county only");
assert(formatCityCounty("Wellton", "") === "Wellton, AZ", "city only");
assert(formatCityCounty("", "") === "", "nothing chosen is blank");
assert(countyForCity("Queen Creek") === "Maricopa" && countyForCity("Nowhere") === "", "the county follows the city");

const read = (text: string) => {
  const r = readCityCounty(text);
  return `${r.city}|${r.county}|${r.cityIsStandard}`;
};
assert(read("Queen Creek / Maricopa") === "Queen Creek|Maricopa|true", "an old slash value is read into the dropdowns");
assert(read("Mesa, Maricopa County, AZ") === "Mesa|Maricopa|true", "the standard spelling reads back to itself");
assert(read("Pinal County") === "|Pinal|false", "county only");
assert(read("Wellton, Yuma County, AZ") === "Wellton|Yuma|false", "a city that isn't in the list is kept as typed");
assert(read("") === "||false", "blank");
// What the dropdowns write must read back as the same choice.
for (const [city, county] of [["Mesa", "Maricopa"], ["Maricopa", "Pinal"], ["Yuma", "Yuma"], ["Casa Grande", "Pinal"], ["", "Gila"]]) {
  const back = readCityCounty(formatCityCounty(city, county));
  assert(back.city === city && back.county === county, `"${formatCityCounty(city, county)}" reads back as the same city and county`);
}
// The SharePoint folder name takes the city from before the first comma — unchanged by the new spelling.
assert(buildSpFolderName("123 Main St", formatCityCounty("Mesa", "Maricopa")) === "123 Main St — Mesa", "the SharePoint folder still ends with the city");
assert(buildSpFolderName("123 Main St", "Mesa, Maricopa") === "123 Main St — Mesa", "…the same folder as the old hand-typed spelling");

// ---- Zoning municipality ----
assert(MUNICIPALITY_OPTIONS.includes("Mesa") && MUNICIPALITY_OPTIONS.includes("Pinal County"), "cities and counties are both choices");
assert(readMunicipality("Town of Queen Creek").value === "Queen Creek" && readMunicipality("Town of Queen Creek").isStandard, "Town of is dropped");
assert(readMunicipality("pinal county").value === "Pinal County", "capitals are fixed");
assert(readMunicipality("AG").isStandard === false && readMunicipality("AG").value === "AG", "something that isn't a place is shown as typed");

// ---- List price ----
assert(tidyPrice("call for pricing") === CALL_FOR_PRICING && tidyPrice("Call For Pricing") === CALL_FOR_PRICING, "one spelling of Call for Pricing");
assert(isCallForPricing(" Call for pricing ") && !isCallForPricing("$2,000,000"), "Call for Pricing is recognised in any capitals");
assert(tidyPrice("2200000") === "$2,200,000", "a bare number becomes a price");
assert(tidyPrice("$765,000") === "$765,000", "a tidy price is unchanged");
assert(tidyPrice("$2200000.50") === "$2,200,000.50", "cents are kept");
assert(tidyPrice("$18.50/SF NNN") === "$18.50/SF NNN", "a rent is left as typed");
assert(tidyPrice("18.50") === "18.50", "a small number is not turned into a sale price");
assert(tidyPrice("$2.2M") === "$2.2M", "shorthand is left as typed");
assert(tidyPrice("") === "", "blank stays blank");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
