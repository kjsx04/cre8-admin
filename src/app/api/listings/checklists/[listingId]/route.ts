import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { CHECKLIST_KEYS } from "@/lib/checklist/constants";

/**
 * GET /api/listings/checklists/[listingId]
 *
 * Returns { checklist } — null (200) if no row exists for this listing,
 * so the form can distinguish "not new" from an actual error.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { listingId: string } }
) {
  try {
    const { data, error } = await supabase
      .from("listing_checklists")
      .select("*")
      .eq("listing_id", params.listingId)
      .maybeSingle();

    if (error) {
      console.error("[GET checklist]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ checklist: data || null });
  } catch (err) {
    console.error("[GET checklist]", err);
    return NextResponse.json(
      { error: "Failed to fetch checklist" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/listings/checklists/[listingId]
 *
 * Body: { items?, is_new?, listing_name?, listing_agreement_url? }
 * - items go through the patch_checklist_items RPC (atomic jsonb merge;
 *   the RPC flips is_new=false when all items become checked)
 * - other fields are a plain update
 * Returns the updated row — clients read is_new from the response to
 * know when a listing has completed its checklist.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { listingId: string } }
) {
  try {
    const email = request.headers.get("x-user-email");
    if (!email) {
      return NextResponse.json(
        { error: "Missing x-user-email header" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Whitelist item keys
    const itemsPatch: Record<string, boolean> = {};
    if (body.items && typeof body.items === "object") {
      for (const key of CHECKLIST_KEYS) {
        if (typeof body.items[key] === "boolean") {
          itemsPatch[key] = body.items[key];
        }
      }
    }

    let row = null;

    // ---- Merge items via RPC (atomic) ----
    if (Object.keys(itemsPatch).length > 0) {
      const { data: patched, error: rpcErr } = await supabase
        .rpc("patch_checklist_items", {
          p_listing_id: params.listingId,
          p_patch: itemsPatch,
        })
        .select()
        .maybeSingle();

      if (rpcErr) {
        console.error("[PATCH checklist] rpc:", rpcErr.message);
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }
      if (!patched) {
        return NextResponse.json(
          { error: "Checklist not found" },
          { status: 404 }
        );
      }
      row = patched;
    }

    // ---- Non-item fields ----
    const updates: Record<string, unknown> = {};
    if (typeof body.is_new === "boolean") updates.is_new = body.is_new;
    if (typeof body.listing_name === "string")
      updates.listing_name = body.listing_name;
    if (typeof body.listing_agreement_url === "string")
      updates.listing_agreement_url = body.listing_agreement_url;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { data: updated, error: updErr } = await supabase
        .from("listing_checklists")
        .update(updates)
        .eq("listing_id", params.listingId)
        .select()
        .maybeSingle();

      if (updErr) {
        console.error("[PATCH checklist] update:", updErr.message);
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      if (!updated) {
        return NextResponse.json(
          { error: "Checklist not found" },
          { status: 404 }
        );
      }
      row = updated;
    }

    if (!row) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    return NextResponse.json({ checklist: row });
  } catch (err) {
    console.error("[PATCH checklist]", err);
    return NextResponse.json(
      { error: "Failed to update checklist" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/listings/checklists/[listingId]
 *
 * Removes the checklist row — used when a listing is deleted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { listingId: string } }
) {
  try {
    const email = request.headers.get("x-user-email");
    if (!email) {
      return NextResponse.json(
        { error: "Missing x-user-email header" },
        { status: 401 }
      );
    }

    const { error } = await supabase
      .from("listing_checklists")
      .delete()
      .eq("listing_id", params.listingId);

    if (error) {
      console.error("[DELETE checklist]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE checklist]", err);
    return NextResponse.json(
      { error: "Failed to delete checklist" },
      { status: 500 }
    );
  }
}
