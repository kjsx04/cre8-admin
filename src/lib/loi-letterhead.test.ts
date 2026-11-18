/**
 * LOI letterhead embedding.
 *
 * Run: npx tsx src/lib/loi-letterhead.test.ts   (or `npm test loi-letterhead`)
 *
 * The downloaded docx must contain the letterhead bytes, not a link to a
 * missing media part. These checks run the same fill-in path the Docs
 * download uses.
 */

import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { PNG } from "pngjs";
import { generateDocxBuffer } from "./generate-docx";
import {
  LETTERHEAD_PART,
  embedLoiLetterhead,
  letterheadAssetPath,
  withHalfOpacity,
} from "./loi-letterhead";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("ok ", msg);
  } else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

const LOI_TYPES = ["loi_building", "loi_land", "loi_lease"] as const;

const SAMPLE: Record<string, string> = {
  date: "November 18, 2026",
  seller_broker_name: "Rachel Torres",
  seller_broker_company: "Cushman & Wakefield",
  seller_broker_email: "rachel.torres@cushwake.com",
  property_address: "9201 N Scottsdale Road, Scottsdale, AZ 85253",
  parcel_number: "174-22-031A",
  buyer_entity: "Pinnacle Health Properties LLC",
  seller_entity: "Scottsdale Medical Holdings Inc.",
  purchase_price: "$4,750,000",
  earnest_money: "$50,000",
  earnest_money_written: "Fifty Thousand and 00/100 Dollars",
  emd_days: "3",
  emd_days_written: "three",
  title_company: "Magnus Title Agency",
  title_agent: "David Brennan",
  psa_draft_days: "14",
  psa_draft_days_written: "fourteen",
  closing_period: "60",
  closing_period_written: "sixty",
  extension_count: "2",
  extension_count_written: "two",
  extension_days: "30",
  extension_days_written: "thirty",
  extension_deposit: "$10,000",
  dd_period: "90",
  dd_period_written: "ninety",
  seller_disclosures_days: "7",
  seller_disclosures_days_written: "seven",
  cre8_agent_email: "tyler@cre8advisors.com",
  cre8_agent_phone: "480-555-1234",
  broker_names: "Tyler Johnson",
  acreage: "4.2",
  commission_pct: "3",
  price_per_unit: "$25.00",
  property_name: "Scottsdale Medical",
  landlord: "Scottsdale Medical Holdings Inc.",
  tenant_entity: "Pinnacle Health Properties LLC",
  square_footage: "12,400",
  base_rent_psf: "$32.00",
  lease_term: "7 years",
};

function imageRels(relsXml: string): { id: string; target: string; external: boolean }[] {
  const rels: { id: string; target: string; external: boolean }[] = [];
  for (const rel of Array.from(relsXml.matchAll(/<Relationship\b[^>]*\/>/g))) {
    const tag = rel[0];
    const type = /Type="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (!type.endsWith("/image")) continue;
    rels.push({
      id: /Id="([^"]*)"/.exec(tag)?.[1] ?? "",
      target: /Target="([^"]*)"/.exec(tag)?.[1] ?? "",
      external: /TargetMode="External"/.test(tag),
    });
  }
  return rels;
}

function assertLetterhead(bytes: Buffer, label: string) {
  const zip = new PizZip(bytes);
  const media = zip.file(LETTERHEAD_PART);
  assert(!!media, `${label}: letterhead part is inside the docx`);
  if (!media) return;

  const embedded = media.asNodeBuffer();
  assert(embedded.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", `${label}: embedded part is a PNG`);

  const expected = withHalfOpacity(fs.readFileSync(letterheadAssetPath()));
  const got = PNG.sync.read(embedded);
  const want = PNG.sync.read(expected);
  assert(got.width === want.width && got.height === want.height, `${label}: embedded PNG matches the letterhead dimensions`);

  let rgbMismatch = 0;
  let alphaMismatch = 0;
  const step = 4 * 64;
  for (let i = 0; i < want.data.length; i += step) {
    if (
      got.data[i] !== want.data[i] ||
      got.data[i + 1] !== want.data[i + 1] ||
      got.data[i + 2] !== want.data[i + 2]
    ) {
      rgbMismatch += 1;
    }
    if (got.data[i + 3] !== want.data[i + 3]) alphaMismatch += 1;
  }
  assert(rgbMismatch === 0, `${label}: letterhead RGB is unchanged (no washout)`);
  assert(alphaMismatch === 0, `${label}: letterhead alpha is 50% of the source`);

  const source = PNG.sync.read(fs.readFileSync(letterheadAssetPath()));
  // A fully opaque source pixel must land at alpha 128 (round(255 * 0.5)).
  let checkedOpaque = false;
  for (let i = 3; i < source.data.length; i += 4 * 500) {
    if (source.data[i] === 255) {
      assert(got.data[i] === 128, `${label}: opaque source pixel is alpha 128, saw ${got.data[i]}`);
      checkedOpaque = true;
      break;
    }
  }
  assert(checkedOpaque, `${label}: source has an opaque pixel to check`);

  const documentXml = zip.file("word/document.xml")?.asText() ?? "";
  const pg = Array.from(documentXml.matchAll(/<w:pgSz\b[^>]*\/>/g)).pop()?.[0] ?? "";
  const cx = Number(/w:w="(\d+)"/.exec(pg)?.[1] ?? 0) * 635;
  const cy = Number(/w:h="(\d+)"/.exec(pg)?.[1] ?? 0) * 635;

  const headers = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name));
  assert(headers.length >= 1, `${label}: has at least one header`);

  for (const headerPath of headers) {
    const headerXml = zip.file(headerPath)?.asText() ?? "";
    const marks = headerXml.split("CRE8LetterheadWatermark").length - 1;
    // docPr and cNvPr both carry the name.
    assert(marks === 2, `${label}: ${headerPath} has one letterhead drawing (name count ${marks})`);
    assert(headerXml.includes(`cx="${cx}"`) && headerXml.includes(`cy="${cy}"`), `${label}: ${headerPath} fills the page (${cx}x${cy})`);
    assert(headerXml.includes('behindDoc="1"'), `${label}: ${headerPath} sits behind the text`);
    assert(headerXml.includes('relativeFrom="page"'), `${label}: ${headerPath} is anchored to the page`);
    assert(!headerXml.includes("blacklevel") && !headerXml.includes("gain=") && !headerXml.includes("<a:lum") && !headerXml.includes("alphaModFix"), `${label}: ${headerPath} has no washout`);
    assert(!headerXml.includes("WordPictureWatermark") && !headerXml.includes("LOI Background"), `${label}: ${headerPath} dropped the broken watermark`);

    const relPath = headerPath.replace("word/", "word/_rels/") + ".rels";
    const relsXml = zip.file(relPath)?.asText() ?? "";
    const rels = imageRels(relsXml);
    const letterheadRel = rels.filter((rel) => rel.target === "media/loi-letterhead.png");
    assert(letterheadRel.length === 1, `${label}: ${headerPath} has one internal letterhead relationship`);
    assert(letterheadRel.every((rel) => !rel.external), `${label}: ${headerPath} letterhead is embedded, not an external link`);

    for (const rel of rels) {
      assert(!rel.external, `${label}: ${headerPath} image ${rel.id} is not an external link`);
      assert(!rel.target.startsWith("/") && !rel.target.includes("..") && !/^[a-z]+:/i.test(rel.target), `${label}: ${headerPath} image target stays inside the package (${rel.target})`);
      const part = rel.target.startsWith("word/") ? rel.target : `word/${rel.target}`;
      assert(!!zip.file(part), `${label}: ${headerPath} image target ${rel.target} exists in the package`);
    }
  }

  const header2 = zip.file("word/header2.xml")?.asText() ?? "";
  const header2Rels = imageRels(zip.file("word/_rels/header2.xml.rels")?.asText() ?? "");
  const logo = header2Rels.find((rel) => rel.target !== "media/loi-letterhead.png");
  assert(!!logo && header2.includes(`r:embed="${logo?.id}"`), `${label}: CRE8 logo in the default header still resolves`);
}

const sourcePng = PNG.sync.read(fs.readFileSync(letterheadAssetPath()));
const halved = PNG.sync.read(withHalfOpacity(fs.readFileSync(letterheadAssetPath())));
assert(sourcePng.data.length === halved.data.length, "half-opacity keeps every pixel");
let rgbChanged = 0;
for (let i = 0; i < sourcePng.data.length; i += 4 * 200) {
  if (
    sourcePng.data[i] !== halved.data[i] ||
    sourcePng.data[i + 1] !== halved.data[i + 1] ||
    sourcePng.data[i + 2] !== halved.data[i + 2]
  ) {
    rgbChanged += 1;
  }
  if (sourcePng.data[i + 3] === 255 && halved.data[i + 3] !== 128) {
    rgbChanged += 1;
  }
}
assert(rgbChanged === 0, "half-opacity changes alpha only");

for (const docType of LOI_TYPES) {
  const bytes = generateDocxBuffer({ docType, variables: SAMPLE, clauses: [] });
  assert(bytes.subarray(0, 2).toString() === "PK", `${docType}: download is a zip/docx`);
  assertLetterhead(bytes, docType);

  // Token replacement still happened, and the letterhead survived it.
  const xml = new PizZip(bytes).file("word/document.xml")?.asText() ?? "";
  assert(xml.includes("Scottsdale") || xml.includes("Pinnacle") || xml.includes("November 18, 2026"), `${docType}: filled-in text is in the document`);
  assert(!xml.includes("{{date}}") && !xml.includes("{{property_address}}"), `${docType}: sample tokens were replaced`);
}

// Embedding twice must not stack two watermarks or drop the logo.
const buildingPath = path.join(process.cwd(), "src/templates/tokenized/loi-building-tokenized.docx");
const twice = new PizZip(fs.readFileSync(buildingPath));
embedLoiLetterhead(twice);
embedLoiLetterhead(twice);
assertLetterhead(twice.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer, "idempotent");

const listing = generateDocxBuffer({ docType: "listing_sale", variables: SAMPLE, clauses: [] });
assert(!new PizZip(listing).file(LETTERHEAD_PART), "listing agreements do not get the LOI letterhead");

try {
  generateDocxBuffer({ docType: "not_a_doc", variables: SAMPLE });
  assert(false, "unknown doc type throws");
} catch (error) {
  assert(error instanceof Error && error.message.includes("No template"), "unknown doc type is rejected");
}

if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
