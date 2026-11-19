// Read a generated LOI docx into pages the editor can draw.
// The download is the same file; this only describes its paragraphs,
// header logo, letterhead, page border, and footer.

import PizZip from "pizzip";

export interface PreviewRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface PreviewBlock {
  kind: "blank" | "columns" | "text" | "break";
  /** Hanging column width in inches. 0 for a full-width line. */
  hangInches: number;
  number: string | null;
  left: PreviewRun[];
  right: PreviewRun[];
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

function paragraphBlocks(xml: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  let number = 0;
  const paragraphs = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  for (const paragraph of paragraphs) {
    if (/<w:br\b[^>]*w:type="page"/.test(paragraph)) {
      blocks.push({ kind: "break", hangInches: 0, number: null, left: [], right: [] });
    }
    const left: PreviewRun[] = [];
    const right: PreviewRun[] = [];
    let seenTab = false;
    const runXml = paragraph.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
    for (const run of runXml) {
      if (/<w:vanish\b/.test(run)) continue;
      const bold = flag(run, "b");
      const italic = flag(run, "i");
      const pieces = run.split(/<w:tab\/>/);
      pieces.forEach((piece, index) => {
        if (index > 0) seenTab = true;
        const text = decode((piece.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((node) => node.replace(/<[^>]+>/g, "")).join(""));
        if (!text) return;
        (seenTab ? right : left).push({ text, bold, italic });
      });
    }
    const hang = Number(/<w:ind\b[^>]*w:hanging="(\d+)"/.exec(paragraph)?.[1] || 0);
    const numbered = /<w:numPr\b/.test(paragraph);
    if (numbered) number += 1;
    const hasText = left.length > 0 || right.length > 0;
    if (!hasText) {
      blocks.push({ kind: "blank", hangInches: 0, number: null, left: [], right: [] });
      continue;
    }
    blocks.push({
      kind: seenTab && hang > 0 ? "columns" : "text",
      hangInches: hang > 0 ? hang / 1440 : 0,
      number: numbered ? `${number}.` : null,
      left: seenTab ? left : [...left, ...right],
      right: seenTab ? right : [],
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
