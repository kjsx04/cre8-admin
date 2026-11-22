/**
 * Run: npx tsx src/lib/flow/pdf-text.test.ts
 *
 * Line assembly is tested on positioned items directly. A few synthetic PDFs
 * go through pdf.js: a normal text page, a second blank page, an image-only
 * file, a char cap, and a file that is not a PDF.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { assemblePdfText, extractPdfText, PdfTextError, type PdfTextItem } from "./pdf-text";

const nodeRequire = createRequire(import.meta.url);

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const workerFromCwd = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.js"
);
assert(
  nodeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.js") === workerFromCwd,
  "the server build can find the pdf.js worker from the project root"
);

function item(str: string, x: number, y: number, width: number, height = 12): PdfTextItem {
  return { str, transform: [height, 0, 0, height, x, y], width, height };
}

const joined = assemblePdfText([
  item("Purchase", 72, 700, 50.69),
  item(" ", 122.69, 700, 29.31, 0),
  item("Price:", 152, 700, 30.67),
  item(" ", 182.67, 700, 19.33, 0),
  item("$2,500,000", 202, 700, 60),
  item("Buyer: Acme Holdings LLC", 72, 680, 144),
]);
assert(joined === "Purchase Price: $2,500,000\nBuyer: Acme Holdings LLC", "keeps pdf.js space items and stacks lines top to bottom");

const gapped = assemblePdfText([
  item("Escrow", 72, 640, 36),
  item("Company:", 140, 640, 52),
]);
assert(gapped === "Escrow Company:", "inserts one space when a gap has no space item");

const tight = assemblePdfText([
  item("A", 72, 600, 8),
  item("cme", 78, 600, 24),
]);
assert(tight === "Acme", "kerning with no gap does not grow a space");

const paragraphs = assemblePdfText([
  item("Letter of Intent", 72, 720, 90),
  item("The buyer will deposit earnest money.", 72, 640, 220),
]);
assert(
  paragraphs === "Letter of Intent\n\nThe buyer will deposit earnest money.",
  "a large vertical jump becomes a paragraph break"
);

const watermark = assemblePdfText([
  item("DRAFT", 300, 400, 40),
  { str: "CONFIDENTIAL", transform: [0, 14, -14, 0, 20, 400], width: 80, height: 14 },
]);
assert(watermark === "DRAFT", "vertical text is dropped");

/**
 * Minimal one-page PDF. `stream` is the page content, using Helvetica.
 * Offsets are counted in bytes so the xref stays valid.
 */
function pdfBytes(streams: string[]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  for (const stream of streams) {
    const contentId = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent PAGES 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
      )
    );
  }
  const pagesId = add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  );
  for (let i = 0; i < objects.length; i += 1) {
    objects[i] = objects[i].replaceAll("PAGES 0 R", `${pagesId} 0 R`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const textPage = [
  "BT",
  "/F1 12 Tf",
  "72 720 Td",
  "(Letter of Intent) Tj",
  "0 -20 Td",
  "(Buyer: Acme Holdings LLC) Tj",
  "0 -20 Td",
  "(Purchase Price: $2,500,000) Tj",
  "0 -40 Td",
  "(90-day feasibility period from escrow open.) Tj",
  "ET",
].join("\n");

const blankPage = "BT ET";

async function main() {
  const extracted = await extractPdfText(pdfBytes([textPage, blankPage]));
  assert(extracted.pageCount === 2, "counts both pages");
  assert(extracted.text.includes("Letter of Intent"), "reads the title");
  assert(extracted.text.includes("Buyer: Acme Holdings LLC"), "reads the buyer line");
  assert(extracted.text.includes("Purchase Price: $2,500,000"), "reads the price line");
  assert(
    extracted.text.includes("90-day feasibility period from escrow open."),
    "reads the feasibility sentence"
  );
  assert(extracted.text.indexOf("Letter of Intent") < extracted.text.indexOf("Buyer:"), "keeps top-to-bottom order");
  assert(extracted.sparsePages === 1, "the blank page is sparse");
  assert(!extracted.imageOnly, "a text page plus a blank page is not image-only");
  assert(!extracted.truncated, "a short letter is not truncated");

  const scan = await extractPdfText(pdfBytes([blankPage, blankPage]));
  assert(scan.imageOnly, "a file with no text layer is image-only");
  assert(scan.text === "", "image-only extraction yields no text");
  assert(scan.sparsePages === 2, "both scan pages are sparse");

  const clipped = await extractPdfText(pdfBytes([textPage]), { maxChars: 20 });
  assert(clipped.truncated, "maxChars marks the cut");
  assert(clipped.text.length === 20, "the cut is the requested length");
  assert(!clipped.imageOnly, "truncation is not mistaken for a scan");

  try {
    await extractPdfText(Buffer.from("this is not a pdf"));
    assert(false, "garbage bytes should throw");
  } catch (err) {
    assert(err instanceof PdfTextError, "a bad file is a PdfTextError");
    assert(
      err instanceof Error && /could not read this pdf/i.test(err.message),
      "the bad-file message is readable"
    );
  }

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nall pdf text tests passed");
}

main();
