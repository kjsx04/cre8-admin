/**
 * Run: npx tsx src/lib/demand/number-input.test.ts
 */

import { readTypedNumber } from "./number-input";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

const read = (text: string) => {
  const result = readTypedNumber(text);
  return result.ok ? result.value : "error";
};

assert(read("") === null, "an empty box is blank");
assert(read("   ") === null, "spaces only is blank");
assert(read("2500") === 2500, "plain number");
assert(read("2,500") === 2500, "a comma is accepted (this used to save as blank)");
assert(read("2,500 SF") === 2500, "a number with SF");
assert(read("12,000 sq ft") === 12000, "a number with sq ft");
assert(read("1.5 ac") === 1.5, "a number with ac");
assert(read("2 acres") === 2, "a number with acres");
assert(read("3 mi") === 3, "a number with mi (this used to save as blank)");
assert(read("0.75 miles") === 0.75, "a number with miles");
assert(read(".5") === 0.5, "a leading decimal point");
assert(read("0") === 0, "zero is a number, not blank");
assert(read("abc") === "error", "words are an error, not a blank");
assert(read("1-2") === "error", "a range in one box is an error");
assert(read("-3") === "error", "a negative number is an error");
assert(read("1.2.3") === "error", "two decimal points is an error");
assert(read("$2500") === "error", "a dollar sign is an error");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
