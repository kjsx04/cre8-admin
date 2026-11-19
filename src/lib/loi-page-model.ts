// Read a generated LOI docx into pages the editor can draw.
// The download is the same file; this only describes its paragraphs,
// header logo, letterhead, page border, and footer.

import PizZip from "pizzip";

export interface PreviewRun {
  text: string;
  bold: boolean;
  italic: boolean;
  /** CSS font stack. Cambria and Calibri stay distinct so line breaks match Word. */
  fontFamily: string;
  sizePt: number;
  /** Hyperlink blue, when the run sets one. */
  color: string | null;
  underline: boolean;
}

export interface PreviewBlock {
  kind: "blank" | "columns" | "text" | "break";
  /** Hanging column width in inches. 0 for a full-width line. */
  hangInches: number;
  number: string | null;
  left: PreviewRun[];
  right: PreviewRun[];
  /** Word jc. Justified paragraphs stretch every line but the last. */
  align: "left" | "justify" | "center";
  /** Single-spacing line box for this paragraph's font, in points. */
  linePt: number;
  /** Word keep-with-next. The paragraph stays on the same page as the one after it. */
  keepNext: boolean;
}

export interface LoiPreviewModel {
  blocks: PreviewBlock[];
  footer: string;
  /** Already at the 50% opacity baked into the docx. */
  letterheadBase64: string | null;
  logoBase64: string | null;
  borderColor: string;
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, i + step);
    const copy = new Array<number>(slice.length);
    for (let j = 0; j < slice.length; j += 1) copy[j] = slice[j];
    binary += String.fromCharCode.apply(null, copy);
  }
  return btoa(binary);
}

function flag(xml: string, tag: "b" | "i"): boolean {
  const match = xml.match(new RegExp(`<w:${tag}\\b([^>]*)\\/?>`));
  if (!match) return false;
  return !/w:val="(?:0|false|off)"/.test(match[1] || "");
}

/** Metric stand-ins match the fonts LibreOffice uses when Office fonts are absent. */
function cssFont(name: string): string {
  if (/cambria/i.test(name)) return '"Cambria", "Caladea", serif';
  if (/calibri/i.test(name)) return '"Calibri", "Carlito", sans-serif';
  if (/arial/i.test(name)) return 'Arial, "Liberation Sans", sans-serif';
  if (/times/i.test(name)) return '"Times New Roman", "Liberation Serif", serif';
  if (/lato/i.test(name)) return 'Lato, "Carlito", sans-serif';
  return `"${name}", "Calibri", "Carlito", sans-serif`;
}

/** Word single spacing from each font's OS/2 metrics. */
function lineFactor(name: string): number {
  if (/cambria/i.test(name)) return 1.15;
  if (/arial/i.test(name)) return 1.117;
  if (/times/i.test(name)) return 1.108;
  return 1.221;
}

interface RunStyle {
  fontName: string;
  fontFamily: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  color: string | null;
  underline: boolean;
}

function styleFrom(xml: string, fallback: RunStyle): RunStyle {
  const rpr = (xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
  const fontName = /w:ascii="([^"]+)"/.exec(rpr)?.[1] || fallback.fontName;
  const halfPoints = Number(/<w:sz w:val="(\d+)"/.exec(rpr)?.[1] || 0);
  return {
    fontName,
    fontFamily: cssFont(fontName),
    sizePt: halfPoints ? halfPoints / 2 : fallback.sizePt,
    bold: /<w:b\b/.test(rpr) ? flag(rpr, "b") : fallback.bold,
    italic: /<w:i\b/.test(rpr) ? flag(rpr, "i") : fallback.italic,
    color: colorOf(rpr, fallback.color),
    underline: /<w:u\b/.test(rpr) || /<w:rStyle w:val="Hyperlink"/.test(rpr) || fallback.underline,
  };
}

function colorOf(rpr: string, fallback: string | null): string | null {
  const color = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(rpr)?.[1];
  if (color && color.toLowerCase() !== "auto") return `#${color}`;
  if (/<w:rStyle w:val="Hyperlink"/.test(rpr)) return "#0563C1";
  return fallback;
}

const DEFAULT_STYLE: RunStyle = {
  fontName: "Calibri",
  fontFamily: cssFont("Calibri"),
  sizePt: 11,
  bold: false,
  italic: false,
  color: null,
  underline: false,
};

function emptyBlock(kind: "blank" | "break"): PreviewBlock {
  return {
    kind,
    hangInches: 0,
    number: null,
    left: [],
    right: [],
    align: "left",
    // Normal style is Times New Roman 12pt, which is the blank paragraph.
    linePt: kind === "blank" ? 13.3 : 0,
    keepNext: false,
  };
}

function paragraphBlocks(xml: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  let number = 0;
  const paragraphs = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  for (const paragraph of paragraphs) {
    if (/<w:br\b[^>]*w:type="page"/.test(paragraph)) {
      blocks.push(emptyBlock("break"));
    }
    const pPr = (paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
    const paragraphStyle = { ...styleFrom(pPr, DEFAULT_STYLE), bold: false, italic: false };
    const jc = /<w:jc w:val="([^"]+)"/.exec(pPr)?.[1] || "";
    const align = jc === "both" ? "justify" : jc === "center" ? "center" : "left";
    const keepNext = /<w:keepNext\b/.test(pPr);
    const left: PreviewRun[] = [];
    const right: PreviewRun[] = [];
    let seenTab = false;
    const runXml = paragraph.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
    for (const run of runXml) {
      if (/<w:vanish\b/.test(run)) continue;
      const style = styleFrom(run, paragraphStyle);
      const pieces = run.split(/<w:tab\/>/);
      pieces.forEach((piece, index) => {
        if (index > 0) seenTab = true;
        const text = decode((piece.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((node) => node.replace(/<[^>]+>/g, "")).join(""));
        if (!text) return;
        (seenTab ? right : left).push({
          text,
          bold: style.bold,
          italic: style.italic,
          fontFamily: style.fontFamily,
          sizePt: style.sizePt,
          color: style.color,
          underline: style.underline,
        });
      });
    }
    const hang = Number(/<w:ind\b[^>]*w:hanging="(\d+)"/.exec(pPr)?.[1] || 0);
    const numbered = /<w:numPr\b/.test(pPr);
    if (numbered) number += 1;
    const hasText = left.length > 0 || right.length > 0;
    if (!hasText) {
      const blank = emptyBlock("blank");
      // The paragraph mark's font sets the height of an empty line.
      // A mark with no size falls back to Normal: Times New Roman 12pt.
      if (/<w:sz w:val="\d+"/.test(pPr)) {
        blank.linePt = Math.round(paragraphStyle.sizePt * lineFactor(paragraphStyle.fontName) * 100) / 100;
      }
      blank.keepNext = keepNext;
      blocks.push(blank);
      continue;
    }
    const runs = [...left, ...right];
    const lead = runs.reduce((best, run) => (run.sizePt > best.sizePt ? run : best), runs[0]);
    blocks.push({
      kind: seenTab && hang > 0 ? "columns" : "text",
      hangInches: hang > 0 ? hang / 1440 : 0,
      number: numbered ? `${number}.` : null,
      left: seenTab ? left : [...left, ...right],
      right: seenTab ? right : [],
      align,
      linePt: Math.round(lead.sizePt * lineFactor(lead.fontFamily) * 100) / 100,
      keepNext,
    });
  }
  return blocks;
}

function footerText(zip: PizZip): string {
  const parts: string[] = [];
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/footer\d+\.xml$/.test(name)) continue;
    const xml = zip.file(name)?.asText() || "";
    const text = decode((xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((node) => node.replace(/<[^>]+>/g, "")).join("")).replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  }
  return parts.sort((a, b) => b.length - a.length)[0] || "";
}

function borderColor(documentXml: string): string {
  const color = /<w:pgBorders\b[\s\S]*?<w:top\b[^>]*w:color="([0-9A-Fa-f]+)"/.exec(documentXml)?.[1];
  return color ? `#${color}` : "#92D050";
}

function mediaBase64(zip: PizZip, path: string): string | null {
  const file = zip.file(path);
  if (!file) return null;
  return bytesToBase64(file.asUint8Array());
}

export function loiPreviewModel(bytes: Uint8Array | ArrayBuffer): LoiPreviewModel | null {
  const zip = new PizZip(bytes);
  const documentXml = zip.file("word/document.xml")?.asText();
  if (!documentXml || !zip.file("word/media/loi-letterhead.png")) return null;

  let logoPath: string | null = null;
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/_rels\/header\d+\.xml\.rels$/.test(name)) continue;
    const rels = zip.file(name)?.asText() || "";
    const targets = rels.match(/Target="([^"]+)"/g) || [];
    for (const target of targets) {
      const path = target.slice(8, -1);
      if (path.includes("loi-letterhead")) continue;
      if (/\.(png|jpe?g)$/i.test(path)) {
        logoPath = path.startsWith("word/") ? path : `word/${path.replace(/^\//, "")}`;
        if (path.startsWith("../")) logoPath = `word/${path.replace(/^\.\.\//, "")}`;
      }
    }
  }

  return {
    blocks: paragraphBlocks(documentXml),
    footer: footerText(zip),
    letterheadBase64: mediaBase64(zip, "word/media/loi-letterhead.png"),
    logoBase64: logoPath ? mediaBase64(zip, logoPath) : null,
    borderColor: borderColor(documentXml),
  };
}
