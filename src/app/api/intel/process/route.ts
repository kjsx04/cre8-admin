import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/flow/supabase";

/**
 * POST /api/intel/process
 * Two modes:
 *   1. Reprocess: { id, text } — takes a needs_text brief + pasted article text → GPT summary
 *   2. Manual submit: { headline, text } — creates a new brief from scratch
 *
 * Uses the same GPT prompt as cre8-site's process route.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/* Generate URL-safe slug from title */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* Pull recent approved briefs as few-shot examples */
async function getFewShotExamples(): Promise<string> {
  const { data: edited } = await supabase
    .from("market_intel")
    .select("title, summary, impact, category, tags, original_summary, original_impact")
    .eq("status", "live")
    .eq("was_edited", true)
    .order("published_at", { ascending: false })
    .limit(3);

  const { data: approved } = await supabase
    .from("market_intel")
    .select("title, summary, impact, category, tags")
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(5);

  const examples: string[] = [];

  if (edited && edited.length > 0) {
    examples.push("STYLE CORRECTIONS (learn from these — the editor revised these briefs):");
    for (const ex of edited) {
      let block = `\nCategory: ${ex.category}\nTitle: ${ex.title}`;
      if (ex.original_summary && ex.original_summary !== ex.summary) {
        block += `\nOriginal summary: ${ex.original_summary}\nCorrected summary: ${ex.summary}`;
      } else {
        block += `\nSummary: ${ex.summary}`;
      }
      if (ex.original_impact && ex.original_impact !== ex.impact) {
        block += `\nOriginal impact: ${ex.original_impact}\nCorrected impact: ${ex.impact}`;
      } else {
        block += `\nImpact: ${ex.impact}`;
      }
      block += `\nTags: ${(ex.tags || []).join(", ")}`;
      examples.push(block);
    }
  }

  if (approved && approved.length > 0) {
    const editedTitles = new Set((edited || []).map((e) => e.title));
    const unique = approved.filter((a) => !editedTitles.has(a.title)).slice(0, 3);
    if (unique.length > 0) {
      examples.push("\nAPPROVED EXAMPLES (match this style and depth):");
      for (const ex of unique) {
        examples.push(
          `\nCategory: ${ex.category}\nTitle: ${ex.title}\nSummary: ${ex.summary}\nImpact: ${ex.impact}\nTags: ${(ex.tags || []).join(", ")}`
        );
      }
    }
  }

  return examples.length > 0 ? examples.join("\n") : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, headline, text, source_name, source_url, source_date } = body;

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    /* If reprocessing an existing brief, grab its metadata */
    let existingBrief = null;
    if (id) {
      const { data } = await supabase
        .from("market_intel")
        .select("*")
        .eq("id", id)
        .single();
      existingBrief = data;
    }

    const articleHeadline = headline || existingBrief?.title || existingBrief?.original_headline || "";
    const fewShotExamples = await getFewShotExamples();

    /* Build the system prompt */
    let systemPrompt = `You are a commercial real estate analyst for CRE8 Advisors, a Phoenix-based brokerage specializing in data centers, retail, and land.

STRICT CONTENT FILTER — You MUST set relevance_score to 0 for ANY article that is not directly about commercial real estate development. This is the most important instruction.

RELEVANT (score 50-100):
- New developments, construction, projects breaking ground
- Companies entering or expanding in Phoenix / Arizona
- Zoning changes, rezoning approvals, land use decisions
- Land sales, acquisitions, major transactions (with dollar amounts or details)
- Infrastructure projects (power, water, fiber, roads) that directly enable development
- Policy changes that directly affect real estate development or investment
- Market data, reports, rankings specifically about Phoenix CRE

IRRELEVANT — ALWAYS score 0, no exceptions:
- Crime, violence, arrests, deaths at any location
- Obituaries, memorials, tributes
- General local news, community events, human interest stories
- Sports, weather, entertainment
- Politics (unless specifically a zoning vote, tax incentive, or development policy)

If in doubt, score 0. We would rather miss an article than show irrelevant content.

Always respond with valid JSON only.`;

    if (fewShotExamples) {
      systemPrompt += `\n\nHere are recent briefs approved by the editor. Match this style exactly.\n\n${fewShotExamples}`;
    }

    /* Run through GPT */
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this article and produce a market intelligence brief.

ARTICLE HEADLINE: ${articleHeadline}
ARTICLE TEXT: ${text}

Respond in this exact JSON format:
{
  "title": "A clear, concise headline for the brief (not the original headline — rewrite it to be direct and informative)",
  "summary": "The main body. Concise but include ALL relevant information from the article — who, what, where, when, numbers, key details. Cover the full story so the reader doesn't need to read the original article. 4-8 sentences. No fluff, no filler, no editorializing.",
  "impact": "1-2 sentences max. What this means for developers, operators, landowners, or tenants in the Phoenix market. Be specific and direct.",
  "category": "One of: data-center, retail, land, market, infrastructure",
  "tags": ["array", "of", "relevant", "tags"],
  "relevance_score": 0-100
}`,
        },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const brief = JSON.parse(responseText);

    if (existingBrief) {
      /* ── REPROCESS MODE: update existing needs_text brief ── */
      const { data: updated, error } = await supabase
        .from("market_intel")
        .update({
          title: brief.title,
          summary: brief.summary,
          impact: brief.impact,
          original_summary: brief.summary,
          original_impact: brief.impact,
          category: brief.category,
          tags: brief.tags || [],
          relevance_score: brief.relevance_score || 50,
          original_text: text,
          status: "pending",
          was_edited: false,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, brief: updated });
    } else {
      /* ── MANUAL SUBMIT MODE: create new brief ── */
      let slug = slugify(brief.title);
      const { data: existingSlug } = await supabase
        .from("market_intel")
        .select("slug")
        .eq("slug", slug)
        .single();

      if (existingSlug) {
        slug = `${slug}-${new Date().toISOString().slice(0, 10)}`;
      }

      const { data: created, error } = await supabase
        .from("market_intel")
        .insert({
          title: brief.title,
          slug,
          summary: brief.summary,
          impact: brief.impact,
          original_summary: brief.summary,
          original_impact: brief.impact,
          category: brief.category,
          tags: brief.tags || [],
          source_name: source_name || null,
          source_url: source_url || null,
          source_date: source_date || null,
          status: "pending",
          relevance_score: brief.relevance_score || 50,
          original_headline: headline || null,
          original_text: text,
          was_edited: false,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, brief: created });
    }
  } catch (err) {
    console.error("Intel process error:", err);
    return NextResponse.json({ error: "Failed to process article" }, { status: 500 });
  }
}
