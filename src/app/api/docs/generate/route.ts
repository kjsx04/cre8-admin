import { NextRequest, NextResponse } from "next/server";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import fs from "fs";
import path from "path";
import { CLAUSE_LIBRARY } from "@/lib/clause-library";


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
function cleanSplitTokens(xml: string): string {
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

/**
 * Inject a parcel map PNG image into the .docx ZIP as the last body element.
 * Uses raw OOXML manipulation (no extra library needed).
 * Non-fatal — returns silently on error so the doc still generates without the image.
 */
function injectParcelMapImage(zip: PizZip, dataUrl: string): void {
  try {
    // ── 1. Decode base64 data URL → binary buffer (supports PNG and JPEG) ──
    const base64Match = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!base64Match) {
      console.warn("[injectParcelMapImage] Invalid data URL format");
      return;
    }
    const imgFormat = base64Match[1]; // "png" or "jpeg"
    const imgExt = imgFormat === "jpeg" ? "jpg" : "png";
    const imgBuffer = Buffer.from(base64Match[2], "base64");

    // ── 2. Add image file into the zip ──
    zip.file(`word/media/parcel_map.${imgExt}`, imgBuffer);

    // ── 3. Update [Content_Types].xml — add image content type if missing ──
    const contentTypesFile = zip.file("[Content_Types].xml");
    if (!contentTypesFile) return;
    let contentTypesXml = contentTypesFile.asText();
    if (!contentTypesXml.includes(`Extension="${imgExt}"`)) {
      contentTypesXml = contentTypesXml.replace(
        "</Types>",
        `<Default Extension="${imgExt}" ContentType="image/${imgFormat}"/></Types>`
      );
    }
    zip.file("[Content_Types].xml", contentTypesXml);

    // ── 4. Update word/_rels/document.xml.rels — add relationship for the image ──
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (!relsFile) return;
    let relsXml = relsFile.asText();
    // Only add if not already present
    if (!relsXml.includes("rIdParcelMap")) {
      relsXml = relsXml.replace(
        "</Relationships>",
        `<Relationship Id="rIdParcelMap" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/parcel_map.${imgExt}"/></Relationships>`
      );
    }
    zip.file("word/_rels/document.xml.rels", relsXml);

    // ── 5. Ensure OOXML namespaces are declared on <w:document> root ──
    const docFile = zip.file("word/document.xml");
    if (!docFile) return;
    let docXml = docFile.asText();

    // Namespaces we need for DrawingML images
    const nsMap: Record<string, string> = {
      "xmlns:wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
      "xmlns:a": "http://schemas.openxmlformats.org/drawingml/2006/main",
      "xmlns:pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
      "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    };

    // Find the <w:document ...> opening tag and inject missing namespaces
    const docTagMatch = docXml.match(/<w:document[^>]*>/);
    if (docTagMatch) {
      let docTag = docTagMatch[0];
      for (const [attr, val] of Object.entries(nsMap)) {
        if (!docTag.includes(attr)) {
          docTag = docTag.replace(">", ` ${attr}="${val}">`);
        }
      }
      docXml = docXml.replace(docTagMatch[0], docTag);
    }

    // ── 6. Build the DrawingML paragraph for the image ──
    // Image dimensions: 6" wide × 4.5" tall (EMUs: 1 inch = 914400 EMU)
    const widthEmu = 6 * 914400;   // 5486400
    const heightEmu = 4.5 * 914400; // 4114800

    const drawingParagraph = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="99" name="Parcel Map"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="99" name="parcel_map.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdParcelMap"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

    // ── 7. Insert before </w:body> — appends at end of document ──
    docXml = docXml.replace("</w:body>", `${drawingParagraph}</w:body>`);

    zip.file("word/document.xml", docXml);
  } catch (err) {
    // Non-fatal — doc generates without the image
    console.warn("[injectParcelMapImage] Failed to inject image:", err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { docType, variables, clauses, parcelMapImage } = body;

    if (!docType || !variables) {
      return NextResponse.json(
        { error: "Missing docType or variables" },
        { status: 400 }
      );
    }

    // Map doc type to template file
    const templateMap: Record<string, string> = {
      loi_building: "loi-building-tokenized.docx",
      loi_land: "loi-land-tokenized.docx",
      loi_lease: "loi-lease-tokenized.docx",
      listing_sale: "sale-listing-agreement-tokenized.docx",
      listing_sale_lease: "sale-lease-listing-agreement-tokenized.docx",
      listing_lease: "lease-listing-agreement-tokenized.docx",
    };

    const templateFileName = templateMap[docType];
    if (!templateFileName) {
      return NextResponse.json(
        { error: `No template found for doc type: ${docType}` },
        { status: 400 }
      );
    }

    // Load the template file
    const templatePath = path.join(
      process.cwd(),
      "src",
      "templates",
      "tokenized",
      templateFileName
    );

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "Template file not found on server" },
        { status: 500 }
      );
    }

    const templateContent = fs.readFileSync(templatePath);
    const zip = new PizZip(templateContent);

    // Pre-clean the document XML to fix split tokens
    const xmlFiles = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];
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

    // Build the data object for token replacement
    const data: Record<string, string> = { ...variables };

    // Handle clause insertion markers
    if (clauses && Array.isArray(clauses)) {
      const includedClauses = clauses.filter(
        (c: { included: boolean }) => c.included
      );

      // Clear closing extension marker (template uses the individual tokens directly)
      data.clause_insert_closing_extension = "";

      // For optional clauses — insert into optional markers
      const optionalClauses = includedClauses.filter(
        (c: { id: string }) => c.id !== "closing_extension"
      );

      optionalClauses.forEach(
        (clause: { id: string; variables: Record<string, string>; customText?: string }, index: number) => {
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
        }
      );

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

    // Get the rendered ZIP for post-processing
    const renderedZip = doc.getZip();

    // Inject parcel map image if provided (non-fatal — doc still generates on error)
    if (parcelMapImage && typeof parcelMapImage === "string") {
      injectParcelMapImage(renderedZip, parcelMapImage);
    }

    // Generate the output
    const output = renderedZip.generate({
      type: "uint8array",
      compression: "DEFLATE",
    });

    return new NextResponse(Buffer.from(output), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${docType}_document.docx"`,
      },
    });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Document generation failed",
      },
      { status: 500 }
    );
  }
}
