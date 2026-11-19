/**
 * Section toggles, the non-binding carve-out, parcel summing, and number words.
 * Run: npx tsx src/lib/loi-sections.test.ts
 */
import PizZip from "pizzip";
import { generateDocxBuffer } from "./generate-docx";
import { summarizeParcels } from "./loi-parcels";
import { bindingCarveout, defaultLoiClauses } from "./loi-sections";
import { loiPreviewModel } from "./loi-page-model";
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
assert(land.includes("Offer Expiration:"), "land starts with offer expiration checked");
assert(defaultLoiClauses("loi_land").every((clause) => clause.id === "financing_contingency" || clause.id === "as_is_purchase" || clause.id === "exchange_1031" || clause.id === "right_of_first_refusal" || clause.id === "seller_carryback" || clause.included), "template sections start checked");
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
assert(building.includes("Confidentiality") && building.includes("Exclusive Dealings"), "building starts with both sections on");
assert(building.includes("Offer Expiration:"), "building starts with offer expiration on");
assert(building.includes("“Confidentiality” and “Exclusive Dealings” provisions"), "building carve-out cites both by default");

const buildingOn = textOf("loi_building", [
  { id: "exclusive_dealings", included: false },
  { id: "confidentiality", included: true },
  { id: "offer_expiration", included: true },
]);
assert(buildingOn.includes("Confidentiality:"), "building can turn Confidentiality on");
assert(!buildingOn.includes("Exclusive Dealings:"), "building can turn Exclusive Dealings off");
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

{
  const bytes = generateDocxBuffer({
    docType: "loi_land",
    variables: { buyer_entity: "A", seller_entity: "B", property_address: "4040 E Camelback", purchase_price: "$1", earnest_money: "$2" },
    clauses: [{ id: "earnest_money", included: false }],
  });
  const body = textOf("loi_land", [{ id: "earnest_money", included: false }]);
  assert(!body.includes("Earnest Money"), "unchecked Earnest Money leaves the letter");
  const model = loiPreviewModel(bytes);
  const contract = model?.blocks.find((block) => block.left.some((run) => run.text.startsWith("Contract")));
  assert(contract?.number === "5.", "the next numbered item becomes 5");
  const xml = new PizZip(bytes).file("word/document.xml")?.asText() ?? "";
  const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const paraText = (paragraph: string) =>
    (paragraph.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map((node) => node.replace(/<[^>]+>/g, "")).join("").trim();
  const priceAt = paras.findIndex((paragraph) => paraText(paragraph).includes("Purchase Price"));
  const contractAt = paras.findIndex((paragraph) => paraText(paragraph).includes("Contract"));
  const between = paras.slice(priceAt + 1, contractAt).filter((paragraph) => !paraText(paragraph)).length;
  assert(between === 1, "removing Earnest Money leaves a single spacer, not a double gap");
  const extensionAt = paras.findIndex((paragraph) => paraText(paragraph).includes("Closing Extension"));
  const disclosuresAt = paras.findIndex((paragraph, index) => index > extensionAt && paraText(paragraph).includes("Disclosures"));
  const beforeDisclosures = paras.slice(extensionAt + 1, disclosuresAt).filter((paragraph) => !paraText(paragraph)).length;
  assert(beforeDisclosures === 1, "the gap before Seller's Disclosures is one spacer, not a run of blank paragraphs");
}

{
  const bytes = generateDocxBuffer({
    docType: "loi_land",
    variables: {
      buyer_entity: "Sonoran Outpatient Partners LLC",
      seller_entity: "Camelback Medical Holdings LLC",
      property_address: "4040 E Camelback Road, Phoenix, AZ 85018",
      parcel_number: "172-28-001A",
      purchase_price: "$4,750,000",
      acreage: "8.75",
      earnest_money: "",
      earnest_money_written: "",
      emd_days: "3",
      title_company: "Fidelity National Title",
      title_agent: "Kristina Gooding",
    },
  });
  const xml = new PizZip(bytes).file("word/document.xml")?.asText() ?? "";
  const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const paraText = (paragraph: string) =>
    (paragraph.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map((node) => node.replace(/<[^>]+>/g, "")).join("").replace(/\s+/g, " ").trim();
  const earnestPara = paras.find((paragraph) => paraText(paragraph).startsWith("Earnest Money"));
  assert(paraText(earnestPara || "") === "Earnest Money:", "a checked blank earnest section keeps only its heading");
  assert(!paraText(earnestPara || "").includes("Fidelity"), "a blank earnest value has no leftover title sentence");
  const model = loiPreviewModel(bytes);
  const earnest = model?.blocks.find((block) => block.left.some((run) => run.text.startsWith("Earnest Money")));
  assert(earnest?.number === "5.", "the blank earnest heading stays item 5");
  assert((earnest?.right || []).every((run) => run.text.trim() === ""), "the blank earnest value column is empty");
  const closingAt = model?.blocks.findIndex((block) => block.left.some((run) => run.text.startsWith("If the basic terms"))) ?? -1;
  assert(closingAt > 0 && model?.blocks[closingAt - 1]?.kind === "break", "the closing starts on a new page");
  const exhibitAt = model?.blocks.findIndex((block) => block.left.some((run) => run.text.startsWith("Exhibit A"))) ?? -1;
  assert(exhibitAt > closingAt && model?.blocks[exhibitAt - 1]?.kind === "break", "Exhibit A starts on its own page");
}

{
  const blankProperty = textOf("loi_land", undefined, { acreage: "", zoning: "" });
  assert(blankProperty.includes("Property:"), "a checked blank property section keeps its heading");
  assert(!blankProperty.includes("Approximately"), "a blank property value is not a placeholder sentence");
}

for (const docType of ["loi_land", "loi_building"]) {
  const xml = new PizZip(generateDocxBuffer({
    docType,
    variables: { buyer_entity: "A", seller_entity: "B", property_address: "4040 E Camelback", acreage: "1" },
  })).file("word/document.xml")?.asText() ?? "";
  const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const paraText = (paragraph: string) =>
    (paragraph.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map((node) => node.replace(/<[^>]+>/g, "")).join("");
  const closing = paras.findIndex((paragraph) => paraText(paragraph).includes("If the basic terms and conditions of this Offer"));
  const exhibit = paras.findIndex((paragraph) => paraText(paragraph).includes("Exhibit A"));
  assert(/<w:br\b[^>]*w:type="page"/.test(paras[closing] || ""), `${docType}: page break before the closing`);
  assert(exhibit > closing, `${docType}: Exhibit A follows the signature`);
  assert(/<w:br\b[^>]*w:type="page"/.test(paras[exhibit] || ""), `${docType}: page break before Exhibit A`);
  assert(!paras.slice(closing + 1, exhibit).some((paragraph) => /w:type="page"/.test(paragraph)), `${docType}: the signature stays with the closing`);
}

const leaseXml = new PizZip(generateDocxBuffer({
  docType: "loi_lease",
  variables: { tenant_entity: "Desert Dental Group LLC", property_address: "21001 N Tatum" },
})).file("word/document.xml")?.asText() ?? "";
assert(!leaseXml.includes("Exhibit A:"), "the lease letter does not gain an Exhibit A page");

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
