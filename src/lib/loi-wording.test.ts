/**
 * LOI wording fixes. Listing agreements are checked only to confirm they
 * were not rewritten.
 *
 * Run: npx tsx src/lib/loi-wording.test.ts
 */
import PizZip from "pizzip";
import { generateDocxBuffer } from "./generate-docx";
import {
  applyLoiDerived,
  extensionClause,
  landPricePerUnit,
  psaDraftClause,
} from "./loi-wording";
import { dollarToWritten, numberToWritten } from "./number-to-words";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log("ok ", msg);
  else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

function textOf(bytes: Buffer): string {
  const xml = new PizZip(bytes).file("word/document.xml")?.asText() ?? "";
  return Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
    .map((m) =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
    )
    .join("")
    .replace(/\s+/g, " ");
}

assert(numberToWritten("45") === "forty-five", "forty-five is hyphenated");
assert(numberToWritten("120") === "one hundred twenty", "hundred does not take a hyphen");
assert(numberToWritten("21") === "twenty-one", "twenty-one is hyphenated");
assert(numberToWritten("5") === "five", "listing-style small counts stay the same");
assert(
  dollarToWritten("$100,000") === "one hundred thousand and 00/100 dollars",
  "whole dollars include and 00/100"
);
assert(
  dollarToWritten("100000.50") === "one hundred thousand and 50/100 dollars",
  "cents are kept in the written amount"
);

assert(
  psaDraftClause({ psa_drafted_by: "Seller", psa_draft_days: "10" }) ===
    "Seller will commence preparation of the Purchase Agreement and deliver the same to Buyer for review within ten (10) business days.",
  "Seller drafts and Buyer reviews"
);
assert(
  psaDraftClause({ psa_drafted_by: "Buyer", psa_draft_days: "10" }) ===
    "Buyer will commence preparation of the Purchase Agreement and deliver the same to Seller for review within ten (10) business days.",
  "Buyer drafts and Seller reviews"
);
assert(
  psaDraftClause({}) .startsWith("Seller will commence"),
  "missing choice defaults to Seller"
);
assert(
  extensionClause({ extension_count: "1", extension_days: "30", extension_deposit: "$25,000" }) ===
    "Buyer shall have one (1) thirty (30)-day extension for an additional $25,000 earnest money deposit.",
  "one extension stays singular"
);
assert(
  extensionClause({ extension_count: "2", extension_days: "30", extension_deposit: "$25,000" }).includes(
    "two (2) thirty (30)-day extensions"
  ),
  "two extensions are plural"
);
assert(
  !extensionClause({ extension_count: "1", extension_days: "30", extension_deposit: "" }).includes("additional"),
  "a blank extension deposit drops the deposit sentence"
);
assert(
  landPricePerUnit({ mode: null, pricePerAcre: "$850,000", pricePerSqft: "$19.51" }) === "($850,000 per acre)",
  "typing the total still shows the per-acre price"
);
assert(
  landPricePerUnit({ mode: "per_sqft", pricePerAcre: "$850,000", pricePerSqft: "$19.51" }) === "($19.51 PSF)",
  "an explicit per-square-foot price still wins"
);

const full = applyLoiDerived({
  seller_broker_email: "rachel.torres@cushwake.com",
  broker_names: "Kevin Smith",
  permitted_use: "general dentistry and related professional services",
  renewal_option: "one (1) five-year option",
  guarantor: "Desert Dental Group LLC",
  ti_allowance_psf: "$65.00",
  free_rent_months: "3 months",
  cam_expenses: "$8.50 per square foot",
  landlord_contact_name: "Dana Ruiz",
  trade_name: "Desert Dental",
  lease_term: "ten (10) years",
  exclusive_use: "No other dentist in the Center.",
  landlord_work: "Vanilla shell.",
  extension_count: "2",
  extension_days: "30",
  extension_deposit: "$25,000",
  psa_draft_days: "10",
});
assert(full.permitted_use_clause.startsWith(", primarily") && !full.permitted_use_clause.includes(" of a "), "permitted use has no hardcoded article");
assert(full.ti_block.includes("$65.00 per square foot") && !full.ti_block.includes("$$"), "TI amount has one dollar sign");
assert(full.broker_names_suffix === " (Kevin Smith)", "broker name is wrapped once");

const blank = applyLoiDerived({
  seller_broker_email: "",
  broker_names: " ",
  permitted_use: "",
  renewal_option: "",
  guarantor: "",
  ti_allowance_psf: "",
  free_rent_months: "",
  cam_expenses: "",
  landlord_contact_name: "",
  trade_name: "",
  lease_term: "",
  exclusive_use: "",
  landlord_work: "",
});
assert(blank.seller_broker_email_line === "", "blank email produces no Email: line");
assert(blank.broker_names_suffix === "", "blank broker produces no empty parentheses");
assert(blank.permitted_use_clause === "", "blank use produces no operation-of clause");
assert(blank.renewal_block === "", "blank renewal produces no Term for");
assert(blank.guarantor_block === "", "blank guarantor produces no guarantee sentence");
assert(blank.ti_block === "", "blank TI produces no per-square-foot sentence");
assert(blank.landlord_contact_line === "", "blank contact produces no colon");
assert(blank.cam_equal_to === "", "blank CAM produces no equal-to fragment");

const purchase = {
  date: "November 18, 2026",
  seller_broker_name: "Rachel Torres",
  seller_broker_company: "Cushman & Wakefield",
  seller_broker_email: "rachel.torres@cushwake.com",
  property_address: "4040 E Camelback Road, Phoenix, AZ 85018",
  parcel_number: "172-28-001A",
  buyer_entity: "Sonoran Outpatient Partners LLC",
  seller_entity: "Camelback Medical Holdings LLC",
  purchase_price: "$4,750,000",
  earnest_money: "$100,000",
  earnest_money_written: dollarToWritten("$100,000"),
  emd_days: "3",
  emd_days_written: numberToWritten("3"),
  title_company: "Fidelity National Title",
  title_agent: "Kristina Gooding",
  psa_draft_days: "10",
  psa_drafted_by: "Seller",
  closing_period: "45",
  closing_period_written: numberToWritten("45"),
  extension_count: "2",
  extension_days: "30",
  extension_deposit: "$25,000",
  seller_disclosures_days: "5",
  seller_disclosures_days_written: numberToWritten("5"),
  dd_period: "60",
  dd_period_written: numberToWritten("60"),
  broker_names: "Kevin Smith",
  commission_pct: "3%",
  cre8_agent_email: "Kevin@cre8advisors.com",
  cre8_agent_phone: "518.428.8316",
  acreage: "8.75",
  price_per_unit: "($850,000 per acre)",
};

function assertCommonPurchase(label: string, body: string, drafter: "Seller" | "Buyer") {
  const reviewer = drafter === "Seller" ? "Buyer" : "Seller";
  assert(body.includes(`${drafter} will commence preparation`), `${label}: ${drafter} drafts`);
  assert(body.includes(`deliver the same to ${reviewer} for review`), `${label}: delivered to ${reviewer}`);
  assert(body.includes("forty-five (45)"), `${label}: hyphenated closing days`);
  assert(body.includes("one hundred thousand and 00/100 dollars"), `${label}: legal money words`);
  assert(body.includes("two (2) thirty (30)-day extensions"), `${label}: plural extension`);
  assert(!body.includes("Day (30) day"), `${label}: no doubled Day`);
  assert(!body.includes("shall by bound"), `${label}: by/be typo is gone`);
  assert(body.includes("CRE8 Advisors, LLC"), `${label}: brokerage legal name`);
  assert(body.includes("Exhibit A:"), `${label}: Exhibit A follows the signature`);
  assert(!/Email:\s*$/.test(body) && body.includes("Email: rachel.torres@cushwake.com"), `${label}: email line is filled`);
  assert(!body.includes("()"), `${label}: no empty parentheses`);
}

const building = textOf(generateDocxBuffer({ docType: "loi_building", variables: purchase }));
assertCommonPurchase("building", building, "Seller");
assert(building.includes("Confidentiality") && building.includes("Exclusive Dealings"), "building starts with Confidentiality and Exclusive Dealings on");

const buildingBuyer = textOf(generateDocxBuffer({
  docType: "loi_building",
  variables: { ...purchase, psa_drafted_by: "Buyer" },
}));
assert(buildingBuyer.includes("Buyer will commence preparation"), "form choice Buyer drafts");
assert(buildingBuyer.includes("deliver the same to Seller for review"), "Buyer delivers the draft to Seller");

const land = textOf(generateDocxBuffer({ docType: "loi_land", variables: purchase }));
assertCommonPurchase("land", land, "Seller");
assert(land.includes("shall be bound"), "land keeps a binding carve-out and fixes the typo");
assert(land.includes("Confidentiality") && land.includes("Exclusive Dealings"), "land cites the sections it actually contains");
assert(land.includes("($850,000 per acre)"), "land price per acre reaches the letter");
assert(land.includes(", and/or assignee"), "land intro uses the same comma as the building letter");
assert(!land.includes(". (APN"), "land Re line drops the stray period before the APN");
assert(!land.includes("85018 ."), "land Re line has no space before that period");
{
  const landXml = new PizZip(generateDocxBuffer({ docType: "loi_land", variables: purchase })).file("word/document.xml")?.asText() ?? "";
  const landParas = landXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const paraText = (paragraph: string) =>
    (paragraph.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map((node) => node.replace(/<[^>]+>/g, "")).join("");
  assert(landParas.some((paragraph) => paraText(paragraph) === "Rachel Torres"), "land contact name is its own line");
  assert(landParas.some((paragraph) => paraText(paragraph).includes("Cushman &amp; Wakefield") && !paraText(paragraph).includes("Rachel")), "land company is its own line");
}
const acres = textOf(generateDocxBuffer({ docType: "loi_land", variables: { ...purchase, acreage: "3.75" } }));
assert(acres.includes("Approximately 3.75"), "the letter prints the Acreage field");
assert(!acres.includes("8.75"), "a different acreage does not stay in the letter");

const buildingZip = new PizZip(generateDocxBuffer({ docType: "loi_building", variables: purchase }));
const rels = buildingZip.file("word/_rels/document.xml.rels")?.asText() ?? "";
assert(rels.includes("mailto:rachel.torres@cushwake.com"), "mailto matches the typed seller email");
assert(!rels.includes("mikeg@lakeviewvillagecorp.com"), "the old mikeg mailto is gone");
assert(rels.includes("mailto:Kevin@cre8advisors.com"), "CRE8 agent mailto matches the typed agent email");
const buildingXml = buildingZip.file("word/document.xml")?.asText() ?? "";
const buildingStyles = buildingZip.file("word/styles.xml")?.asText() ?? "";
assert(buildingStyles.includes("minorHAnsi"), "building keeps the theme font instead of a forced Calibri rewrite");
assert(buildingXml.includes('w:hanging="2880"'), "building numbered lines keep the hanging indent");
assert((buildingXml.match(/<w:tab[\s/>]/g) || []).length > 80, "building keeps the tabs between labels and text");
assert(/<w:b\b/.test(buildingXml) || /<w:b\/>/.test(buildingXml) || /<w:bCs\b/.test(buildingXml), "building keeps bold runs");

const sparsePurchase = {
  ...purchase,
  seller_broker_name: "",
  seller_broker_company: "",
  seller_broker_email: "",
  broker_names: "",
  cre8_agent_email: "",
  cre8_agent_phone: "",
  extension_deposit: "",
};
const sparseBuilding = textOf(generateDocxBuffer({ docType: "loi_building", variables: sparsePurchase }));
assert(!sparseBuilding.includes("Email:"), "blank seller email omits the Email label");
assert(!sparseBuilding.includes("()"), "blank broker omits empty parentheses");
assert(!sparseBuilding.includes("additional"), "blank deposit omits the deposit clause");
assert(!/mailto:/i.test(new PizZip(generateDocxBuffer({ docType: "loi_building", variables: sparsePurchase })).file("word/_rels/document.xml.rels")?.asText() ?? ""), "blank email adds no mailto");

const unnamedBuyer = textOf(generateDocxBuffer({
  docType: "loi_building",
  variables: { ...purchase, buyer_entity: "", earnest_money: "", earnest_money_written: "" },
}));
assert(unnamedBuyer.includes("the Buyer, and/or assignee"), "blank buyer is still named in the introduction");
assert(unnamedBuyer.includes("Buyer:"), "a checked blank buyer keeps its heading");
assert(!unnamedBuyer.includes("Buyer:Sonoran"), "blank buyer value stays empty");
assert(!unnamedBuyer.includes("the sum of"), "blank earnest omits the empty sum");

const leaseVars = {
  date: "November 18, 2026",
  property_name: "Desert Ridge Marketplace",
  property_address: "21001 N Tatum Boulevard, Phoenix, AZ 85050",
  landlord_contact_name: "Dana Ruiz",
  tenant_entity: "Desert Dental Group LLC",
  landlord: "Vestar Camelback LLC",
  square_footage: "4,250",
  trade_name: "Desert Dental",
  permitted_use: "general dentistry and related professional services",
  lease_term: "ten (10) years",
  renewal_option: "one (1) five-year option",
  base_rent_psf: "$32.50",
  free_rent_months: "3 months",
  rent_increase_pct: "3%",
  rent_commencement_days: "180",
  rent_commencement_days_written: numberToWritten("180"),
  guarantor: "Desert Dental Group LLC",
  security_deposit: "Security Deposit shall be equal to one month's rent",
  cam_expenses: "$8.50 per square foot",
  exclusive_use: "No other general dentistry practice in the Center.",
  ti_allowance_psf: "$65.00",
  landlord_work: "Vanilla shell.",
  commission_pct: "4%",
  broker_names: "Lindsey Dulle",
  cre8_agent_email: "Lindsey@cre8advisors.com",
  cre8_agent_phone: "602.317.7713",
};
const lease = textOf(generateDocxBuffer({ docType: "loi_lease", variables: leaseVars }));
assert(lease.includes("$32.50 per sq. ft."), "rent amount has a space and a unit");
assert(lease.includes("Rental (NNN) Per Sq. Ft."), "rent header has a space after NNN");
assert(lease.includes("$65.00 per square foot") && !lease.includes("$$"), "TI allowance is not doubled");
assert(lease.includes("commission of 4% on the term"), "commission percent is separated from on");
assert(lease.includes("CRE8 Advisors, LLC represents"), "lease broker line uses the legal name");
assert(lease.includes("operation of general dentistry") && !lease.includes("operation of a "), "permitted use drops the article");
assert(!lease.includes("Exhibit A"), "lease exhibit page is omitted");
assert(!lease.includes("Owner Initials"), "lease footer is not an owner-initials line");
const leaseFooters = (() => {
  const zip = new PizZip(generateDocxBuffer({ docType: "loi_lease", variables: leaseVars }));
  return Object.keys(zip.files)
    .filter((name) => /^word\/footer\d+\.xml$/.test(name))
    .map((name) => zip.file(name)?.asText() ?? "")
    .join("\n");
})();
assert(leaseFooters.includes("CRE8 Advisors, LLC"), "lease footer names CRE8 Advisors, LLC");
assert(!leaseFooters.includes("Owner Initials"), "lease footer files do not say Owner Initials");
const leaseXml = new PizZip(generateDocxBuffer({ docType: "loi_lease", variables: leaseVars })).file("word/document.xml")?.asText() ?? "";
const permittedRun = Array.from(leaseXml.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g))
  .map((match) => match[0])
  .find((run) => run.includes("general dentistry"));
assert(!!permittedRun && !/<w:u[\s/>]/.test(permittedRun || ""), "permitted use is not underlined");

const sparseLease = textOf(generateDocxBuffer({
  docType: "loi_lease",
  variables: {
    ...leaseVars,
    landlord_contact_name: "",
    trade_name: "",
    permitted_use: "",
    lease_term: "",
    renewal_option: "",
    guarantor: "",
    free_rent_months: "",
    cam_expenses: "",
    exclusive_use: "",
    ti_allowance_psf: "",
    landlord_work: "",
  },
}));
assert(!sparseLease.includes("Email:"), "sparse lease has no stray Email label");
assert(!sparseLease.includes("operation of a"), "blank use does not leave operation of a");
assert(!sparseLease.includes("Term for"), "blank renewal does not leave Term for");
assert(!sparseLease.includes("will guaranty") && !sparseLease.includes("will guarantee") && !sparseLease.includes("Guarantee by"), "blank guarantor omits the guarantee sentence");
assert(!sparseLease.includes("per square foot"), "blank TI omits the per-square-foot sentence");
assert(!sparseLease.includes("equal to .") && !sparseLease.includes("equal to."), "blank CAM omits equal to");
assert(!sparseLease.includes("abated"), "blank free rent omits the abatement sentence");
assert(!sparseLease.includes("TRADE NAME"), "blank trade name omits the label");
assert(!sparseLease.includes("LEASE TERM"), "blank lease term omits the label");
assert(!sparseLease.includes("EXCLUSIVE"), "blank exclusive omits the label");
assert(!sparseLease.includes("LANDLORD"), "blank landlord work omits the label");
assert(!sparseLease.match(/^\s*:/m) && !sparseLease.includes(": :"), "no doubled colons");
// A lone colon would be a paragraph that is only ":" or ends a line as the whole text.
assert(!/(^| )[:：]( |$)/.test(sparseLease.replace(/\(i\)/g, "")), "no lone colon from a blank contact");

const listing = textOf(generateDocxBuffer({
  docType: "listing_sale",
  variables: {
    property_address: "4040 E Camelback Road",
    county: "Maricopa",
    parcel_number: "172-28-001A",
    owner_entity: "Camelback Medical Holdings LLC",
    owner_signer_name: "Helena Cho",
    term_start: "November 18, 2026",
    term_end: "November 18, 2027",
    listing_price_display: "$4,750,000",
  },
}));
assert(listing.includes("EXCLUSIVE AUTHORIZATION TO SELL OR EXCHANGE"), "sale listing title is unchanged");
assert(listing.includes("authority to sell"), "sale listing grant is unchanged");
assert(!listing.includes("commence preparation of the Purchase Agreement"), "listing generation does not get the LOI PSA clause");
const listingZip = new PizZip(generateDocxBuffer({
  docType: "listing_sale",
  variables: { property_address: "4040 E Camelback Road", listing_price_display: "$1" },
}));
const listingFooter = Object.keys(listingZip.files)
  .filter((name) => /^word\/footer\d+\.xml$/.test(name))
  .map((name) => listingZip.file(name)?.asText() ?? "")
  .join("\n");
assert(listingFooter.includes("Owner Initials"), "listing footer is left alone");
assert(!listingZip.file("word/media/loi-letterhead.png"), "listing file does not receive the LOI letterhead");
assert((listingZip.file("word/document.xml")?.asText() ?? "").includes("4102 E. Indian School"), "sale listing address is left untouched");

function footerText(docType: string, variables: Record<string, string>): string {
  const zip = new PizZip(generateDocxBuffer({ docType, variables }));
  return Object.keys(zip.files)
    .filter((name) => /^word\/footer\d+\.xml$/.test(name))
    .map((name) => zip.file(name)?.asText() ?? "")
    .join("\n");
}
for (const docType of ["loi_building", "loi_land", "loi_lease"]) {
  const footers = footerText(docType, docType === "loi_lease" ? leaseVars : purchase);
  assert(footers.includes("4120 E. Indian School Rd"), `${docType} footer uses the 4120 office`);
  assert(!footers.includes("4102"), `${docType} footer does not use the old 4102 office`);
}

if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
