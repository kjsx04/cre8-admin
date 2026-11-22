/**
 * Pull selectable text out of a PDF before it is sent to a model.
 *
 * Grok's API here has no native PDF document input (Claude did). pdf.js reads
 * the text layer: normal text PDFs, and scans that already have a hidden OCR
 * text layer (what title companies usually mean by a "searchable" PDF).
 *
 * What this cannot do: a scan that is only page images, with no text layer.
 * Callers should check `imageOnly` and tell the broker to export a searchable
 * PDF or a Word file. There is no OCR step.
 *
 * Letters placed one-by-one with wide tracking can come back with extra
 * spaces ("Let t er"). Word, Acrobat, and word-level OCR text do not do that;
 * pdf.js already joins those runs and keeps the kerning.
 */

import { createRequire } from "node:module";
import path from "node:path";

// Webpack only understands createRequire(import.meta.url). A computed path is
// compiled to a stub that throws "Cannot find module" on the first PDF.
const nodeRequire = createRequire(import.meta.url);

/**
 * pdf.js loads its worker with Node's own require(filename). Webpack replaces
 * require.resolve() with a numeric module id, which is not a filename, so the
 * worker, fonts, and cmaps are addressed from the project root instead.
 * next.config traces those files into the server bundle.
 */
const PDFJS_ROOT = path.join(process.cwd(), "node_modules", "pdfjs-dist");

/** Same cut the Word path uses, so a long PSA cannot blow the prompt. */
export const PDF_TEXT_CHAR_LIMIT = 30_000;

/** A page with fewer letters than this is treated as having no text layer. */
const SPARSE_PAGE_LETTERS = 15;

/** A whole file under this, or with every page sparse, is an image-only scan. */
const IMAGE_ONLY_LETTERS = 40;

export class PdfTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfTextError";
  }
}

export type PdfTextItem = {
  str: string;
  /** pdf.js transform: [scaleX, skewY, skewX, scaleY, x, y]. y grows upward. */
  transform: number[];
  width: number;
  height: number;
};

export type PdfTextResult = {
  /** Pages joined in order, trimmed, and cut at the char limit. */
  text: string;
  pageCount: number;
  /** Pages with almost no letters (blank, or a picture with no text layer). */
  sparsePages: number;
  /**
   * True when the file has pages but essentially no selectable text.
   * Typical of a phone scan or a "print to PDF" that embedded images only.
   */
  imageOnly: boolean;
  truncated: boolean;
};

type PdfjsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  setVerbosityLevel?: (level: number) => void;
  getDocument: (src: Record<string, unknown>) => {
    promise: Promise<PdfDocument>;
  };
};

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: unknown[] }>;
  }>;
  destroy: () => Promise<void>;
};

let pdfjs: PdfjsModule | null = null;

function loadPdfjs(): PdfjsModule {
  if (pdfjs) return pdfjs;
  // pdf.js warns at import time that it could not polyfill DOMMatrix from the
  // optional `canvas` package. We never render pages, so that warning is noise.
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const first = typeof args[0] === "string" ? args[0] : "";
    if (first.startsWith("Warning: Cannot polyfill")) return;
    originalLog.apply(console, args);
  };
  try {
    const lib = nodeRequire("pdfjs-dist/legacy/build/pdf.js") as PdfjsModule;
    // The legacy build loads this file with require() on the main thread.
    // A file:// URL does not resolve. An absolute path does.
    lib.GlobalWorkerOptions.workerSrc = path.join(
      PDFJS_ROOT,
      "legacy",
      "build",
      "pdf.worker.js"
    );
    // ERRORS only. The default prints a warning for every missing optional polyfill.
    lib.setVerbosityLevel?.(0);
    pdfjs = lib;
    return lib;
  } finally {
    console.log = originalLog;
  }
}

function pdfjsAssetDir(name: string): string {
  return path.join(PDFJS_ROOT, name) + path.sep;
}

function isTextItem(item: unknown): item is PdfTextItem {
  if (!item || typeof item !== "object") return false;
  const row = item as Partial<PdfTextItem>;
  return typeof row.str === "string" && Array.isArray(row.transform);
}

/** Horizontal body text. Drops vertical watermarks and sideways margin stamps. */
function isHorizontal(transform: number[]): boolean {
  const scaleX = Math.abs(transform[0] ?? 0);
  const skewY = Math.abs(transform[1] ?? 0);
  return scaleX >= skewY;
}

/**
 * Rebuild lines from positioned glyphs.
 *
 * pdf.js often inserts its own space items when it sees a gap. Those are
 * kept. When two runs sit on the same baseline with a gap and neither side
 * already has a space, one space is inserted. A bigger vertical jump starts
 * a new paragraph.
 */
export function assemblePdfText(items: PdfTextItem[]): string {
  type Part = { x: number; end: number; str: string; height: number };
  type Line = { y: number; height: number; parts: Part[] };

  const lines: Line[] = [];
  for (const item of items) {
    if (!item.str || !isHorizontal(item.transform)) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const height = item.height || Math.abs(item.transform[3] ?? 0) || 10;
    const width = item.width || 0;
    const tolerance = Math.max(2, height * 0.5);
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (!line) {
      line = { y, height, parts: [] };
      lines.push(line);
    } else {
      line.height = Math.max(line.height, height);
    }
    line.parts.push({ x, end: x + width, str: item.str, height });
  }

  lines.sort((a, b) => b.y - a.y);

  const rendered: string[] = [];
  let prevY: number | null = null;
  let prevHeight = 12;
  for (const line of lines) {
    const parts = [...line.parts].sort((a, b) => a.x - b.x);
    let text = "";
    let cursor = 0;
    for (const part of parts) {
      const gap = part.x - cursor;
      const spaceWidth = Math.max(2, (part.height || line.height) * 0.25);
      if (
        text &&
        gap > spaceWidth &&
        !/\s$/.test(text) &&
        !/^\s/.test(part.str)
      ) {
        text += " ";
      }
      text += part.str;
      cursor = Math.max(cursor, part.end);
    }
    const cleaned = text.replace(/[ \t]{2,}/g, " ").trim();
    if (!cleaned) continue;
    if (prevY != null && prevY - line.y > prevHeight * 2.2) rendered.push("");
    rendered.push(cleaned);
    prevY = line.y;
    prevHeight = line.height || prevHeight;
  }
  return rendered.join("\n").trim();
}

function letterCount(text: string): number {
  return text.replace(/[^A-Za-z0-9]/g, "").length;
}

function asPdfError(err: unknown): PdfTextError {
  const message = err instanceof Error ? err.message : "Could not read this PDF";
  if (/password/i.test(message)) {
    return new PdfTextError("This PDF is password-protected. Remove the password and try again.");
  }
  return new PdfTextError("Could not read this PDF. It may be damaged or not a real PDF.");
}

/**
 * Extract text from a PDF buffer.
 *
 * `maxChars` defaults to {@link PDF_TEXT_CHAR_LIMIT}. The cut is applied
 * after the pages are assembled, so `imageOnly` still reflects the whole file.
 */
export async function extractPdfText(
  data: Buffer | Uint8Array,
  options?: { maxChars?: number }
): Promise<PdfTextResult> {
  const lib = loadPdfjs();
  // pdf.js may transfer the buffer to its worker. Copy so the caller keeps theirs.
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);

  let doc: PdfDocument;
  try {
    doc = await lib.getDocument({
      data: bytes,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: true,
      verbosity: 0,
      standardFontDataUrl: pdfjsAssetDir("standard_fonts"),
      cMapUrl: pdfjsAssetDir("cmaps"),
      cMapPacked: true,
    }).promise;
  } catch (err) {
    throw asPdfError(err);
  }

  try {
    const pageTexts: string[] = [];
    let sparsePages = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter(isTextItem);
      const text = assemblePdfText(items);
      if (letterCount(text) < SPARSE_PAGE_LETTERS) sparsePages += 1;
      if (text) pageTexts.push(text);
    }

    const full = pageTexts.join("\n\n");
    const letters = letterCount(full);
    const imageOnly =
      doc.numPages > 0 && (letters < IMAGE_ONLY_LETTERS || sparsePages === doc.numPages);
    const maxChars = options?.maxChars ?? PDF_TEXT_CHAR_LIMIT;
    const truncated = full.length > maxChars;
    return {
      text: truncated ? full.slice(0, maxChars) : full,
      pageCount: doc.numPages,
      sparsePages,
      imageOnly,
      truncated,
    };
  } catch (err) {
    if (err instanceof PdfTextError) throw err;
    throw asPdfError(err);
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
