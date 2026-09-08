import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { getRanks, setRanks, pruneRanks } from "@/lib/email/priorities";
import { optimizeWeek, currentWeekStart } from "@/lib/email/scheduler";
import { addDays } from "@/lib/email/schedule-dates";

/**
 * GET  /api/email/priorities — the ranked list of listings that have campaigns on the schedule.
 * PUT  /api/email/priorities — replace the order. Body: { order: [{ listing_id, listing_name }], optimize?: boolean }
 *      With optimize: true the AI rebalances this week and next using the new ranks.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  // Listings with something on the schedule (drives what the panel shows)
  const { data: rows } = await supabase
    .from("email_campaigns")
    .select("listing_id, listing_name, photo_url")
    .in("status", ["scheduled", "active"]);

  const active = new Map<string, { listing_id: string; listing_name: string; photo_url: string | null }>();
  for (const r of rows || []) {
    if (!active.has(r.listing_id)) active.set(r.listing_id, r);
  }

  const ranks = await getRanks();
  const rankOf = new Map(ranks.map((r) => [r.listing_id, r.rank]));

  // Ranked first (by rank), then unranked (by name) — the panel can show "—" for those
  const list = Array.from(active.values())
    .map((l) => ({ ...l, rank: rankOf.get(l.listing_id) ?? null }))
    .sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return (a.listing_name || "").localeCompare(b.listing_name || "");
    });

  return NextResponse.json({ listings: list });
}

export async function PUT(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const order = Array.isArray(body.order) ? body.order : null;
  if (!order) return NextResponse.json({ error: "order[] is required" }, { status: 400 });

  try {
    const ranks = await setRanks(
      order
        .filter((o: { listing_id?: string }) => o && typeof o.listing_id === "string")
        .map((o: { listing_id: string; listing_name?: string }) => ({ listing_id: o.listing_id, listing_name: o.listing_name ?? null }))
    );

    // Keep the table tidy: only listings still on the schedule
    const { data: rows } = await supabase
      .from("email_campaigns")
      .select("listing_id")
      .in("status", ["scheduled", "active"]);
    await pruneRanks(new Set((rows || []).map((r) => r.listing_id)));

    let rebalance: unknown[] = [];
    if (body.optimize) {
      const baseUrl = new URL(request.url).origin;
      const thisWeek = currentWeekStart();
      rebalance = [await optimizeWeek(baseUrl, thisWeek), await optimizeWeek(baseUrl, addDays(thisWeek, 7))];
    }

    return NextResponse.json({ ranks, rebalance });
  } catch (err) {
    console.error("[priorities] PUT failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save priorities" }, { status: 500 });
  }
}
