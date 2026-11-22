import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { completeText } from "@/lib/ai/client";
import { extractPdfText, PDF_TEXT_CHAR_LIMIT, PdfTextError } from "@/lib/flow/pdf-text";

export const maxDuration = 60;

// System prompt — extracts deal data including dynamic date milestones + document type detection
const SYSTEM_PROMPT = `You extract commercial real estate deal data from documents (LOIs, PSAs, escrow timelines, listing agreements).

Return ONLY a JSON object with the fields you can confidently extract. Omit any field you're not sure about.

Available fields:
- document_type (string, REQUIRED) — always include this. One of: "loi", "psa", or "other"
- deal_name (string) — property name or deal title
- property_address (string) — full street address
- deal_type ("sale" or "lease")
- price (string) — numeric only, no dollar signs or commas (e.g. "2500000")
- commission_rate (string) — percentage as a number (e.g. "3" for 3%)
- effective_date (string) — YYYY-MM-DD format. IMPORTANT: Only extract this for PSAs, NOT for LOIs.
- escrow_open_date (string) — YYYY-MM-DD format
- escrow_number (string) — escrow file number (e.g. "FM55250953")
- escrow_company (string) — escrow or title company name (e.g. "Fidelity National Title")
- notes (string) — any important details not captured by other fields
- deal_dates (array) — milestone dates extracted from the document

Document type detection:
- "loi" — contains phrases like "Letter of Intent", "LOI", "expression of interest", "non-binding offer", "intent to purchase"
- "psa" — contains phrases like "Purchase and Sale Agreement", "PSA", "Contract for Sale", "Buyer agrees to purchase", "escrow agreement", "closing agent"
- "other" — anything else (escrow timelines, listing agreements, etc.)

IMPORTANT: If the document is an LOI, do NOT extract effective_date. LOIs are pre-escrow documents without an effective date.

For deal_dates, return an array of objects. Each object has:
- label (string) — descriptive name like "Feasibility Ends", "Inside Close", "Outside Close", "Extension", "Inspection Deadline"
- date (string, optional) — YYYY-MM-DD if you can determine the exact calendar date
- offset_days (number, optional) — if the doc says "30 days after escrow opens" or "90 day feasibility", include the day count
- offset_reference (string, optional) — what the offset is relative to, e.g. "escrow_open", "Feasibility Ends", "Inside Close"

Examples of deal_dates extraction:
- "90-day feasibility period" → { "label": "Feasibility Ends", "offset_days": 90, "offset_reference": "escrow_open" }
- "Close of escrow 30 days after feasibility" → { "label": "Inside Close", "offset_days": 30, "offset_reference": "Feasibility Ends" }
- "Outside close date: March 15, 2026" → { "label": "Outside Close", "date": "2026-03-15" }
- "Buyer may extend feasibility by 15 days" → { "label": "Extension", "offset_days": 15, "offset_reference": "Feasibility Ends" }

Rules:
- Price should be a plain number without formatting.
- "Feasibility period" or "inspection period" or "due diligence period" maps to a "Feasibility Ends" date entry.
- "Close of escrow" or "closing date" → "Inside Close" or "Outside Close" depending on context.
- If you see both an inside close and outside close, include both as separate entries.
- Return valid JSON only. No markdown, no explanation.`;

// POST /api/flow/deals/extract — parse a PDF or DOCX file and extract deal fields
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  if (!process.env.XAI_API_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY not configured" }, { status: 500 });
  }

  let body: { filename: string; data: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, data } = body;
  if (!filename || !data) {
    return NextResponse.json({ error: "Missing filename or data" }, { status: 400 });
  }

  const ext = filename.toLowerCase().split(".").pop();

  let documentText: string;
  try {
    documentText = await documentToText(ext, data);
  } catch (err) {
    if (err instanceof PdfTextError || err instanceof DocumentTextError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[extract] Could not read the file:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the file" },
      { status: 400 }
    );
  }

  try {
    const responseText = await completeText({
      tier: "flagship",
      maxTokens: 1024,
      system: SYSTEM_PROMPT,
      user: `Extract deal data from this document:\n\n${documentText}`,
    });

    // Strip any markdown code fences if present
    const cleaned = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const extracted = JSON.parse(cleaned);

    // Safety net: if AI detected an LOI, never return an effective_date
    if (extracted.document_type === "loi") {
      delete extracted.effective_date;
    }

    return NextResponse.json(extracted);
  } catch (err) {
    console.error("[extract] Extraction failed:", err);
    // Surface the real cause instead of a generic message so failures are debuggable
    let message = "AI extraction failed";
    if (err instanceof SyntaxError) {
      // The model's response wasn't valid JSON
      message = "AI extraction failed: couldn't parse the AI response — try dropping the file again.";
    } else if (err instanceof Error && err.message) {
      message = `AI extraction failed: ${err.message}`;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

class DocumentTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentTextError";
  }
}

/**
 * Turn the upload into plain text. PDFs go through pdf.js (Grok has no native
 * PDF input here). Word files still go through mammoth. Both are cut at the
 * same character limit.
 */
async function documentToText(ext: string | undefined, data: string): Promise<string> {
  if (ext === "pdf") {
    const buffer = Buffer.from(data, "base64");
    let extracted;
    try {
      extracted = await extractPdfText(buffer);
    } catch (err) {
      if (err instanceof PdfTextError) throw err;
      throw new PdfTextError(err instanceof Error ? err.message : "Could not read this PDF");
    }
    if (extracted.imageOnly || !extracted.text.trim()) {
      throw new PdfTextError(
        "This PDF has no text we can read. It looks like a scan made of page images only. A normal text PDF works, and so does a scan that was saved as a searchable PDF. An image-only scan needs to be exported as a searchable PDF or a Word file."
      );
    }
    if (extracted.sparsePages > 0) {
      console.info(
        `[extract] ${extracted.sparsePages} of ${extracted.pageCount} PDF pages had no text layer`
      );
    }
    return extracted.text;
  }

  if (ext === "doc") {
    // Legacy binary .doc — mammoth can't parse it; fail with a clear message
    throw new DocumentTextError(
      "Legacy .doc files aren't supported — save the file as .docx or PDF and try again."
    );
  }

  if (ext === "docx") {
    const buffer = Buffer.from(data, "base64");
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    if (!text.trim()) throw new DocumentTextError("No text content found in file");
    return text.slice(0, PDF_TEXT_CHAR_LIMIT);
  }

  throw new DocumentTextError(`Unsupported file type: .${ext}`);
}
