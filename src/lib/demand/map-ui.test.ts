/**
 * Run: npx tsx src/lib/demand/map-ui.test.ts
 */
import { readFileSync } from "fs";
import { showAllAllowed, SHOW_ALL_LIMIT, SHOW_ALL_TOOLTIP } from "./board";
import { effectiveSpacing } from "./spacing";
import { googleMapsUrl, pinDiameter, pinIconScale, pinPlaceLabel, pinStrokeDash } from "./pins";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

assert(effectiveSpacing(2, 1) === 2, "a tenant override wins");
assert(effectiveSpacing(0, 3) === 0, "zero is an override, not a missing value");
assert(effectiveSpacing(null, 1.5) === 1.5, "null uses the category default");
assert(effectiveSpacing(undefined, 3) === 3, "undefined uses the category default");
assert(effectiveSpacing(null, null) === null, "no override and no default draws no ring");

assert(showAllAllowed(50) === true, "50 tenants can be shown");
assert(showAllAllowed(51) === false, "51 tenants cannot be shown at once");
assert(showAllAllowed(0) === true, "an empty board can be shown");
assert(SHOW_ALL_LIMIT === 50, "the cap is 50");
assert(SHOW_ALL_TOOLTIP === "Only available under 50 tenants", "the hover tooltip copy");

assert(pinDiameter(8) === 6, "below metro zoom the pin stays 6px");
assert(pinDiameter(9) === 6, "metro zoom is 6px");
assert(pinDiameter(16) === 14, "street zoom is 14px");
assert(pinDiameter(18) === 14, "past street zoom the pin stays 14px");
assert(Math.abs(pinDiameter(12.5) - 10) < 0.001, "diameter interpolates between the stops");
assert(Math.abs(pinIconScale(9) - 6 / 14) < 0.0001, "icon scale at metro zoom");
assert(pinIconScale(16) === 1, "icon scale at street zoom is 1");

assert(pinStrokeDash("open") === null, "open pins are solid");
assert(pinStrokeDash("under_construction") != null, "under construction pins are dashed");
const signed = pinStrokeDash("signed");
const built = pinStrokeDash("under_construction");
assert(signed != null && built != null && signed[0] < built[0] && signed[1] > built[1], "signed dashes are shorter and farther apart");

assert(pinPlaceLabel("  1 E Main  ", 33.4, -112.1) === "1 E Main", "a stored address is the label");
assert(pinPlaceLabel(null, 33.448376, -112.074036) === "33.448376, -112.074036", "no address shows coordinates");
assert(
  googleMapsUrl(33.4, -112.1) === "https://www.google.com/maps/search/?api=1&query=33.4%2C-112.1",
  "google maps link uses the pin coordinate"
);

const map = readFileSync("src/components/demand/BrandMap.tsx", "utf8");
assert(!map.includes('["feature-state"'), "pins and rings do not use a feature-state expression");
assert(!map.includes("setFeatureState"), "opacity is not applied with setFeatureState");
assert(map.includes('"icon-opacity": 1'), "store pins are drawn at full opacity");
assert(map.includes("None within 10 mi"), "a tenant with nothing nearby says so");
assert(map.includes("No locations"), "a tenant with no stores says so");
assert(map.includes("Location status"), "a new pin asks for its status on the map");
assert(map.includes("groupMapCategories"), "tenants are grouped by category");
assert(map.includes("Expand"), "a category header expands");
assert(map.includes("ring-black"), "a tenant on the map has a black outline");
assert(map.includes("bg-accent-soft"), "Top rows use the soft CRE8 green fill");
assert(!map.includes("text-warning-fg") && !map.includes("bg-warning"), "Top names stay black, not gold");
assert(map.includes("ml-auto"), "the disclosure triangle is right-aligned");
assert(map.includes("text-base font-semibold"), "category headers are at least as large as the tenant names");
assert(map.includes("border-y border-border"), "category headers have a divider above and below");
assert(map.includes("pl-4"), "tenant rows sit in from the header");
assert(map.includes("opacity-40"), "add location stays faint until the row is hovered");
assert(map.includes("withMapLocations"), "tenants with no locations are left off the map list");
assert(map.includes("applyStoreEdits"), "a location fetch cannot wipe a pin that just saved");
assert(map.includes("bumpLocations"), "saving a location updates the tenant count");
assert(map.includes('"fill-color": ["get", "color"]'), "spacing rings fill with the tenant pin color");
assert(map.includes('"line-color": ["get", "color"]'), "spacing rings stroke with the tenant pin color");
assert(map.includes('"fill-opacity": RING_FILL_OPACITY'), "spacing ring fill is lighter than the pin");
assert(map.includes('"line-opacity": RING_LINE_OPACITY'), "spacing ring stroke is lighter than the pin");
const ringPaint = map.slice(map.indexOf('id: "ring-fill"'), map.indexOf('id: "listing-dot"'));
assert(
  ringPaint.length > 0 && !ringPaint.includes('"line-color": RING') && !ringPaint.includes('"fill-color": RING'),
  "spacing rings do not use the generic ring color"
);
assert(!map.includes(">Showing<") && !map.includes(">Active<"), "there is no pinned Active or Showing section");
assert(map.includes('aria-label="Clear map"'), "the map can be cleared");
assert(map.includes(">Done<"), "add location switches to a Done button");
assert(map.includes("stopAdding"), "Done and Esc leave add mode");
assert(map.includes("fitOnFirstShow"), "only the first tenant on the map moves the camera");
assert(map.includes('requestFit("tenant")'), "that first tenant is framed on its locations");
assert(map.includes('requestFit("listing")'), "choosing a listing still fits the map");
const deactivate = map.slice(map.indexOf("function deactivate"), map.indexOf("async function activate"));
assert(deactivate.length > 0 && !deactivate.includes("requestFit") && !deactivate.includes("setFitRequest"), "removing a tenant does not move the camera");
const clear = map.slice(map.indexOf("function clearMap"), map.indexOf("function armPlace"));
assert(clear.length > 0 && !clear.includes("requestFit") && !clear.includes("setFitRequest"), "Clear map does not move the camera");
assert(!map.includes("stageRowFlip"), "rows stay where they are");
const listingEffects = map.split("useEffect(").filter((block) => block.includes("[listingId]"));
assert(
  listingEffects.length > 0 && listingEffects.every((block) => !block.includes("setActive")),
  "changing the listing keeps tenants on the map"
);

const table = readFileSync("src/components/demand/TenantTable.tsx", "utf8");
assert(table.includes(">No locations<"), "the list shows the no-locations note");
assert(table.includes("groupMapCategories"), "the list reuses the map's category groups");
assert(table.includes("categoryIsOpen"), "search opens the same categories as the map");
assert(table.includes("bg-accent-soft"), "Top rows in the list use the soft CRE8 green fill");
assert(!table.includes("text-warning") && !table.includes("bg-warning"), "the list does not use the gold Top fill");
assert(table.includes("Edit "), "the edit pencil stays");
assert(table.includes('"Brand"') && table.includes('"Broker"') && table.includes('"In-house"'), "the list keeps its columns");

const service = readFileSync("src/lib/demand/service.ts", "utf8");
assert(service.includes('source: "manual"'), "a pin added from Demand is stored as manual");

const sql = readFileSync("supabase/migrations/2026-11-17_spacing_defaults.sql", "utf8");
for (const snippet of [
  "('coffee drive-thru', 1)",
  "('QSR w/ drive-thru', 1.5)",
  "('c-store/fuel', 2)",
  "('grocery', 3)",
  "('fast casual', 1.5)",
  "('medical/dental', 2)",
  "('other', 2)",
  "('Fuel/C-store jobber', 2)",
  "('entertainment', 3)",
  "('dessert', 1)",
  "('childcare', 2)",
  "('self-storage / truck rental', 3)",
  "('medical', 2)",
  "spacing_miles is null",
  "spacing_miles = 1",
]) {
  assert(sql.includes(snippet), `migration contains ${snippet}`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
