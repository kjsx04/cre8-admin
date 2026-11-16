import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { API_BASE } from "@/lib/admin-constants";
import { syncListingsMirror } from "@/lib/listings/webflow-mirror";

// Copying a new listing's photos and PDF takes a few seconds each.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/listings/mirror — Vercel Cron handler (hourly, see vercel.json)
 *
 * Keeps the Supabase `listings` table an exact, current copy of the Webflow
 * CMS: fields, photos and PDFs. It READS Webflow and WRITES Supabase, nothing
 * else — it is not part of saving or publishing a listing, so the admin's
 * listing flow behaves exactly as before whether this runs or not.
 *
 * Most hours nothing has changed and this finishes in about a second.
 */
export async function GET(request: NextRequest) {
  // Same rule as the email cron: Vercel sends this header when CRON_SECRET is
  // set. Fail closed — no secret configured means nobody can trigger it.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "SUPABASE_URL not configured" }, { status: 500 });
  }

  try {
    const result = await syncListingsMirror({
      supabase,
      supabaseUrl,
      workerBase: API_BASE,
      // A normal hour has 0-2 changed listings. The cap only matters after a
      // bulk edit; whatever is left over is picked up on the next run.
      maxListings: 15,
    });
    if (result.warnings.length) console.warn("[listings mirror]", result.warnings);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[listings mirror] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mirror failed" },
      { status: 500 }
    );
  }
}
