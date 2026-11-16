import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { supabase } from "@/lib/flow/supabase";

/**
 * /api/intel — CRUD for market intel briefs (admin approval queue).
 * GET: Fetch briefs (filterable by status, category)
 * PATCH: Update brief (approve, edit, delete)
 *
 * Edit tracking: when summary or impact is changed, marks was_edited = true.
 * The process route uses edited briefs as few-shot examples so GPT
 * learns the house style over time.
 */

/* GET /api/intel?status=pending&category=data-center */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const limit = parseInt(searchParams.get("limit") || "100");

  let query = supabase
    .from("market_intel")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * Columns a caller is allowed to set.
 *
 * This route used to do `const { id, ...updates } = body` and hand `updates`
 * straight to `.update()`, so any column on the row was writable — `slug`,
 * `relevance_score`, `original_text`, `was_edited`, `published_at`. Combined
 * with the fact that this endpoint had no auth at all, that was a public write
 * to the one table whose contents are published.
 *
 * `was_edited` is deliberately NOT here: the server derives it below, and it
 * decides which briefs become few-shot style examples for the AI.
 */
const EDITABLE_FIELDS = [
  "title",
  "summary",
  "impact",
  "category",
  "tags",
  "status",
  "published_at",
] as const;

/** Enum values the database will accept — reject early with a clear message. */
const VALID_STATUS = ["pending", "live", "deleted", "needs_text"];
const VALID_CATEGORY = ["data-center", "retail", "land", "market", "infrastructure"];

/* PATCH /api/intel — update a brief (approve, edit, soft-delete) */
export async function PATCH(req: NextRequest) {
  const auth = requireUser(req);
  if (auth.response) return auth.response;
  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Copy across only the fields a caller may set, rather than spreading the
  // whole body.
  const updates: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  if (updates.status !== undefined && !VALID_STATUS.includes(updates.status as string)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUS.join(", ")}` },
      { status: 400 }
    );
  }
  if (updates.category !== undefined && !VALID_CATEGORY.includes(updates.category as string)) {
    return NextResponse.json(
      { error: `category must be one of: ${VALID_CATEGORY.join(", ")}` },
      { status: 400 }
    );
  }

  /* If approving (status → live), set published_at */
  if (updates.status === "live" && !updates.published_at) {
    updates.published_at = new Date().toISOString();
  }

  /* Detect if content was edited — mark was_edited for few-shot learning.
     The original_summary and original_impact are set when the brief is first
     created by the process route. If the admin changes summary or impact,
     the originals stay as-is (showing what GPT wrote) while the main fields
     reflect Kevin's edits. The process route uses these diffs to teach GPT. */
  if (updates.summary || updates.impact) {
    /* Fetch current values to check if anything actually changed */
    const { data: current } = await supabase
      .from("market_intel")
      .select("summary, impact, original_summary, original_impact")
      .eq("id", id)
      .single();

    if (current) {
      const summaryChanged = updates.summary && updates.summary !== current.original_summary;
      const impactChanged = updates.impact && updates.impact !== current.original_impact;

      if (summaryChanged || impactChanged) {
        updates.was_edited = true;
      }
    }
  }

  const { data, error } = await supabase
    .from("market_intel")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
