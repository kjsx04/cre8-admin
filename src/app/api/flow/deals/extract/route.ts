import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

// POST /api/flow/deals/extract — parse a PDF or DOCX file and extract deal fields via Claude
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
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
  const client = new Anthropic({ apiKey });

  try {
    let message;

    if (ext === "pdf") {
      // Send PDF directly to Claude — it reads PDFs natively via base64
      message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data },
              },
              {
                type: "text",
                text: "Extract deal data from this document.",
              },
            ],
          },
        ],
      });
    } else if (ext === "docx" || ext === "doc") {
      // DOCX: extract text with mammoth, then send text to Claude
      const buffer = Buffer.from(data, "base64");
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;

      if (!text.trim()) {
        return NextResponse.json({ error: "No text content found in file" }, { status: 400 });
      }

      // Truncate to ~30k chars to stay within token limits
      const truncated = text.slice(0, 30000);

      message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extract deal data from this document:\n\n${truncated}`,
          },
        ],
      });
    } else {
      return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 });
    }

    // Parse Claude's response
    const responseText = message.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("");

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
    return NextResponse.json({ error: "AI extraction failed" }, { status: 500 });
  }
}
