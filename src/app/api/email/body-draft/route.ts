import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { API_BASE, ListingItem } from "@/lib/admin-constants";
import { requireUser } from "@/lib/email/auth";
import {
  isBodyLength,
  LENGTH_INSTRUCTIONS,
  serializeListingFacts,
} from "@/lib/email/listing-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/email/body-draft
 * Generate plain-text listing copy for the composer Body field.
 * Uses gpt-4o-mini (existing OpenAI key) — cheapest fast model already in this stack.
 */
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let payload: { listingIds?: unknown; length?: unknown; kind?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const length = payload.length;
  if (!isBodyLength(length)) {
    return NextResponse.json({ error: "Pick 2 sentences, 1 paragraph, or 2 paragraphs" }, { status: 400 });
  }

  const listingIds = Array.isArray(payload.listingIds)
    ? payload.listingIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (listingIds.length === 0) {
    return NextResponse.json({ error: "Select a listing first" }, { status: 400 });
  }

  let listings: ListingItem[];
  try {
    listings = await fetchListingsById(listingIds);
  } catch (err) {
    console.error("[body-draft] listings", err);
    return NextResponse.json({ error: "Couldn't load listings" }, { status: 502 });
  }
  if (listings.length === 0) {
    return NextResponse.json({ error: "Couldn't load those listings" }, { status: 404 });
  }

  const kind = payload.kind === "group" || listings.length > 1 ? "group" : "single";
  const sheets = listings.map((item, i) => {
    const facts = serializeListingFacts(item);
    return facts ? `LISTING ${i + 1}\n${facts}` : "";
  }).filter(Boolean);

  if (sheets.length === 0) {
    return NextResponse.json({ error: "Those listings have no facts to summarize" }, { status: 422 });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content:
            "You write listing copy for CRE8 Advisors, a Phoenix commercial real estate brokerage. " +
            "Use ONLY the facts provided. Never invent prices, acres, zoning, addresses, or other numbers. " +
            "If a fact is missing, omit it — do not guess. Voice: confident, concise, marketing-but-factual. " +
            "No hype, no superlatives unless they appear in the source. Output plain text only: no title, bullets, or markdown.",
        },
        {
          role: "user",
          content:
            `${LENGTH_INSTRUCTIONS[length]}\n\n` +
            (kind === "group"
              ? "This is a multi-listing email. Write one coherent intro for the set. Lead with listing 1, then briefly note the others. Do not invent a combined price.\n\n"
              : "Write a short body for a single-listing email, under the hero photo.\n\n") +
            sheets.join("\n\n"),
        },
      ],
    });

    const text = (completion.choices[0]?.message?.content || "").trim();
    if (!text) {
      return NextResponse.json({ error: "The model returned an empty draft" }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[body-draft] openai", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft failed" },
      { status: 502 }
    );
  }
}

async function fetchListingsById(ids: string[]): Promise<ListingItem[]> {
  const wanted = new Set(ids);
  const res = await fetch(`${API_BASE}/listings`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Listings fetch failed (${res.status})`);
  const data = await res.json();
  const items = (data.items || []) as ListingItem[];
  const byId = new Map(items.filter((i) => !i.isArchived).map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is ListingItem => !!i && wanted.has(i.id));
}
