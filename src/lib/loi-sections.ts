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
}

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
  { id: "property", label: "Property", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "seller", label: "Seller", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "buyer", label: "Buyer", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "purchase_price", label: "Purchase Price", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "earnest_money", label: "Earnest Money", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "contract_closing", label: "Contract & Closing", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  {
    id: "closing_extension",
    label: "Closing Extension",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: true, loi_building: true },
    variants: libraryVariants("closing_extension"),
  },
  { id: "seller_disclosures", label: "Seller's Disclosures", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "due_diligence", label: "Due Diligence", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "title_insurance", label: "Title Insurance", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "prorations", label: "Pro-rations", docs: ["loi_land", "loi_building"], required: false, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  { id: "brokers", label: "Brokers", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
  {
    id: "exclusive_dealings",
    label: "Exclusive Dealings",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: true, loi_building: false },
    insertText: EXCLUSIVE,
    variants: [],
  },
  {
    id: "confidentiality",
    label: "Confidentiality",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: true, loi_building: false },
    insertText: CONFIDENTIALITY,
    variants: [],
  },
  { id: "prior_agreements", label: "Prior Agreements", docs: ["loi_land"], required: false, defaultOn: { loi_land: true, loi_building: false }, variants: [] },
  {
    id: "offer_expiration",
    label: "Offer Expiration",
    docs: ["loi_land", "loi_building"],
    required: false,
    defaultOn: { loi_land: false, loi_building: false },
    insertText: OFFER_EXPIRATION,
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
  { id: "nonbinding", label: "Non-Binding", docs: ["loi_land", "loi_building"], required: true, defaultOn: { loi_land: true, loi_building: true }, variants: [] },
];

export function sectionsFor(docType: string): LoiSectionDef[] {
  return LOI_SECTIONS.filter((section) =>
    section.docs.includes(docType as "loi_land" | "loi_building")
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
  for (const clause of clauses || []) {
    resolved.set(clause.id, {
      id: clause.id,
      included: clause.included !== false,
      customText: clause.customText,
      variables: clause.variables,
    });
  }
  for (const section of sectionsFor(docType)) {
    if (!section.required) continue;
    const current = resolved.get(section.id);
    resolved.set(section.id, { ...current, id: section.id, included: true });
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

export function applyLoiSections(
  documentXml: string,
  docType: string,
  clauses: LoiClauseInput[] | undefined,
  variables: Record<string, string>
): string {
  const resolved = resolveLoiClauses(docType, clauses);
  const present = new Set<string>();
  const xml = documentXml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const id = markerId(paragraph);
    if (!id) return paragraph;
    present.add(id);
    const clause = resolved.get(id);
    if (clause && clause.included === false) return "";
    const custom = clause?.customText?.trim();
    const next = custom ? rewriteParagraph(paragraph, custom) : paragraph;
    return stripVanish(next);
  });

  const shell = cloneShell(xml);
  if (!shell) return xml;
  const inserts: string[] = [];
  for (const section of sectionsFor(docType)) {
    if (present.has(section.id)) continue;
    const clause = resolved.get(section.id);
    if (!clause?.included) continue;
    if (section.required) continue;
    const custom = clause.customText?.trim();
    const text = custom
      || (section.id === "offer_expiration" ? offerExpirationText(variables) : section.insertText || "");
    if (!text) continue;
    inserts.push(insertedParagraph(shell, text));
  }
  if (inserts.length === 0) return xml;
  const anchor = xml.search(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?(?:Term Sheet|Non-Binding)/);
  if (anchor < 0) return xml + inserts.join("");
  return xml.slice(0, anchor) + inserts.join("") + xml.slice(anchor);
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
