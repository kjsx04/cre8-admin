/**
 * Run: npx tsx src/lib/demand/active-tenants.test.ts
 */
import { partitionTenants, tenantMatchesQuery } from "./active-tenants";

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
];

assert(tenantMatchesQuery(brands[0], "  ") === true, "a blank search matches every tenant");
assert(tenantMatchesQuery(brands[0], "PILOT") === true, "search ignores case");
assert(tenantMatchesQuery(brands[0], "fuel") === true, "search matches the category");
assert(tenantMatchesQuery(brands[1], "waffle") === false, "an unrelated query does not match");

const searched = partitionTenants(brands, ["b"], "waffle");
assert(searched.active.map((brand) => brand.id).join() === "b", "an active tenant stays up while the search changes");
assert(searched.list.map((brand) => brand.id).join() === "c", "search filters the list under the active tenants");

const named = partitionTenants(brands, ["a"], "pilot");
assert(named.active.length === 1 && named.list.length === 0, "a search that matches an active tenant does not list it twice");

const none = partitionTenants(brands, ["a", "c"], "zzz");
assert(none.active.length === 2 && none.list.length === 0, "active tenants remain when the search matches nothing");

const order = partitionTenants(brands, ["c", "a", "missing"], "");
assert(order.active.map((brand) => brand.id).join() === "c,a", "active order follows the pinned ids");
assert(order.list.map((brand) => brand.id).join() === "b", "pinned tenants are left out of the list");

const dup = partitionTenants(brands, ["a", "a"], "");
assert(dup.active.length === 1 && dup.list.length === 2, "a repeated active id is kept once");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
