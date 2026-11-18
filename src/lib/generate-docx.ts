import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import fs from "fs";
import path from "path";
import { CLAUSE_LIBRARY } from "@/lib/clause-library";
import { embedLoiLetterhead, isLoiDocType } from "@/lib/loi-letterhead";
import { applyLoiDerived } from "@/lib/loi-wording";
import { polishLoiDocument } from "@/lib/loi-polish";

/**
 * Clean split XML tokens in .docx
 * Word splits {{token_name}} across multiple XML runs due to spell-check,
 * formatting changes, etc. This merges them back into clean {{token}} tags
 * so docxtemplater can find them.
 *
 * Single pass: for every {{...}} span in the raw XML, strip out any XML tags
 * from the inner content, validate the result is a token name, and collapse
 * to {{token}}. This handles all split patterns:
 *   - {{ and }} in separate runs from the token name
 *   - token NAME itself split mid-word across runs (e.g. "earnest_" + "money")
 *   - combinations of both
 *
 * Note: Pass 1 (the earlier splitPattern + broadPattern approach) was removed
 * because it incorrectly matched token names ending with "_" (e.g. it would
 * greedily capture "earnest_" as the token, discarding "money", resulting in
 * {{earnest_}} instead of {{earnest_money}}). Pass 2 alone handles all cases.
 */
export function cleanSplitTokens(xml: string): string {
  // Match every {{...}} span in the XML — lazy so we stop at the first }}.
  // For already-clean tokens, return unchanged.
  // For spans containing XML tags, strip the tags, validate the remaining text
  // is a valid token name, and return a clean {{token}}.
  return xml.replace(/\{\{([\s\S]*?)\}\}/g, (match, inner) => {
    // Already a clean token — nothing to do
    if (/^[a-z_][a-z0-9_]*$/.test(inner)) return match;

    // Strip XML tags and whitespace from the inner content
    const token = inner.replace(/<[^>]+>/g, "").replace(/\s/g, "");

    // Only collapse if the result looks like a valid token name
    if (/^[a-z_][a-z0-9_]*$/.test(token)) {
      return `{{${token}}}`;
    }

    // Not a recognizable token — leave unchanged
    return match;
  });
}

export class DocxGenerateError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DocxGenerateError";
    this.status = status;
  }
}

type ClauseInput = {
  included?: boolean;
  id: string;
  variables?: Record<string, string>;
  customText?: string;
};

export type GenerateDocxInput = {
  docType?: string;
  variables?: Record<string, string>;
  clauses?: ClauseInput[];
};

const TEMPLATE_FILES: Record<string, string> = {
  loi_building: "loi-building-tokenized.docx",
  loi_land: "loi-land-tokenized.docx",
  loi_lease: "loi-lease-tokenized.docx",
  listing_sale: "sale-listing-agreement-tokenized.docx",
  listing_sale_lease: "sale-lease-listing-agreement-tokenized.docx",
  listing_lease: "lease-listing-agreement-tokenized.docx",
};

/**
 * Fill a Docs template and return the .docx bytes.
 * LOI output has the letterhead embedded in every header after token replacement.
 */
export function generateDocxBuffer(input: GenerateDocxInput): Buffer {
  const { docType, variables, clauses } = input;

  if (!docType || !variables) {
    throw new DocxGenerateError("Missing docType or variables", 400);
  }

  const templateFileName = TEMPLATE_FILES[docType];
  if (!templateFileName) {
    throw new DocxGenerateError(`No template found for doc type: ${docType}`, 400);
  }

  const templatePath = path.join(
    process.cwd(),
    "src",
    "templates",
    "tokenized",
    templateFileName
  );

  if (!fs.existsSync(templatePath)) {
    throw new DocxGenerateError("Template file not found on server", 500);
  }

  const templateContent = fs.readFileSync(templatePath);
  const zip = new PizZip(templateContent);

  // Pre-clean the document XML to fix split tokens
  const xmlFiles = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/header3.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];
  for (const xmlFile of xmlFiles) {
    const file = zip.file(xmlFile);
    if (file) {
      const rawXml = file.asText();
      const cleanedXml = cleanSplitTokens(rawXml);
      zip.file(xmlFile, cleanedXml);
    }
  }

  // Configure docxtemplater with custom delimiters matching our {{token}} format
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    // Don't throw on missing tags — replace with empty string
    nullGetter: () => "",
  });

  // Build the data object for token replacement.
  // LOI templates use a few derived sentences (PSA drafter, extension plural,
  // optional lines that disappear when the field is blank).
  const data: Record<string, string> = isLoiDocType(docType)
    ? applyLoiDerived(variables)
    : { ...variables };

  // Handle clause insertion markers
  if (clauses && Array.isArray(clauses)) {
    const includedClauses = clauses.filter((c) => c.included);

    // Clear closing extension marker (template uses the individual tokens directly)
    data.clause_insert_closing_extension = "";

    // For optional clauses — insert into optional markers
    const optionalClauses = includedClauses.filter((c) => c.id !== "closing_extension");

    optionalClauses.forEach((clause, index) => {
      const clauseDef = CLAUSE_LIBRARY.find((c) => c.id === clause.id);
      let clauseText = "";

      if (clause.customText) {
        clauseText = clause.customText;
      } else if (clauseDef) {
        clauseText = clauseDef.template;
        for (const [varToken, varValue] of Object.entries(clause.variables || {})) {
          clauseText = clauseText.replace(
            new RegExp(`\\{\\{${varToken}\\}\\}`, "g"),
            varValue
          );
        }
      }

      const markerKey = `clause_insert_optional_${index + 1}`;
      data[markerKey] = clauseText;
    });

    // Clear any remaining optional markers
    for (let i = 1; i <= 5; i++) {
      const key = `clause_insert_optional_${i}`;
      if (!data[key]) {
        data[key] = "";
      }
    }
  }

  // Render the document
  doc.render(data);

  // Embed after render so token replacement cannot drop the media part.
  // Polish is LOI-only: listing agreements keep their own templates and fonts.
  if (isLoiDocType(docType)) {
    polishLoiDocument(doc.getZip(), data);
    embedLoiLetterhead(doc.getZip());
  }

  const output = doc.getZip().generate({
    type: "uint8array",
    compression: "DEFLATE",
  });

  return Buffer.from(output);
}
