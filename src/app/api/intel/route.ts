import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

/**
 * /api/intel — CRUD for market intel briefs (admin approval queue).
 * GET: Fetch briefs (filterable by status, category)
 * PATCH: Update brief (approve, edit, delete)
 */

/* GET /api/intel?status=pending&category=data-center */
export async function GET(req: NextRequest) {
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

/* PATCH /api/intel — update a brief (approve, edit, soft-delete) */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  /* If approving (status → live), set published_at */
  if (updates.status === "live" && !updates.published_at) {
    updates.published_at = new Date().toISOString();
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
