/**
 * Run: npx tsx src/lib/demand/active-tenants.test.ts
 */
import { categoryIsOpen, categoryRows, fitOnFirstShow, groupMapCategories, tenantMatchesQuery, toggleCategoryDisclosure, withMapLocations } from "./active-tenants";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

const brands = [
  { id: "a", brandName: "Pilot", category: "C-Store/Fuel" },
  { id: "b", brandName: "First Watch", category: "Fast Casual" },
  { id: "c", brandName: "Waffle House", category: "QSR" },
  { id: "d", brandName: "Raising Cane's", category: "QSR" },
  { id: "e", brandName: "Whataburger", category: "QSR" },
];

assert(tenantMatchesQuery(brands[0], "  ") === true, "a blank search matches every tenant");
assert(tenantMatchesQuery(brands[0], "PILOT") === true, "search ignores case");
assert(tenantMatchesQuery(brands[0], "fuel") === true, "search matches the category");
assert(tenantMatchesQuery(brands[1], "waffle") === false, "an unrelated query does not match");

const plain = groupMapCategories(brands, "", null);
assert(plain.map((group) => group.category).join("|") === "C-Store/Fuel|Fast Casual|QSR", "categories are alphabetical and empty ones are absent");
assert(plain[2].all.map((brand) => brand.brandName).join("|") === "Raising Cane's|Waffle House|Whataburger", "with no listing the category keeps brand-name order");
assert(plain[2].shown.length === plain[2].count, "with no listing the default list is the whole category");

const fits = new Map([
  ["c", { bucket: "optimal" as const, score: 2 }],
  ["e", { bucket: "optimal" as const, score: 9 }],
  ["d", { bucket: "possible" as const, score: 4 }],
]);
const ranked = groupMapCategories(brands, "", fits);
const qsr = ranked.find((group) => group.category === "QSR");
assert(qsr?.shown.map((brand) => brand.id).join() === "e,c", "the default rows are Top fits, highest score first");
assert(qsr?.all.map((brand) => brand.id).join() === "e,c,d", "expanding puts Top first and leaves the rest in the category");
assert(qsr?.count === 3, "the header count is everyone in the category");
const fuel = ranked.find((group) => group.category === "C-Store/Fuel");
assert(fuel?.shown.length === 0 && fuel?.count === 1, "a category with no Top tenants still reports its count");

const searched = groupMapCategories(brands, "waffle", fits);
assert(searched.length === 1 && searched[0].all.map((brand) => brand.id).join() === "c", "search filters across categories");
assert(groupMapCategories(brands, "zzz", fits).length === 0, "a search that matches nothing hides every category");

const cased = [
  { id: "low", brandName: "Carvana", category: "auto service" },
  { id: "proper", brandName: "Jiffy Lube", category: "Auto Service" },
  { id: "med", brandName: "VIO Med Spa", category: "medical/dental" },
  { id: "med2", brandName: "Aspen Dental", category: "Medical/Dental" },
  { id: "box", brandName: "TJX", category: "junior box" },
];
const folded = groupMapCategories(cased, "", null);
assert(
  folded.map((group) => group.category).join("|") === "Auto Service|Junior Box|Medical/Dental",
  "case variants share one title-case header"
);
assert(folded[0].count === 2 && folded[0].all.length === 2, "both casings count toward the same header");
assert(folded.find((group) => group.category === "Medical/Dental")?.count === 2, "medical/dental folds into Medical/Dental");

const located = [
  { id: "has", brandName: "Pilot", category: "C-Store/Fuel", locationCount: 4 },
  { id: "none", brandName: "Empty", category: "C-Store/Fuel", locationCount: 0 },
  { id: "only", brandName: "Ghost", category: "Hotel", locationCount: 0 },
];
const onMap = withMapLocations(located);
assert(onMap.map((brand) => brand.id).join() === "has", "a tenant with no locations is left off the map");
const mapGroups = groupMapCategories(onMap, "", null);
assert(mapGroups.length === 1 && mapGroups[0].category === "C-Store/Fuel", "a category with only empty tenants disappears");
assert(mapGroups[0].shown.length === 1 && mapGroups[0].count === 1, "the default list and the count skip tenants with no locations");

const sample = groupMapCategories(brands, "", fits).find((group) => group.category === "QSR");
const fuelGroup = groupMapCategories(brands, "", fits).find((group) => group.category === "C-Store/Fuel");
assert(sample != null && fuelGroup != null, "sample categories exist");
const top = sample?.shown.length ?? 0;
const ids = (rows: { id: string }[]) => rows.map((brand) => brand.id).join();

assert(categoryIsOpen("QSR", {}, false, false, top) === false, "with no listing a category starts collapsed");
assert(sample != null && categoryRows(sample, {}, false, false).length === 0, "with no listing a category starts with no rows");
assert(categoryIsOpen("QSR", {}, false, true, top) === true, "with a listing the triangle starts open while Top is showing");
assert(sample != null && ids(categoryRows(sample, {}, false, true)) === "e,c", "before any click a listing category shows Top");
assert(categoryIsOpen("C-Store/Fuel", {}, false, true, 0) === false, "a listing category with no Top starts collapsed");
assert(fuelGroup != null && categoryRows(fuelGroup, {}, false, true).length === 0, "no Top means the default listing view has no rows");

const collapsed = toggleCategoryDisclosure("QSR", {}, false, true, top);
assert(collapsed.QSR === false, "the first click on a listing category collapses it");
assert(sample != null && categoryRows(sample, collapsed, false, true).length === 0, "an explicit collapse hides Top tenants and every other row");
assert(categoryIsOpen("QSR", collapsed, false, true, top) === false, "the triangle points collapsed after that click");
assert(
  sample != null && categoryIsOpen("QSR", collapsed, false, true, top) === (categoryRows(sample, collapsed, false, true).length > 0),
  "the triangle matches the rows after a collapse"
);

const expanded = toggleCategoryDisclosure("QSR", collapsed, false, true, top);
assert(expanded.QSR === true, "clicking a collapsed category expands it");
assert(sample != null && ids(categoryRows(sample, expanded, false, true)) === "e,c,d", "expand shows Top first, then the rest");
assert(categoryIsOpen("QSR", expanded, false, true, top) === true, "a click is remembered");

const collapsedAgain = toggleCategoryDisclosure("QSR", expanded, false, true, top);
assert(collapsedAgain.QSR === false && sample != null && categoryRows(sample, collapsedAgain, false, true).length === 0, "clicking again hides every row, including ones on the map");

const fromAll = toggleCategoryDisclosure("QSR", {}, false, false, top);
assert(fromAll.QSR === true, "clicking a collapsed All-listings category expands it");
assert(sample != null && ids(categoryRows(sample, fromAll, false, false)) === ids(sample.all), "that expand shows the whole category");
const shut = toggleCategoryDisclosure("QSR", fromAll, false, false, top);
assert(shut.QSR === false && sample != null && categoryRows(sample, shut, false, false).length === 0, "clicking the open All-listings category collapses it");

const fuelOpen = toggleCategoryDisclosure("C-Store/Fuel", {}, false, true, 0);
assert(fuelOpen["C-Store/Fuel"] === true, "clicking a listing category that has no Top expands it");
assert(fuelGroup != null && ids(categoryRows(fuelGroup, fuelOpen, false, true)) === "a", "expand shows the tenant that is not Top");

assert(categoryIsOpen("QSR", { QSR: false }, true, true, top) === true, "search opens a category even after it was collapsed");
assert(sample != null && ids(categoryRows(sample, { QSR: false }, true, true)) === "e,c,d", "search shows every match inside a collapsed category");
const prior = { QSR: false };
const duringSearch = toggleCategoryDisclosure("QSR", prior, true, true, top);
assert(duringSearch === prior, "a click during search does not override the collapse");

assert(fitOnFirstShow(0) === true, "the first tenant on the map fits to its locations");
assert(fitOnFirstShow(1) === false, "a tenant added while another is on the map does not move the camera");
assert(fitOnFirstShow(4) === false, "later tenants leave the center and zoom where they are");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
