/**
 * Run: npx tsx src/lib/demand/markets.test.ts
 *
 * Standard city / county: the listing's hand-typed field on one side, the
 * tenant's free-text markets on the other. Every sample below is a value that
 * was really in the database on Nov 19 2026.
 */

import { checkMarket, resolveMarkets, standardPlace } from "./markets";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

function place(raw: string, address?: string, lat?: number, lng?: number): string {
  const p = standardPlace(raw, address, lat, lng);
  return `${p.city ?? "-"}|${p.county ?? "-"}${p.cityGuessed ? "|guess" : ""}`;
}

// ---- Listing side ----
assert(place("Mesa, Maricopa County, AZ") === "Mesa|Maricopa", "city, county, state");
assert(place("Queen Creek / Maricopa") === "Queen Creek|Maricopa", "slash, and Maricopa after a city is the county");
assert(place("Fountain Hills/Maricopa") === "Fountain Hills|Maricopa", "slash with no spaces");
assert(place("Phoenix, Maricopa") === "Phoenix|Maricopa", "county without the word County");
assert(place("Casa Grande, AZ") === "Casa Grande|Pinal", "the county is filled in from the city");
assert(place("Queen Creek") === "Queen Creek|Maricopa", "city only");
assert(place("Gold Canyon") === "Gold Canyon|Pinal", "small town");
assert(place("Tucson, AZ") === "Tucson|Pima", "outside the metro");
assert(place("Camp Verde, Yavapai County, AZ") === "Camp Verde|Yavapai", "Yavapai");
assert(place("Maricopa, Pinal County") === "Maricopa|Pinal", "Maricopa with a county named is the city of Maricopa");
assert(place("Pinal County") === "-|Pinal", "county only, nothing else to go on");
assert(place("Pinal") === "-|Pinal", "bare county name");
assert(place("") === "-|-", "blank");
assert(place("Pinal County", "SWC Arizona Farms Road & Apollo Dr , QUEEN CREEK, AZ") === "Queen Creek|Pinal", "city taken from the address, typed county kept");
assert(place("Pinal County", "SEC Gilbert Road & Queen Creek Road") === "-|Pinal", "a street named after a city is not a city");
assert(place("Pinal County, AZ", "", 32.98, -111.52) === "Coolidge|Pinal|guess", "city guessed from the map pin, inside the typed county");
assert(place("", "", 33.42, -111.83) === "Mesa|Maricopa|guess", "no text at all: nearest city to the pin");
assert(place("Pinal County", "", 36.9, -109.1) === "-|Pinal", "a pin far from every known city is not guessed");

// ---- Tenant side ----
function check(markets: string[], city: string | null, county: string | null) {
  return checkMarket(markets, { city, county });
}
assert(check([], "Mesa", "Maricopa") === "none", "no markets on file");
assert(check(["Various"], "Mesa", "Maricopa") === "none", "filler is not a market");
assert(check(["Arizona"], "Coolidge", "Pinal") === "match", "Arizona is anywhere in the state");
assert(check(["Arizona statewide (incl. SE Tucson, Buckeye)"], "Globe", "Gila") === "match", "statewide with examples is still statewide");
assert(check(["Phoenix metro"], "Mesa", "Maricopa") === "match", "metro covers Mesa");
assert(check(["Phoenix metro (Valley wide)"], "San Tan Valley", "Pinal") === "match", "metro covers San Tan Valley");
assert(check(["Phoenix metro"], "Coolidge", "Pinal") === "miss", "metro does not cover Coolidge");
assert(check(["Phoenix"], "Mesa", "Maricopa") === "miss", "Phoenix the city is not Mesa");
assert(check(["North Phoenix"], "Phoenix", "Maricopa") === "match", "a part of Phoenix is Phoenix");
assert(check(["North Scottsdale"], "Scottsdale", "Maricopa") === "match", "a part of Scottsdale is Scottsdale");
assert(check(["Ahwatukee"], "Phoenix", "Maricopa") === "match", "a Phoenix neighbourhood");
assert(check(["PV"], "Paradise Valley", "Maricopa") === "match", "PV is Paradise Valley");
assert(check(["East Valley"], "Queen Creek", "Maricopa") === "match", "East Valley covers Queen Creek");
assert(check(["East Valley"], "Glendale", "Maricopa") === "miss", "East Valley is not Glendale");
assert(check(["West Valley (Glendale, Goodyear, Buckeye)"], "Surprise", "Maricopa") === "match", "West Valley covers Surprise");
assert(check(["Northwest Valley (Peoria, Surprise)"], "Goodyear", "Maricopa") === "miss", "Northwest Valley is not read as West Valley");
assert(check(["Pinal County"], "Florence", "Pinal") === "match", "a county market covers its cities");
assert(check(["Maricopa"], "Maricopa", "Pinal") === "match", "bare Maricopa in a tenant's markets is the city");
assert(check(["Maricopa"], "Mesa", "Maricopa") === "miss", "…and does not cover the whole county");
assert(check(["Texas"], "Mesa", "Maricopa") === "miss", "another state never matches");
assert(check(["Lake Havasu"], "Lake Havasu City", "Mohave") === "match", "short form of a city name");
assert(check(["Collective on Ocotillo area (Chandler)"], "Chandler", "Maricopa") === "match", "a city inside a longer note");
assert(check(["Wellton"], "Wellton", "Yuma") === "match", "a town missing from the table still matches itself");
assert(check(["Gilbert", "Tucson"], null, "Pinal") === "miss", "county-only listing, none of the tenant's cities in that county");
assert(check(["Casa Grande"], null, "Pinal") === "unknown", "county-only listing, tenant wants a city in that county");
assert(check(["Phoenix metro"], null, null) === "unknown", "nothing on the listing to check");
assert(resolveMarkets(["Sun City West"]).cities.has("sun city west") && !resolveMarkets(["Sun City West"]).cities.has("sun city"), "the longest city name wins");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
