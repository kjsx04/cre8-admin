/**
 * Section toggles, the non-binding carve-out, parcel summing, and number words.
 * Run: npx tsx src/lib/loi-sections.test.ts
 */
import PizZip from "pizzip";
import { generateDocxBuffer } from "./generate-docx";
import { summarizeParcels } from "./loi-parcels";
import { bindingCarveout } from "./loi-sections";
import { countPhrase } from "./number-to-words";
import { dollarToWritten, numberToWritten } from "./number-to-words";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log("ok ", msg);
  else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

function textOf(docType: string, clauses?: { id: string; included?: boolean; customText?: string }[], extra: Record<string, string> = {}) {
  const bytes = generateDocxBuffer({
    docType,
    clauses,
    variables: {
      date: "November 18, 2026",
      buyer_entity: "Sonoran Outpatient Partners LLC",
      seller_entity: "Camelback Medical Holdings LLC",
      property_address: "4040 E Camelback Road, Phoenix, AZ 85018",
      parcel_number: "172-28-001A",
      purchase_price: "$4,750,000",
      earnest_money: "$100,000",
      earnest_money_written: dollarToWritten("$100,000"),
      emd_days: "3",
      psa_draft_days: "10",
      closing_period: "45",
      closing_period_written: numberToWritten("45"),
      extension_count: "1",
      extension_days: "30",
      extension_deposit: "$25,000",
      seller_disclosures_days: "5",
      dd_period: "90",
      acreage: "8.75",
      broker_names: "Kevin Smith",
      commission_pct: "3%",
      ...extra,
    },
  });
  const xml = new PizZip(bytes).file("word/document.xml")?.asText() ?? "";
  return Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
    .map((match) => match[1].replace(/&amp;/g, "&"))
    .join("")
    .replace(/\s+/g, " ");
}

assert(countPhrase("90", "days") === "ninety (90) days", "ninety (90) days");
assert(bindingCarveout(["confidentiality", "exclusive_dealings"]).includes("“Confidentiality” and “Exclusive Dealings” provisions"), "both sections are cited");
assert(bindingCarveout(["confidentiality"]) === " (except the parties shall be bound by the terms of the “Confidentiality” provision)", "one section is cited alone");
assert(bindingCarveout([]) === "", "no checked section means no carve-out");

const land = textOf("loi_land");
assert(land.includes("ninety (90)"), "due diligence days are written out");
assert(land.includes("thirty (30)"), "the hardcoded 30 days is written out");
assert(land.includes("Exclusive Dealings") && land.includes("Confidentiality"), "land defaults include both sections");
assert(land.includes("“Confidentiality” and “Exclusive Dealings” provisions"), "land carve-out cites both");
assert(!land.includes("loi_sec_"), "section markers are not visible");
assert(!land.includes("zoned"), "blank zoning adds nothing");
assert((new PizZip(generateDocxBuffer({
  docType: "loi_land",
  variables: { buyer_entity: "A", property_address: "4040 E Camelback" },
})).file("word/document.xml")?.asText() || "").includes('w:hanging="2880"'), "default land keeps the hanging indent");

const landOff = textOf("loi_land", [
  { id: "exclusive_dealings", included: false },
  { id: "confidentiality", included: true },
  { id: "closing_extension", included: false },
]);
assert(!landOff.includes("Exclusive Dealings"), "unchecked Exclusive Dealings is removed");
assert(!landOff.includes("Closing Extension"), "unchecked extension is removed");
assert(landOff.includes("Confidentiality"), "checked Confidentiality stays");
assert(landOff.includes("“Confidentiality” provision"), "carve-out follows the checked section");
assert(!landOff.includes("Exclusive Dealings"), "carve-out does not cite a removed section");

const building = textOf("loi_building");
assert(!building.includes("Confidentiality") && !building.includes("Exclusive Dealings"), "building leaves those sections off");
assert(!building.includes("except the parties shall be bound"), "building has no carve-out by default");

const buildingOn = textOf("loi_building", [
  { id: "confidentiality", included: true },
  { id: "offer_expiration", included: true },
]);
assert(buildingOn.includes("Confidentiality:"), "building can turn Confidentiality on");
assert(buildingOn.includes("Offer Expiration:"), "offer expiration can be turned on");
assert(buildingOn.includes("ten (10) days"), "offer expiration writes the day count");
{
  const xml = new PizZip(generateDocxBuffer({
    docType: "loi_building",
    variables: { buyer_entity: "A", property_address: "4040 E Camelback", offer_expiration_days: "10" },
    clauses: [{ id: "offer_expiration", included: true }],
  })).file("word/document.xml")?.asText() ?? "";
  const paragraph = xml.split(/<w:p\b/).find((part) => part.includes("Offer Expiration")) || "";
  assert(paragraph.includes("<w:numPr"), "an inserted section keeps Word numbering");
  assert(paragraph.includes('w:hanging="2880"'), "an inserted section keeps the hanging indent");
}
assert(buildingOn.includes("“Confidentiality” provision"), "building carve-out cites only what is on");

const zoned = textOf("loi_land", undefined, { zoning: "C-2" });
assert(zoned.includes("(zoned C-2)"), "zoning is added where the property line can hold it");

const summary = summarizeParcels([
  { id: "172-28-001A", address: "4040 E Camelback", owner: "Alpha LLC", acreage: "1.25", zoning: "C-2" },
  { id: "172-28-001B", address: "4042 E Camelback", owner: "Beta LLC", acreage: "2.50", zoning: "C-2" },
  { id: "172-28-001A", address: "4040 E Camelback", owner: "Alpha LLC", acreage: "1.25", zoning: "C-2" },
]);
assert(summary.acreage === "3.75", "acres are summed across every selected parcel");
assert(summary.parcel_number === "172-28-001A, 172-28-001B", "every APN is listed once");
assert(summary.ownersDiffer && summary.seller_entity === "Alpha LLC; Beta LLC", "different owners are all listed");
assert(summary.zoning === "C-2", "the same zoning is listed once");

if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
