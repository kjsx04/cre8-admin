/**
 * Run: npx tsx src/lib/demand/contact-line.test.ts
 */
import { contactLine } from "./contact-line";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

const broker = contactLine("Brian Gausden", "Western Retail Advisors", true);
assert(broker?.name === "Brian Gausden" && broker.company === "Western Retail Advisors", "a broker keeps the name and the brokerage");

const house = contactLine("Kevin Smith", "CRE8 Advisors", false);
assert(house?.name === "Kevin Smith" && house.company === "", "in-house is the name only");

const firmOnly = contactLine("  ", "CRE8 Advisors", true);
assert(firmOnly?.name === "" && firmOnly.company === "CRE8 Advisors", "a brokerage with no person is still a broker cell");

const nameOnly = contactLine("Kevin Smith", "  ", true);
assert(nameOnly?.name === "Kevin Smith" && nameOnly.company === "", "a broker with no brokerage is just the name");

assert(contactLine(null, null, true) === null, "nothing to show is empty");
assert(contactLine("  ", null, false) === null, "a blank in-house name is empty");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
