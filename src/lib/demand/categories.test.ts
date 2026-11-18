/**
 * Run: npx tsx src/lib/demand/categories.test.ts
 */
import { categoryKey, categoryLabel, categoryOptions, isMedicalDental, lookupCategory, sameCategory } from "./categories";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

assert(categoryKey("Medical/Dental") === categoryKey("medical/dental"), "medical dental ignores case and the slash");
assert(categoryKey("C-Store/Fuel") === categoryKey("c-store/fuel"), "c-store fuel ignores case and separators");
assert(categoryKey("Self-Storage") === categoryKey("self storage"), "self storage ignores the hyphen");
assert(categoryKey("QSR w/ drive-thru") === categoryKey("QSR"), "the old QSR label is the new QSR");
assert(categoryKey("coffee drive-thru") === categoryKey("Coffee"), "coffee drive-thru is Coffee");
assert(categoryKey("bank") === categoryKey("Bank/Credit Union"), "bank is Bank/Credit Union");
assert(categoryKey("daycare") === categoryKey("Childcare"), "daycare is Childcare");
assert(categoryKey("Fuel/C-store jobber") === categoryKey("C-Store/Fuel"), "the jobber label is C-Store/Fuel");
assert(sameCategory(" Auto Service ", "auto service"), "spacing and case still match");
assert(isMedicalDental("Medical/Dental") && isMedicalDental("medical/dental") && isMedicalDental("medical"), "medical labels count as dental");
assert(!isMedicalDental("Grocery"), "grocery is not medical");

const rows = [
  { category: "medical/dental", spacingMiles: 2 },
  { category: "Medical/Dental", spacingMiles: 9 },
  { category: "QSR w/ drive-thru", spacingMiles: 1.5 },
];
assert(lookupCategory(rows, "Medical/Dental")?.spacingMiles === 9, "the proper-case default wins when both rows exist");
assert(lookupCategory(rows, "medical/dental")?.spacingMiles === 9, "an old lowercase tenant still gets the proper-case default");
assert(lookupCategory(rows, "QSR")?.spacingMiles === 1.5, "QSR finds the old QSR w/ drive-thru row when that is all there is");
assert(lookupCategory(rows, "Grocery") == null, "a missing category does not invent a default");

const options = categoryOptions("junior box");
assert(options[0] === "junior box" && options.includes("QSR") && options.includes("Medical/Dental"), "a legacy category stays selectable");
assert(categoryOptions("QSR")[0] === "QSR" && !categoryOptions("QSR").includes("other"), "new tenants start from the 20 names");
assert(categoryLabel("auto service") === "Auto Service" && categoryLabel("Auto Service") === "Auto Service", "auto service shows in title case");
assert(categoryLabel("medical/dental") === "Medical/Dental" && categoryLabel("Medical/Dental") === "Medical/Dental", "medical dental folds to the canonical label");
assert(categoryLabel("grocery") === "Grocery", "a lowercase known category uses the canonical spelling");
assert(categoryLabel("c-store/fuel") === "C-Store/Fuel", "c-store keeps the canonical punctuation");
assert(categoryLabel("junior box") === "Junior Box", "an unknown category is title case");
assert(categoryLabel("  ") === "Other", "a blank category is Other");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
