import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import PizZip from "pizzip";

/**
 * Full-page CRE8 letterhead for LOI downloads.
 *
 * The tokenized templates already place a picture watermark in every header
 * (first, default, and even), but the relationship targets — media/image1.png
 * or media/image2.png — are not in the package. Only the CRE8 logo is. Word
 * then shows a broken picture. docxtemplater writes back whatever is in the
 * zip, so the image has to be embedded after render, as a real package part.
 *
 * Opacity is the picture's own alpha, halved. That is 50% transparency.
 * It is not Word's watermark washout (brightness/contrast via v:imagedata
 * gain/blacklevel or a:lum), and not a:alphaModFix, which LibreOffice drops.
 */

const IMAGE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

/** Package part. Headers reference it as media/loi-letterhead.png. */
export const LETTERHEAD_PART = "word/media/loi-letterhead.png";

const LETTERHEAD_TARGET = "media/loi-letterhead.png";

const LOI_DOC_TYPES = new Set(["loi_building", "loi_land", "loi_lease"]);

/** Twips (pgSz) → EMUs. 1440 twips = 914400 EMUs. */
const TWIP_TO_EMU = 635;

const WATERMARK_NAME = "CRE8LetterheadWatermark";

let cachedHalfAlpha: Buffer | null = null;

export function isLoiDocType(docType: string): boolean {
  return LOI_DOC_TYPES.has(docType);
}

export function letterheadAssetPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "templates",
    "assets",
    "loi-letterhead.png"
  );
}

/** Halve each pixel's alpha. RGB is unchanged, so this is not a washout. */
export function withHalfOpacity(source: Buffer): Buffer {
  const png = PNG.sync.read(source);
  const px = png.data;
  for (let i = 3; i < px.length; i += 4) {
    px[i] = Math.round(px[i] * 0.5);
  }
  return PNG.sync.write(png);
}

function halfAlphaLetterhead(): Buffer {
  if (!cachedHalfAlpha) {
    cachedHalfAlpha = withHalfOpacity(fs.readFileSync(letterheadAssetPath()));
  }
  return cachedHalfAlpha;
}

function pageSizeEmu(documentXml: string): { cx: number; cy: number } {
  const tags = Array.from(documentXml.matchAll(/<w:pgSz\b[^>]*\/>/g));
  const tag = tags.length > 0 ? tags[tags.length - 1][0] : "";
  const width = Number(/w:w="(\d+)"/.exec(tag)?.[1] ?? 12240);
  const height = Number(/w:h="(\d+)"/.exec(tag)?.[1] ?? 15840);
  return { cx: width * TWIP_TO_EMU, cy: height * TWIP_TO_EMU };
}

function relsPathFor(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`;
}

function stripWatermarkRuns(xml: string): string {
  return xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => {
    if (
      run.includes("WordPictureWatermark") ||
      run.includes("LOI Background") ||
      run.includes(WATERMARK_NAME)
    ) {
      return "";
    }
    return run;
  });
}

function watermarkRun(rId: string, cx: number, cy: number): string {
  // Anchored to the page, behind the text, stretched to the page size.
  // No lum/gain/blacklevel — those are Word's washout.
  return (
    `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>` +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapNone/>` +
    `<wp:docPr id="901" name="${WATERMARK_NAME}" descr="CRE8 letterhead background"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="0"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="901" name="${WATERMARK_NAME}" descr="CRE8 letterhead background"/>` +
    `<pic:cNvPicPr><a:picLocks noChangeAspect="0"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
  );
}

function insertRun(headerXml: string, run: string): string {
  const para = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/;
  if (!para.test(headerXml)) {
    return headerXml.replace("</w:hdr>", `<w:p>${run}</w:p></w:hdr>`);
  }
  return headerXml.replace(para, (paragraph) => {
    if (paragraph.includes("</w:pPr>")) {
      return paragraph.replace("</w:pPr>", `</w:pPr>${run}`);
    }
    return paragraph.replace(/(<w:p\b[^>]*>)/, `$1${run}`);
  });
}

function nextRelationshipId(relsXml: string): string {
  const used = new Set(
    Array.from(relsXml.matchAll(/\bId="([^"]+)"/g), (match) => match[1])
  );
  let n = 1;
  while (used.has(`rId${n}`)) n += 1;
  return `rId${n}`;
}

function dropUnreferencedImageRels(relsXml: string, partXml: string): string {
  return relsXml.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
    const type = /Type="([^"]*)"/.exec(rel)?.[1] ?? "";
    if (type !== IMAGE_REL) return rel;
    const id = /Id="([^"]*)"/.exec(rel)?.[1] ?? "";
    const used =
      partXml.includes(`r:embed="${id}"`) ||
      partXml.includes(`r:id="${id}"`) ||
      partXml.includes(`r:link="${id}"`);
    return used ? rel : "";
  });
}

function addImageRelationship(relsXml: string, rId: string): string {
  const rel =
    `<Relationship Id="${rId}" Type="${IMAGE_REL}" Target="${LETTERHEAD_TARGET}"/>`;
  if (!relsXml.includes("</Relationships>")) {
    throw new Error("Header relationships file is missing </Relationships>");
  }
  return relsXml.replace("</Relationships>", `${rel}</Relationships>`);
}

const EMPTY_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

function ensurePngContentType(zip: PizZip): void {
  const file = zip.file("[Content_Types].xml");
  if (!file) return;
  const xml = file.asText();
  if (/Extension="png"/i.test(xml)) return;
  zip.file(
    "[Content_Types].xml",
    xml.replace(
      /<Types\b([^>]*)>/,
      `<Types$1><Default Extension="png" ContentType="image/png"/>`
    )
  );
}

/**
 * Embed the letterhead in every header of this docx zip.
 * Safe to call more than once: the previous watermark run is replaced.
 */
export function embedLoiLetterhead(zip: PizZip): void {
  const png = halfAlphaLetterhead();
  zip.file(LETTERHEAD_PART, png);

  const documentXml = zip.file("word/document.xml")?.asText() ?? "";
  const { cx, cy } = pageSizeEmu(documentXml);

  const headers = Object.keys(zip.files).filter((name) =>
    /^word\/header\d+\.xml$/.test(name)
  );
  if (headers.length === 0) {
    throw new Error("LOI template has no headers to hold the letterhead");
  }

  for (const headerPath of headers) {
    const headerFile = zip.file(headerPath);
    if (!headerFile) continue;
    let headerXml = stripWatermarkRuns(headerFile.asText());

    const relPath = relsPathFor(headerPath);
    const existingRels = zip.file(relPath)?.asText() ?? EMPTY_RELS;
    const withoutDangling = dropUnreferencedImageRels(existingRels, headerXml);
    const rId = nextRelationshipId(withoutDangling);
    const relsXml = addImageRelationship(withoutDangling, rId);

    headerXml = insertRun(headerXml, watermarkRun(rId, cx, cy));
    zip.file(headerPath, headerXml);
    zip.file(relPath, relsXml);
  }

  ensurePngContentType(zip);
}
