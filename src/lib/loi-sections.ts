// Optional LOI sections. A hidden marker in the paragraph lets us drop or
// replace that paragraph without touching its numbering, tabs, or font.
// Listing agreements do not call this.

import PizZip from "pizzip";
import { CLAUSE_LIBRARY } from "@/lib/clause-library";
import { countPhrase, numberToWritten } from "@/lib/number-to-words";

export interface LoiClauseInput {
  id: string;
  included?: boolean;
  variables?: Record<string, string>;
  customText?: string;
}

export interface LoiSectionVariant {
  id: string;
  label: string;
  /** Empty means "keep the letter's own paragraph". */
  text: string;
}

export interface LoiSectionDef {
  id: string;
  label: string;
  docs: Array<"loi_land" | "loi_building">;
  required: boolean;
  defaultOn: { loi_land: boolean; loi_building: boolean };
  /** Wording inserted when the letter has no paragraph for this section yet. */
  insertText?: string;
  variants: LoiSectionVariant[];
  /** Form fields that belong under this row. Hidden while the section is off. */
  fields?: string[];
}

/** Who the letter is addressed to. Not a numbered section. */
export const DATE_RECIPIENT_FIELDS = [
  "date",
  "seller_broker_name",
  "seller_broker_company",
  "seller_broker_email",
];

/** Re line and the property facts the map can fill. Edited under the map button. */
export const PROPERTY_IDENTITY_FIELDS = [
  "property_address",
  "parcel_number",
  "acreage",
  "zoning",
];

const EXCLUSIVE =
  "Exclusive Dealings: In consideration of Buyer's commitment to expend significant time, effort and expense to evaluate the possible acquisition of the Property, Seller agrees that it will deal exclusively with Buyer while Seller and Buyer are negotiating a Purchase Agreement and while that agreement is in full force and effect. Seller will not entertain offers, conduct negotiations, or enter into any binding agreement affecting the Property with third parties during such time.";

const CONFIDENTIALITY =
  "Confidentiality: This Offer to Purchase is being transmitted with the understanding that its contents, and the fact that it is being transmitted, remain confidential. Before any transaction between Buyer and Seller is completed, Seller will not make, or allow to be made, any public announcement of the transaction or of this Offer to Purchase without Buyer's prior consent.";

const OFFER_EXPIRATION =
  "Offer Expiration: This offer expires ten (10) days from the date of this letter if Seller has not accepted it in writing.";

function libraryVariants(id: string): LoiSectionVariant[] {
  const clause = CLAUSE_LIBRARY.find((item) => item.id === id);
  if (!clause) return [];
  let text = clause.template;
  for (const variable of clause.variables) {
    const raw = variable.defaultValue || "";
    const value = /days|count/i.test(variable.token) && raw ? countPhrase(raw) : raw;
    text = text.replace(new RegExp(`\\{\\{${variable.token}\\}\\}`, "g"), value);
  }
  return [{ id: "library", label: "Saved wording", text }];
}

export const LOI_SECTIONS: LoiSectionDef[] = [
  { id: "property", label: "Property", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: [] },
  { id: "seller", label: "Seller", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["seller_entity"] },
  { id: "buyer", label: "Buyer", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["buyer_entity"] },
  { id: "purchase_price", label: "Purchase Price", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["purchase_price", "price_per_acre", "price_per_sqft"] },
  { id: "earnest_money", label: "Earnest Money", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["earnest_money", "emd_days", "title_company", "title_agent"] },
  { id: "contract_closing", label: "Contract & Closing", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["psa_drafted_by", "psa_draft_days", "closing_period"] },
  {
    id: "closing_extension",
    label: "Closing Extension",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: false, loi_building: false },
    variants: libraryVariants("closing_extension"),
    fields: ["extension_count", "extension_days", "extension_deposit"],
  },
  { id: "seller_disclosures", label: "Seller's Disclosures", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["seller_disclosures_days"] },
  { id: "due_diligence", label: "Due Diligence", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["dd_period"] },
  { id: "title_insurance", label: "Title Insurance", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "prorations", label: "Pro-rations", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "brokers", label: "Brokers", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [], fields: ["broker_names", "commission_pct", "cre8_agent_email", "cre8_agent_phone"] },
  {
    id: "exclusive_dealings",
    label: "Exclusive Dealings",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: true, loi_building: true },
    insertText: EXCLUSIVE,
    variants: [],
  },
  {
    id: "confidentiality",
    label: "Confidentiality",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: true, loi_building: true },
    insertText: CONFIDENTIALITY,
    variants: [],
  },
  { id: "prior_agreements", label: "Prior Agreements", docs: ["loi_land"], required: false, defaultOn: { loi_land: true, loi_building: false }, variants: [] },
  {
    id: "offer_expiration",
    label: "Offer Expiration",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: true, loi_building: true },
    insertText: OFFER_EXPIRATION,
    fields: ["offer_expiration_days"],
    variants: [],
  },
  ...CLAUSE_LIBRARY.filter((clause) => clause.id !== "closing_extension").map((clause) => ({
    id: clause.id,
    label: clause.label,
    docs: ["loi_land", "loi_building"] as Array<"loi_land" | "loi_building">,
    required: false,
    defaultOn: { loi_land: false, loi_building: false },
    insertText: `${clause.label}: ${libraryVariants(clause.id)[0]?.text || clause.template}`,
    variants: libraryVariants(clause.id),
  })),
  { id: "nonbinding", label: "Non-Binding", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
];

/**
 * loi_sec_* markers in each tokenized template, top to bottom.
 * sectionsFor follows this. The section test reads the docx and fails if a
 * template is reordered without this list, so the editor cannot drift.
 * Sections that are not in the template are inserted just before Non-Binding,
 * which is where the generator adds them.
 */
export const TEMPLATE_SECTION_ORDER: Record<string, string[]> = {
  loi_land: [
    "property",
    "seller",
    "buyer",
    "purchase_price",
    "earnest_money",
    "contract_closing",
    "closing_extension",
    "seller_disclosures",
    "due_diligence",
    "title_insurance",
    "prorations",
    "brokers",
    "exclusive_dealings",
    "confidentiality",
    "prior_agreements",
    "nonbinding",
  ],
  loi_building: [
    "property",
    "seller",
    "buyer",
    "purchase_price",
    "earnest_money",
    "contract_closing",
    "closing_extension",
    "seller_disclosures",
    "due_diligence",
    "title_insurance",
    "prorations",
    "brokers",
    "nonbinding",
  ],
};

function orderLikeLetter(docType: string, defs: LoiSectionDef[]): LoiSectionDef[] {
  const template = TEMPLATE_SECTION_ORDER[docType];
  if (!template) return defs;
  const byId = new Map(defs.map((section) => [section.id, section]));
  const inTemplate = template
    .map((id) => byId.get(id))
    .filter((section): section is LoiSectionDef => !!section);
  const extras = defs.filter((section) => !template.includes(section.id));
  const anchor = inTemplate.findIndex((section) => section.id === "nonbinding");
  if (anchor < 0) return [...inTemplate, ...extras];
  return [...inTemplate.slice(0, anchor), ...extras, ...inTemplate.slice(anchor)];
}

export function sectionsFor(docType: string): LoiSectionDef[] {
  return orderLikeLetter(
    docType,
    LOI_SECTIONS.filter((section) => section.docs.includes(docType as "loi_land" | "loi_building"))
  );
}

function requiredIds(docType: string): Set<string> {
  return new Set(
    LOI_SECTIONS.filter(
      (section) => section.required && section.docs.includes(docType as "loi_land" | "loi_building")
    ).map((section) => section.id)
  );
}

export function defaultLoiClauses(docType: string): LoiClauseInput[] {
  return sectionsFor(docType).map((section) => ({
    id: section.id,
    included: section.defaultOn[docType as "loi_land" | "loi_building"] ?? false,
  }));
}

export function resolveLoiClauses(docType: string, clauses: LoiClauseInput[] | undefined): Map<string, LoiClauseInput> {
  const resolved = new Map<string, LoiClauseInput>();
  for (const clause of defaultLoiClauses(docType)) resolved.set(clause.id, clause);
  const required = requiredIds(docType);
  for (const clause of clauses || []) {
    resolved.set(clause.id, {
      id: clause.id,
      included: required.has(clause.id) ? true : clause.included !== false,
      customText: clause.customText,
      variables: clause.variables,
    });
  }
  return resolved;
}

/**
 * The non-binding sentence cites a section only when that section is in the letter.
 * Neither section → no exception. One section → that provision. Both → both provisions.
 */
export function bindingCarveout(includedIds: Iterable<string>): string {
  const included = new Set(includedIds);
  const names: string[] = [];
  if (included.has("confidentiality")) names.push("“Confidentiality”");
  if (included.has("exclusive_dealings")) names.push("“Exclusive Dealings”");
  if (names.length === 0) return "";
  const list = names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
  const noun = names.length === 1 ? "provision" : "provisions";
  return ` (except the parties shall be bound by the terms of the ${list} ${noun})`;
}

export function includedSectionIds(docType: string, clauses: LoiClauseInput[] | undefined): string[] {
  const ids: string[] = [];
  resolveLoiClauses(docType, clauses).forEach((clause, id) => {
    if (clause.included) ids.push(id);
  });
  return ids;
}

function markerId(paragraph: string): string | null {
  const match = paragraph.match(/loi_sec_([a-z0-9_]+)/);
  return match ? match[1] : null;
}

function encode(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripVanish(paragraph: string): string {
  return paragraph.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) =>
    /<w:vanish\b/.test(run) ? "" : run
  );
}

/** Keep numbering, tabs, and run fonts. Put edited wording in the existing runs. */
function rewriteParagraph(paragraph: string, customText: string): string {
  const parts = customText.split(/:/);
  const label = (parts.shift() || "").trim();
  const body = parts.join(":").trim();
  let labelSet = false;
  let bodySet = false;
  return paragraph.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, (full, attrs, raw) => {
    if (/loi_sec_/.test(raw)) return full;
    const attr = attrs || "";
    if (!labelSet) {
      labelSet = true;
      const value = body ? `${label}:` : customText;
      const space = /\s/.test(value) && !attr.includes("xml:space") ? ' xml:space="preserve"' : "";
      return `<w:t${attr}${space}>${encode(value)}</w:t>`;
    }
    if (!bodySet && body) {
      bodySet = true;
      const value = ` ${body}`;
      const space = !attr.includes("xml:space") ? ' xml:space="preserve"' : "";
      return `<w:t${attr}${space}>${encode(value)}</w:t>`;
    }
    return `<w:t${attr}></w:t>`;
  });
}

function cloneShell(documentXml: string): { pPr: string; rPr: string } | null {
  const paragraphs = documentXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const paragraph = paragraphs.find((item) => item.includes("<w:numPr"));
  if (!paragraph) return null;
  const pPr = paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "";
  const rPr = paragraph.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] || "";
  return { pPr, rPr };
}

function insertedParagraph(shell: { pPr: string; rPr: string }, text: string): string {
  const parts = text.split(/:/);
  const label = (parts.shift() || "").trim();
  const body = parts.join(":").replace(/^\s*/, "");
  const labelXml = `<w:r>${shell.rPr}<w:t>${encode(label)}:</w:t></w:r><w:r>${shell.rPr}<w:tab/></w:r>`;
  const bodyXml = `<w:r>${shell.rPr}<w:t xml:space="preserve"> ${encode(body)}</w:t></w:r>`;
  return `<w:p>${shell.pPr}${labelXml}${bodyXml}</w:p>`;
}

function offerExpirationText(variables: Record<string, string>): string {
  const days = (variables.offer_expiration_days || "10").trim() || "10";
  const words = variables.offer_expiration_days_written || numberToWritten(days);
  return `Offer Expiration: This offer expires ${words} (${days}) days from the date of this letter if Seller has not accepted it in writing.`;
}

function visibleText(paragraph: string): string {
  return (paragraph.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((node) => node.replace(/<[^>]+>/g, ""))
    .join("")
    .trim();
}

/**
 * These numbered items are a heading plus a value. When every value field is
 * blank, the letter keeps "5. Earnest Money:" and leaves the value empty.
 * Boilerplate sections (Confidentiality, Title Insurance, …) always have text.
 */
const SECTION_VALUE_FIELDS: Record<string, string[]> = {
  property: ["acreage"],
  seller: ["seller_entity"],
  buyer: ["buyer_entity"],
  purchase_price: ["purchase_price"],
  earnest_money: ["earnest_money"],
};

function sectionValueEmpty(id: string, variables: Record<string, string>): boolean {
  const fields = SECTION_VALUE_FIELDS[id];
  if (!fields) return false;
  return fields.every((field) => !(variables[field] || "").replace(/\s+/g, " ").trim());
}

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Keep the heading through its colon. The value runs are emptied, not replaced with a placeholder. */
function clearSectionValue(paragraph: string): string {
  let labelDone = false;
  return paragraph.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, (full, attrs, raw) => {
    if (/loi_sec_/.test(raw)) return full;
    if (labelDone) return `<w:t${attrs || ""}></w:t>`;
    const decoded = decodeXml(raw);
    const colon = decoded.indexOf(":");
    if (colon < 0) return full;
    labelDone = true;
    const label = decoded.slice(0, colon + 1);
    const attr = attrs || "";
    const space = /\s/.test(label) && !attr.includes("xml:space") ? ' xml:space="preserve"' : "";
    return `<w:t${attr}${space}>${encode(label)}</w:t>`;
  });
}

/** The empty paragraph that follows a numbered item. Keep-with-next spacers stay. */
function isItemSpacer(paragraph: string | undefined): boolean {
  if (!paragraph || visibleText(paragraph)) return false;
  return !/<w:keepNext\b|<w:keepLines\b|<w:drawing\b|<w:sectPr\b|<w:pict\b/.test(paragraph);
}

export function applyLoiSections(
  documentXml: string,
  docType: string,
  clauses: LoiClauseInput[] | undefined,
  variables: Record<string, string>
): string {
  const resolved = resolveLoiClauses(docType, clauses);
  const present = new Set<string>();
  const paragraphs = documentXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const spacer = paragraphs.find((paragraph) => isItemSpacer(paragraph)) || "<w:p/>";
  let cursor = 0;
  let xml = "";
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const at = documentXml.indexOf(paragraph, cursor);
    xml += documentXml.slice(cursor, at);
    cursor = at + paragraph.length;
    const id = markerId(paragraph);
    if (!id) {
      xml += paragraph;
      continue;
    }
    present.add(id);
    const clause = resolved.get(id);
    if (clause && clause.included === false) {
      if (isItemSpacer(paragraphs[index + 1])) {
        const blank = paragraphs[index + 1];
        const blankAt = documentXml.indexOf(blank, cursor);
        cursor = blankAt + blank.length;
        index += 1;
      }
      continue;
    }
    const custom = clause?.customText?.trim();
    let next = stripVanish(custom ? rewriteParagraph(paragraph, custom) : paragraph);
    if (!custom && sectionValueEmpty(id, variables)) next = clearSectionValue(next);
    xml += next;
  }
  xml += documentXml.slice(cursor);

  const shell = cloneShell(xml);
  if (!shell) return xml;
  const inserts: string[] = [];
  for (const section of sectionsFor(docType)) {
    if (present.has(section.id)) continue;
    const clause = resolved.get(section.id);
    if (!clause?.included) continue;
    const custom = clause.customText?.trim();
    const text = custom
      || (section.id === "offer_expiration" ? offerExpirationText(variables) : section.insertText || "");
    if (!text) continue;
    inserts.push(insertedParagraph(shell, text) + spacer);
  }
  if (inserts.length === 0) return xml;
  const anchor = xml.search(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?(?:Term Sheet|Non-Binding)/);
  if (anchor < 0) return xml + inserts.join("");
  return xml.slice(0, anchor) + inserts.join("") + xml.slice(anchor);
}

const PAGE_BREAK_RUN = `<w:r><w:br w:type="page"/></w:r>`;

function injectPageBreak(paragraph: string): string {
  if (/<w:br\b[^>]*w:type="page"/.test(paragraph)) return paragraph;
  if (/<w:pPr\b/.test(paragraph)) {
    return paragraph.replace(/<\/w:pPr>/, `</w:pPr>${PAGE_BREAK_RUN}`);
  }
  return paragraph.replace(/<w:p\b[^>]*>/, (open) => `${open}${PAGE_BREAK_RUN}`);
}

/**
 * The closing ("If the basic terms and conditions…") and the signature block
 * start on a new page. Exhibit A starts on the page after that. Trailing
 * empty paragraphs left over from the old exhibit image are dropped so they
 * cannot open a blank page between the signature and Exhibit A.
 */
export function insertLoiPageBreaks(documentXml: string): string {
  const paragraphs = documentXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  if (paragraphs.length === 0) return documentXml;
  let lastText = -1;
  paragraphs.forEach((paragraph, index) => {
    if (visibleText(paragraph)) lastText = index;
  });
  if (lastText < 0) return documentXml;

  const exhibit =
    `<w:p><w:pPr><w:ind w:left="360"/><w:jc w:val="center"/><w:rPr>` +
    `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>` +
    `${PAGE_BREAK_RUN}<w:r><w:rPr>` +
    `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Exhibit A:</w:t></w:r></w:p>`;

  let xml = "";
  let cursor = 0;
  let exhibitPlaced = false;
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const at = documentXml.indexOf(paragraph, cursor);
    xml += documentXml.slice(cursor, at);
    cursor = at + paragraph.length;
    if (index > lastText) continue;
    const text = visibleText(paragraph);
    const isClosing = text.startsWith("If the basic terms and conditions");
    xml += isClosing ? injectPageBreak(paragraph) : paragraph;
    if (index === lastText && !exhibitPlaced && !/Exhibit A/.test(text)) {
      xml += exhibit;
      exhibitPlaced = true;
    }
  }
  xml += documentXml.slice(cursor);
  return xml;
}

export function insertLoiPageBreaksToZip(zip: PizZip): void {
  const document = zip.file("word/document.xml");
  if (!document) return;
  zip.file("word/document.xml", insertLoiPageBreaks(document.asText()));
}

export function applyLoiSectionsToZip(
  zip: PizZip,
  docType: string,
  clauses: LoiClauseInput[] | undefined,
  variables: Record<string, string>
): void {
  const document = zip.file("word/document.xml");
  if (!document) return;
  zip.file(
    "word/document.xml",
    applyLoiSections(document.asText(), docType, clauses, variables)
  );
}
