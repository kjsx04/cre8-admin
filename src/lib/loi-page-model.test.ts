/**
 * The editor preview reads the generated docx, so its columns and footer
 * are the letter's, not a second copy of the wording.
 * Run: npx tsx src/lib/loi-page-model.test.ts
 */
import { generateDocxBuffer } from "./generate-docx";
import { loiPreviewModel } from "./loi-page-model";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log("ok ", msg);
  else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

const bytes = generateDocxBuffer({
  docType: "loi_land",
  variables: {
    date: "November 18, 2026",
    buyer_entity: "Sonoran Outpatient Partners LLC",
    seller_entity: "Camelback Medical Holdings LLC",
    property_address: "4040 E Camelback Road",
    parcel_number: "172-28-001A",
    purchase_price: "$4,750,000",
    earnest_money: "$100,000",
    emd_days: "3",
    dd_period: "90",
    acreage: "8.75",
    psa_draft_days: "10",
    closing_period: "45",
    extension_count: "1",
    extension_days: "30",
  },
});

const model = loiPreviewModel(bytes);
assert(!!model, "land letter becomes a preview model");
assert(!!model?.letterheadBase64, "letterhead image is available to the page");
assert(!!model?.logoBase64, "header logo is available to the page");
assert(model?.borderColor.toLowerCase() === "#92d050", "page border is the CRE8 green");
assert((model?.footer || "").includes("4120 E. Indian School"), "footer line is the 4120 address");

const earnest = model?.blocks.find((block) => block.left.some((run) => run.text.startsWith("Earnest Money")));
assert(!!earnest && earnest.kind === "columns" && earnest.hangInches === 2, "Earnest Money keeps the two-inch value column");
assert(earnest?.number === "5.", "Earnest Money is item 5");
assert((earnest?.right || []).some((run) => run.text.includes("three")), "the value stays in the right column");
assert(earnest?.align === "justify", "the long Earnest Money paragraph is justified");
assert((earnest?.left || []).every((run) => run.fontFamily.includes("Calibri")), "land labels stay Calibri");

const building = loiPreviewModel(generateDocxBuffer({
  docType: "loi_building",
  variables: {
    date: "November 18, 2026",
    buyer_entity: "Sonoran Outpatient Partners LLC",
    seller_entity: "Camelback Medical Holdings LLC",
    property_address: "4040 E Camelback Road",
    parcel_number: "172-28-001A",
    purchase_price: "$4,750,000",
    seller_broker_email: "rachel.torres@cushwake.com",
  },
}));
const reLine = building?.blocks.find((block) => block.left.some((run) => run.text === "Re"));
assert(!!reLine && reLine.kind === "columns" && reLine.hangInches === 1, "the building Re line uses the one-inch tab");
assert((reLine?.right || []).every((run) => run.fontFamily.includes("Cambria") && run.italic), "the building Re line stays Cambria italic");
const email = building?.blocks.find((block) => block.left.some((run) => run.text === "Email"));
const address = email?.left.find((run) => run.text.includes("@"));
assert(address?.sizePt === 9 && address.color === "#1155CC" && address.underline, "the building email stays a 9pt blue link");

const property = model?.blocks.find((block) => block.number === "1.");
assert(!!property && property.left.some((run) => run.text.startsWith("Property")), "the label stays in the left column");

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
