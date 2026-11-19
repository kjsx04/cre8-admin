// Post-render cleanup for the three LOI templates only.
// Points email hyperlinks at the address that was typed, and drops a
// paragraph only when it is a label whose value came out blank.
// Fonts, tabs, numbering, and the blank spacer paragraphs stay as they
// are in the template. Rewriting those is what flattened the preview.

import PizZip from "pizzip";

const HYPERLINK_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encode(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paragraphTexts(xml: string): string[] {
  return Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) =>
    decode(m[1])
  );
}

/**
 * A lease label or optional sentence whose value came out blank.
 * Land and building keep a checked section's heading ("Buyer:", "Exhibit A:")
 * even when the value is empty, so those are not in this list. Spacers are kept.
 */
function isBlankLabel(text: string): boolean {
  const normalized = text.replace(/\u2019/g, "'").replace(/\s+/g, " ").trim();
  return (
    /^email\s*:?$/i.test(normalized) ||
    /^tenant's trade name:$/i.test(normalized) ||
    /^lease term:$/i.test(normalized) ||
    /^exclusive:$/i.test(normalized) ||
    /^landlord's work:$/i.test(normalized) ||
    /^:$/.test(normalized) ||
    /^of the initial term shall be abated/i.test(normalized) ||
    /extend the Lease Term for\s*\.?$/i.test(normalized) ||
    /Guarantee by\s+will guarantee/i.test(normalized) ||
    /allowance in the amount of\s*\$?\s*per square foot/i.test(normalized)
  );
}

function removeAll(texts: string[], pattern: RegExp): string[] {
  let current = texts;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = removeSpan(current, new RegExp(pattern.source, pattern.flags.replace("g", "")));
    if (next.every((text, index) => text === current[index])) return next;
    current = next;
  }
  return current;
}

/** Cut a phrase that may be split across several text runs. */
function removeSpan(texts: string[], pattern: RegExp): string[] {
  const joined = texts.join("");
  const match = pattern.exec(joined);
  if (!match || match.index === undefined) return texts;
  const start = match.index;
  const end = start + match[0].length;
  let cursor = 0;
  return texts.map((text) => {
    const from = cursor;
    const to = cursor + text.length;
    cursor = to;
    if (to <= start || from >= end) return text;
    const left = Math.max(0, start - from);
    const right = Math.min(text.length, end - from);
    return text.slice(0, left) + text.slice(right);
  });
}

function writeTexts(paragraph: string, texts: string[]): string {
  let index = 0;
  return paragraph.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, (_full, attrs) => {
    const value = texts[index] ?? "";
    index += 1;
    const attr = attrs || "";
    const space =
      /[\s]/.test(value) && !attr.includes("xml:space") ? ' xml:space="preserve"' : "";
    return `<w:t${attr}${space}>${encode(value)}</w:t>`;
  });
}

/**
 * Drop a lease label whose value is empty, and an earnest phrase that
 * rendered as "the sum of ()". A checked land or building heading stays.
 * Blank paragraphs that only create vertical space are left in place.
 */
export function dropBlankLoiLabels(documentXml: string): string {
  return documentXml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (
      paragraph.includes("<w:sectPr") ||
      paragraph.includes("<w:drawing") ||
      paragraph.includes("<w:pict")
    ) {
      return paragraph;
    }
    const original = paragraphTexts(paragraph);
    let texts = removeAll(original, /the sum of\s*\(\s*\)\s*,?/);
    texts = removeAll(texts, /for an additional\s+earnest money deposit\.?/);
    texts = removeAll(texts, /\(\s*\)/);
    const visible = texts.join("").replace(/\s+/g, " ").trim();
    if (isBlankLabel(visible)) return "";
    if (texts.every((text, i) => text === original[i])) return paragraph;
    return writeTexts(paragraph, texts);
  });
}

function nextRelationshipId(relsXml: string): string {
  const used = new Set(
    Array.from(relsXml.matchAll(/\bId="([^"]+)"/g)).map((match) => match[1])
  );
  let n = 1;
  while (used.has(`rId${n}`)) n += 1;
  return `rId${n}`;
}

function stripMailtoRels(relsXml: string): string {
  return relsXml.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
    return /Target="mailto:/i.test(rel) ? "" : rel;
  });
}

function addMailtoRel(relsXml: string, id: string, email: string): string {
  const rel = `<Relationship Id="${id}" Type="${HYPERLINK_REL}" Target="mailto:${encode(email)}" TargetMode="External"/>`;
  if (!relsXml.includes("</Relationships>")) return relsXml;
  return relsXml.replace("</Relationships>", `${rel}</Relationships>`);
}

function wrapEmailRun(run: string, email: string, relId: string): string {
  const textMatch = run.match(/<w:t\b[^>]*>([^<]*)<\/w:t>/);
  if (!textMatch || !textMatch[1].includes(email)) return run;
  const text = textMatch[1];
  const at = text.indexOf(email);
  const prefix = text.slice(0, at);
  const suffix = text.slice(at + email.length);
  const open = run.match(/^<w:r\b[^>]*>/)?.[0] ?? "<w:r>";
  const rPr = run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  const piece = (value: string) =>
    value ? `${open}${rPr}<w:t xml:space="preserve">${value}</w:t></w:r>` : "";
  return (
    piece(prefix) +
    `<w:hyperlink r:id="${relId}">${piece(email)}</w:hyperlink>` +
    piece(suffix)
  );
}

/**
 * Wrap a typed email in a hyperlink whose target is that same address.
 * Hardcoded mailto targets are removed first. Each run is handled on its
 * own so a label in the previous run ("Email:") is not swallowed.
 */
export function linkTypedEmails(
  documentXml: string,
  relsXml: string,
  emails: string[]
): { documentXml: string; relsXml: string } {
  let rels = stripMailtoRels(relsXml);
  let xml = documentXml;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < emails.length; i += 1) {
    const email = emails[i].trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    unique.push(email);
  }

  for (const email of unique) {
    if (!xml.includes(email)) continue;
    const id = nextRelationshipId(rels);
    rels = addMailtoRel(rels, id, email);
    xml = xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => wrapEmailRun(run, email, id));
  }

  return { documentXml: xml, relsXml: rels };
}

/**
 * Mailto targets and blank labels only. Styles, footers, and spacing
 * paragraphs are already correct in the template and must not be rewritten.
 */
export function polishLoiDocument(
  zip: PizZip,
  variables: Record<string, string>
): void {
  const document = zip.file("word/document.xml");
  if (!document) return;

  const relPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relPath);
  const relsXml = relsFile?.asText() ?? "";
  const linked = linkTypedEmails(dropBlankLoiLabels(document.asText()), relsXml, [
    variables.seller_broker_email || "",
    variables.cre8_agent_email || "",
  ]);
  zip.file("word/document.xml", linked.documentXml);
  if (relsFile) zip.file(relPath, linked.relsXml);
}
