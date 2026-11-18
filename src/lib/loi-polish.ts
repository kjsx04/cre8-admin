// Post-render cleanup for the three LOI templates only.
// Drops paragraphs that became empty, unifies the body font, and points
// email hyperlinks at the address that was actually typed.

import PizZip from "pizzip";

const CALIBRI = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';

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

function paragraphText(xml: string): string {
  return decode(
    Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
      .map((m) => m[1])
      .join("")
  );
}

function forceCalibri(xml: string): string {
  return xml
    .replace(/<w:rFonts\b[^>]*\/>/g, CALIBRI)
    .replace(/w:asciiTheme="[^"]*"/g, "")
    .replace(/w:hAnsiTheme="[^"]*"/g, "")
    .replace(/w:cstheme="[^"]*"/g, "")
    .replace(/w:eastAsiaTheme="[^"]*"/g, "");
}

/** Remove body paragraphs that have no visible text, and a bare "Exhibit A:" page. */
export function dropEmptyLoiParagraphs(documentXml: string): string {
  return documentXml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (paragraph.includes("<w:sectPr") || paragraph.includes("<w:drawing") || paragraph.includes("<w:pict")) {
      return paragraph;
    }
    const text = paragraphText(paragraph).replace(/\s+/g, " ").trim();
    if (!text || /^Exhibit A:?$/i.test(text)) return "";
    return paragraph;
  }).replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, (row) => {
    const text = paragraphText(row).replace(/\s+/g, " ").trim();
    return text ? row : "";
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

const FOOTER_LINE =
  "CRE8 Advisors, LLC | 4102 E. Indian School Rd, Phoenix, AZ 85018 | 602-888-CRE8";

function cre8Footer(originalXml: string): string {
  const open = originalXml.match(/^[\s\S]*?<w:ftr\b[^>]*>/)?.[0];
  const close = "</w:ftr>";
  if (!open) return originalXml;
  const paragraph =
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr>${CALIBRI}<w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>` +
    `<w:t xml:space="preserve">${encode(FOOTER_LINE)}</w:t></w:r></w:p>`;
  return `${open}${paragraph}${close}`;
}

/** Calibri body, no empty exhibit page, mailto matches the typed address. */
export function polishLoiDocument(
  zip: PizZip,
  variables: Record<string, string>
): void {
  const document = zip.file("word/document.xml");
  if (!document) return;

  let documentXml = forceCalibri(dropEmptyLoiParagraphs(document.asText()))
    .replace(/<w:u\b[^/]*\/>/g, "");
  const relPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relPath);
  const relsXml = relsFile?.asText() ?? "";
  const linked = linkTypedEmails(documentXml, relsXml, [
    variables.seller_broker_email || "",
    variables.cre8_agent_email || "",
  ]);
  documentXml = linked.documentXml;
  zip.file("word/document.xml", documentXml);
  if (relsFile) zip.file(relPath, linked.relsXml);

  const styles = zip.file("word/styles.xml");
  if (styles) zip.file("word/styles.xml", forceCalibri(styles.asText()));

  for (const name of Object.keys(zip.files)) {
    if (!/^word\/footer\d+\.xml$/.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = file.asText();
    const text = paragraphText(xml);
    if (/Owner Initials/i.test(text) || /CRE8 Advisors/.test(text)) {
      zip.file(name, cre8Footer(xml));
    }
  }
}
