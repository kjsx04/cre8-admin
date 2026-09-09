import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_SENDS_PER_DAY } from "@/lib/email/constants";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/email/schedule/optimize — AI rebalances one week.
 *
 * Body: { week_start: "YYYY-MM-DD", items: [{ id, listing_name, email_label, scheduled_date,
 *         campaign_type, priority, movable }] }
 * Returns: { moves: [{ id, new_date, new_time, reason }] } — only for items it decided to move.
 *
 * Internal: called by optimizeWeek() in src/lib/email/scheduler.ts, not by the browser.
 */
export async function POST(request: NextRequest) {
  try {
    const { week_start, items, notes, rules } = await request.json();
    if (!week_start || !Array.isArray(items)) {
      return NextResponse.json({ error: "Missing week_start or items" }, { status: 400 });
    }
    if (items.length === 0) return NextResponse.json({ moves: [] });

    const now = new Date();
    const mstNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Phoenix" }));
    const currentDate = mstNow.toISOString().substring(0, 10);
    const currentTime = mstNow.toTimeString().substring(0, 5);

    const list = items
      .map(
        (c: { id: string; listing_name: string; email_label: string; scheduled_date: string; campaign_type: string; priority?: string; rank?: number | null; rank_total?: number; listing_id?: string; is_announcement?: boolean; movable: boolean }) =>
          `- ID: ${c.id} | "${c.email_label}: ${c.listing_name}" | Listing: ${c.listing_id || "?"} | Scheduled: ${c.scheduled_date} | Type: ${c.campaign_type}${c.is_announcement ? " | ANNOUNCEMENT" : ""} | Rank: ${c.rank != null ? `${c.rank} of ${c.rank_total}` : c.priority === "high" ? "TOP" : "unranked"} | ${c.movable ? "MOVABLE" : "FIXED (projected future send — occupies the slot, cannot move)"}`
      )
      .join("\n");

    const systemPrompt = `You are an AI email campaign scheduler for CRE8 Advisors, a commercial real estate brokerage in Phoenix, AZ.

Your job: look at ONE WEEK of scheduled sends and rebalance it so it satisfies the rules with as few moves as possible.

RULES:
${rules || `- Business days only. Max ${MAX_SENDS_PER_DAY} sends per day, 2-hour gap.`}
- Only move items marked MOVABLE. FIXED items still count toward the per-day cap.
- Never move anything into the past. Keep every send inside the same week (${week_start} Mon → the following Sun) unless the week is over capacity, in which case push the lowest-ranked non-announcement sends to the next week (Mon-Fri).
- Two sends at the same time, or closer than the minimum gap, on the same day is ALWAYS a violation — fix every one.
- Minimize the number of moves, but a week with any violation left is a failure. If the week already satisfies the rules, return an empty list.

Current date: ${currentDate}
Current time: ${currentTime} MST
All times below are Phoenix (MST) local time; answer in Phoenix local time.
Week starting: ${week_start}

SENDS THIS WEEK:
${list}
${notes ? `
YOUR PREVIOUS ANSWER LEFT THESE VIOLATIONS — fix all of them this time:
${notes}
` : ""}
Return ONLY valid JSON (no markdown, no preamble):
{
  "moves": [
    { "id": "campaign_uuid", "new_date": "YYYY-MM-DD", "new_time": "HH:MM", "reason": "one short sentence" }
  ]
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: "Rebalance this week." }],
    });

    const text = message.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("No text response from Claude");

    let result: { moves?: unknown };
    try {
      result = JSON.parse(text.text);
    } catch {
      const m = text.text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Failed to parse optimizer response");
      result = JSON.parse(m[0]);
    }

    const moves = Array.isArray(result.moves)
      ? (result.moves as { id?: string; new_date?: string; new_time?: string; reason?: string }[]).filter(
          (mv) => mv && mv.id && /^\d{4}-\d{2}-\d{2}$/.test(mv.new_date || "") && /^\d{2}:\d{2}$/.test(mv.new_time || "")
        )
      : [];

    return NextResponse.json({ moves });
  } catch (error) {
    console.error("[Optimize] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Optimize failed" }, { status: 500 });
  }
}
