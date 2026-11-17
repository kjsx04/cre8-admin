/**
 * Run: npx tsx src/lib/demand/location-status.test.ts
 */
import { locationStatus, ringDash } from "./location-status";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

assert(locationStatus(null) === "open", "a blank status is open");
assert(locationStatus("") === "open", "an empty status is open");
assert(locationStatus("active") === "open", "Glenwood active is open");
assert(locationStatus("open") === "open", "open stays open");
assert(locationStatus("pending") === "under_construction", "Glenwood pending is under construction");
assert(locationStatus("under_construction") === "under_construction", "under_construction stays");
assert(locationStatus("Under Construction") === "under_construction", "spaced label normalizes");
assert(locationStatus("signed") === "signed", "signed stays signed");
assert(ringDash("open") === null, "open rings are solid");
assert(JSON.stringify(ringDash("under_construction")) === JSON.stringify([2, 1.5]), "under construction is dashed");
assert(JSON.stringify(ringDash("signed")) === JSON.stringify([0.4, 2.2]), "signed is dotted");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
