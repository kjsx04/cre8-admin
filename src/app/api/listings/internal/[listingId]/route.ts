import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { supabase } from "@/lib/flow/supabase";
import {
  INTERNAL_NOTE_FIELDS,
  INTERNAL_NOTE_MAX_LENGTH,
  EMPTY_INTERNAL_NOTES,
} from "@/lib/listings/internal-notes";

/**
 * Internal-only listing notes (Internal Asking Price, Zoning and Allowed
 * Uses, Other).
 *
 * Stored in Supabase `listing_internal_notes`, keyed by the Webflow item id.
 * Nothing here is ever written to Webflow or read by the public site.
 *
 * Every method requires a signed-in user: the middleware verifies the
 * Microsoft token on all /api/* routes, and requireUser() below is the
 * fail-closed second check.
 */

const TABLE = "listing_internal_notes";

/**
 * GET /api/listings/internal/[listingId]
 *
 * Returns { notes } — blank boxes (200) when nothing has been saved yet,
 * so the page doesn't have to treat "no notes" as an error.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { listingId: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("asking_price, zoning_uses, other, updated_by, updated_at")
      .eq("listing_id", params.listingId)
      .maybeSingle();

    if (error) {
      console.error("[GET internal notes]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      notes: data || { ...EMPTY_INTERNAL_NOTES, updated_by: null, updated_at: null },
    });
  } catch (err) {
    console.error("[GET internal notes]", err);
    return NextResponse.json(
      { error: "Failed to load internal notes" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/listings/internal/[listingId]
 *
 * Body: { asking_price?, zoning_uses?, other?, listing_name? }
 * Creates the row the first time, updates it after that. Only the boxes
 * included in the body are changed.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { listingId: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();

    // Start the row with its id + who saved it
    const row: Record<string, unknown> = {
      listing_id: params.listingId,
      updated_by: auth.email,
      updated_at: new Date().toISOString(),
    };

    // Only accept the known boxes, and only as text within the size limit
    for (const field of INTERNAL_NOTE_FIELDS) {
      const value = body?.[field.key];
      if (typeof value !== "string") continue;
      if (value.length > INTERNAL_NOTE_MAX_LENGTH) {
        return NextResponse.json(
          { error: `${field.label} is too long` },
          { status: 400 }
        );
      }
      row[field.key] = value;
    }

    if (typeof body?.listing_name === "string") {
      row.listing_name = body.listing_name.slice(0, 300);
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: "listing_id" })
      .select("asking_price, zoning_uses, other, updated_by, updated_at")
      .single();

    if (error) {
      console.error("[PUT internal notes]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notes: data });
  } catch (err) {
    console.error("[PUT internal notes]", err);
    return NextResponse.json(
      { error: "Failed to save internal notes" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/listings/internal/[listingId]
 *
 * Removes the notes row — used when a listing is deleted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { listingId: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("listing_id", params.listingId);

    if (error) {
      console.error("[DELETE internal notes]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE internal notes]", err);
    return NextResponse.json(
      { error: "Failed to delete internal notes" },
      { status: 500 }
    );
  }
}
