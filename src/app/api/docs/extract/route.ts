import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { completeText } from "@/lib/ai/client";
import { getVariableMap } from "@/lib/constants";
import { CLAUSE_LIBRARY } from "@/lib/clause-library";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const { docType, rawInput, cmsContext } = body;

    if (!docType || !rawInput) {
      return NextResponse.json(
        { error: "Missing docType or rawInput" },
        { status: 400 }
      );
    }

    // Get the variable map for this doc type
    const variableMap = getVariableMap(docType);

    // Build the variable list for the prompt (exclude auto-generated fields)
    const variableList = variableMap
      .filter((v) => v.source !== "auto")
      .map((v) => `- ${v.token}: ${v.label}${v.flag ? " (HIGH PRIORITY — flag: true)" : ""}${v.defaultValue ? ` (default: "${v.defaultValue}")` : ""}`)
      .join("\n");

    // Build clause triggers list for prompt
    const clauseTriggers = CLAUSE_LIBRARY.map(
      (c) => `  - ${c.id}: triggers = ${c.triggers.join(", ")}`
    ).join("\n");

    // Build CMS context for the prompt (pre-filled values)
    let cmsInfo = "";
    if (cmsContext?.sellerBroker) {
      cmsInfo += `\nSeller Broker (pre-selected): ${cmsContext.sellerBroker.name}, ${cmsContext.sellerBroker.email}`;
    }
    if (cmsContext?.cre8Broker) {
      cmsInfo += `\nCRE8 Broker (signing agent): ${cmsContext.cre8Broker.name}, ${cmsContext.cre8Broker.email}, ${cmsContext.cre8Broker.phone}`;
    }
    if (cmsContext?.listing) {
      cmsInfo += `\nSelected listing: ${cmsContext.listing.name}, Address: ${cmsContext.listing.address}`;
    }

    const systemPrompt = `You are a commercial real estate document assistant for CRE8 Advisors, a Phoenix-based CRE brokerage.

Extract deal variables from the broker's description and return structured JSON.

Rules:
- Return ONLY valid JSON. No preamble, no markdown, no code fences.
- Confidence score (0.0–1.0) on every field
- Missing fields: value "" confidence 0.0
- Dollar amounts: $ with commas, e.g. "$50,000"
- earnest_money_written: spelled out in words, e.g. "fifty thousand and 00/100 dollars"
- Entity names: preserve exact capitalization and spelling
- Dates: format as "February 18, 2026"
- Percentages: include % sign, e.g. "3%"
- For number fields that have a _written variant, only extract the number — the system auto-generates the written version
- Detect clauses → return in clauses array
- Non-standard terms → "custom_terms" array with drafted professional CRE language

Document type: ${docType}

Expected variables:
${variableList}

Available clause IDs and their triggers:
${clauseTriggers}

Pre-filled context from CMS selections:
${cmsInfo || "None"}

Return format:
{
  "variables": {
    "token_name": { "value": "extracted value", "confidence": 0.95, "label": "Human Label", "flag": false }
  },
  "clauses": [
    { "id": "clause_id", "detected": true, "source": "library", "variables": { "var_name": "value" } }
  ],
  "custom_terms": ["any non-standard term descriptions"]
}`;

    const text = await completeText({
      tier: "flagship",
      maxTokens: 4096,
      system: systemPrompt,
      user: rawInput,
    });

    // Parse the JSON response
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // Try to extract JSON from the response if it has extra text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse the model response as JSON");
      }
    }

    // Ensure all variables from the map have entries (fill missing with empty)
    for (const varDef of variableMap) {
      if (!result.variables[varDef.token]) {
        result.variables[varDef.token] = {
          value: varDef.defaultValue || "",
          confidence: varDef.defaultValue ? 1.0 : 0.0,
          label: varDef.label,
          flag: varDef.flag,
        };
      }
      // Ensure the flag field matches our definition
      result.variables[varDef.token].flag = varDef.flag;
      result.variables[varDef.token].label = varDef.label;
    }

    // Set auto-generated date
    const today = new Date();
    const dateFormatted = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    result.variables.date = {
      value: dateFormatted,
      confidence: 1.0,
      label: "Date",
      flag: false,
    };

    // Apply CMS pre-fills with high confidence
    if (cmsContext?.sellerBroker) {
      result.variables.seller_broker_name = {
        value: cmsContext.sellerBroker.name,
        confidence: 1.0,
        label: "Seller Broker Name",
        flag: false,
      };
      result.variables.seller_broker_company = {
        value: "",
        confidence: 0.0,
        label: "Seller Broker Company",
        flag: false,
      };
      result.variables.seller_broker_email = {
        value: cmsContext.sellerBroker.email,
        confidence: 1.0,
        label: "Seller Broker Email",
        flag: false,
      };
    }

    if (cmsContext?.cre8Broker) {
      result.variables.broker_names = {
        value: cmsContext.cre8Broker.name,
        confidence: 1.0,
        label: "CRE8 Broker Name(s)",
        flag: false,
      };
      result.variables.cre8_agent_email = {
        value: cmsContext.cre8Broker.email,
        confidence: 1.0,
        label: "CRE8 Agent Email",
        flag: false,
      };
      result.variables.cre8_agent_phone = {
        value: cmsContext.cre8Broker.phone,
        confidence: 1.0,
        label: "CRE8 Agent Phone",
        flag: false,
      };
    }

    if (cmsContext?.listing) {
      result.variables.property_address = {
        value: cmsContext.listing.address,
        confidence: 1.0,
        label: "Property Address",
        flag: false,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
