import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { CHECKLIST_KEYS, EMPTY_ITEMS } from "@/lib/checklist/constants";

/**
 * GET /api/listings/checklists
 *
 * Returns all listing checklist rows.
 * Query param: ?new=true → only rows where is_new = true (dashboard).
 */
export async function GET(request: NextRequest) {
  try {
    const onlyNew = request.nextUrl.searchParams.get("new") === "true";

    let query = supabase
      .from("listing_checklists")
      .select("*")
      .order("created_at", { ascending: false });

    if (onlyNew) query = query.eq("is_new", true);

    const { data, error } = await query;
    if (error) {
      console.error("[GET checklists]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ checklists: data || [] });
  } catch (err) {
    console.error("[GET checklists]", err);
    return NextResponse.json(
      { error: "Failed to fetch checklists" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/listings/checklists
 *
 * Upsert-with-merge. Body: { listing_id, listing_name?, is_new?, items? }
 * - Row missing → insert with all items false, merged with body.items
 * - Row exists  → merge body.items via the patch_checklist_items RPC
 *                 (atomic jsonb merge; flips is_new=false when all checked),
 *                 then apply listing_name / is_new if provided.
 *
 * Used by ListingForm (row creation, New toggle-on) and PublishModal
 * (published auto-check — the CMS item may have been created inside
 * the publish flow, so a plain PATCH could miss).
 */
export async function POST(request: NextRequest) {
  try {
    const email = request.headers.get("x-user-email");
    if (!email) {
      return NextResponse.json(
        { error: "Missing x-user-email header" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const listingId = String(body.listing_id || "").trim();
    if (!listingId) {
      return NextResponse.json(
        { error: "listing_id is required" },
        { status: 400 }
      );
    }

    // Whitelist item keys so unknown keys never enter the jsonb
    const itemsPatch: Record<string, boolean> = {};
    if (body.items && typeof body.items === "object") {
      for (const key of CHECKLIST_KEYS) {
        if (typeof body.items[key] === "boolean") {
          itemsPatch[key] = body.items[key];
        }
      }
    }

    // Does a row already exist for this listing?
    const { data: existing, error: selErr } = await supabase
      .from("listing_checklists")
      .select("*")
      .eq("listing_id", listingId)
      .maybeSingle();

    if (selErr) {
      console.error("[POST checklists] select:", selErr.message);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    if (!existing) {
      // ---- Insert new row ----
      const { data, error } = await supabase
        .from("listing_checklists")
        .insert({
          listing_id: listingId,
          listing_name: body.listing_name || null,
          is_new: typeof body.is_new === "boolean" ? body.is_new : true,
          items: { ...EMPTY_ITEMS, ...itemsPatch },
        })
        .select()
        .single();

      if (error) {
        console.error("[POST checklists] insert:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ checklist: data }, { status: 201 });
    }

    // ---- Row exists: merge items via RPC (atomic) ----
    let row = existing;
    if (Object.keys(itemsPatch).length > 0) {
      const { data: patched, error: rpcErr } = await supabase
        .rpc("patch_checklist_items", {
          p_listing_id: listingId,
          p_patch: itemsPatch,
        })
        .select()
        .single();

      if (rpcErr) {
        console.error("[POST checklists] rpc:", rpcErr.message);
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }
      row = patched;
    }

    // Apply non-item fields if provided
    const updates: Record<string, unknown> = {};
    if (typeof body.is_new === "boolean") updates.is_new = body.is_new;
    if (body.listing_name) updates.listing_name = body.listing_name;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { data: updated, error: updErr } = await supabase
        .from("listing_checklists")
        .update(updates)
        .eq("listing_id", listingId)
        .select()
        .single();

      if (updErr) {
        console.error("[POST checklists] update:", updErr.message);
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      row = updated;
    }

    return NextResponse.json({ checklist: row });
  } catch (err) {
    console.error("[POST checklists]", err);
    return NextResponse.json(
      { error: "Failed to upsert checklist" },
      { status: 500 }
    );
  }
}
