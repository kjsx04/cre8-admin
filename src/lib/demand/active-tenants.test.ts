/**
 * Run: npx tsx src/lib/demand/active-tenants.test.ts
 */
import { fitOnFirstShow, groupMapCategories, tenantMatchesQuery } from "./active-tenants";

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

assert(fitOnFirstShow(0) === true, "the first tenant on the map fits to its locations");
assert(fitOnFirstShow(1) === false, "a tenant added while another is on the map does not move the camera");
assert(fitOnFirstShow(4) === false, "later tenants leave the center and zoom where they are");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
