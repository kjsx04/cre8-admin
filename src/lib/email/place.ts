/**
 * Placement — turning a saved draft into a scheduled send.
 *
 * The composer stops at "make the email". Placing it happens on the calendar,
 * where you choose a frequency and one of four priorities:
 *
 *   Top    → this listing goes to #1; the AI may move other sends to give it the best slot
 *   Fit    → the AI takes the best slot that's still free and moves nothing
 *   Custom → the listing goes to an exact rank; the AI rebalances around it
 *   Test   → you pick the exact date and time. No AI, no rules. Temporary.
 *
 * Only pure helpers live here so they can be tested without hitting Supabase or
 * Resend. The route in api/email/campaigns/[id]/place does the I/O.
 */

/** Phoenix never observes DST, so its offset is always -07:00. */
export const PHOENIX_OFFSET = "-07:00";

export type PlacementMode = "high" | "normal" | "custom" | "test";

/** What the calendar sends when you place a campaign */
export interface PlacementRequest {
  campaign_type?: "one-time" | "recurring";
  frequency?: string | null;
  end_date?: string | null;
  pinned?: boolean;
  priority?: string;
  priority_rank?: number | null;
  /** Test only: "YYYY-MM-DD" */
  send_date?: string;
  /** Test only: "HH:MM" (24h) */
  send_time?: string;
}

/** One campaign's slot before we touched it — the undo snapshot */
export interface SlotSnapshot {
  id: string;
  scheduled_date: string | null;
  next_send_date: string | null;
  status: string;
  provider_send_id: string | null;
}

/** A send the AI moved to make room */
export interface PlacementMove {
  id: string;
  from: string | null;
  to: string | null;
}

/** True when this placement skips the AI and every scheduling rule. */
export function isTestMode(priority: unknown): boolean {
  return priority === "test";
}

/**
 * Build the exact send instant from the Test date + time pickers.
 * Returns null when either half is missing or not a real date.
 *   ("2026-09-23", "11:05") → "2026-09-23T11:05:00-07:00"
 */
export function testSendIso(date?: string | null, time?: string | null): string | null {
  if (!date || !time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const iso = `${date}T${time}:00${PHOENIX_OFFSET}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/**
 * Why this placement can't go ahead, or null when it's good.
 * Test is deliberately permissive: any date and time is allowed, including a
 * few minutes from now, weekends and the middle of the night. That is the whole
 * point of Test — it exists to verify a real send end to end.
 */
export function placementProblem(body: PlacementRequest): string | null {
  if (isTestMode(body.priority)) {
    return testSendIso(body.send_date, body.send_time)
      ? null
      : "Pick a date and a time for the test send.";
  }

  if (body.campaign_type === "recurring" && !body.frequency) {
    return "Pick how often this should repeat.";
  }

  if (body.priority === "custom") {
    const rank = Number(body.priority_rank);
    if (!Number.isFinite(rank) || rank < 1) return "Enter a priority number of 1 or more.";
  }

  return null;
}

/** Compare before/after slots into the list the calendar animates. */
export function diffSlots(
  before: SlotSnapshot[],
  after: { id: string; scheduled_date: string | null }[],
  placedId: string
): PlacementMove[] {
  const wasAt = new Map(before.map((b) => [b.id, b.scheduled_date]));
  const moves: PlacementMove[] = [];
  for (const row of after) {
    if (row.id === placedId) continue; // the placed email is highlighted separately
    const from = wasAt.get(row.id);
    if (from === undefined) continue; // wasn't on the schedule before
    if (from !== row.scheduled_date) moves.push({ id: row.id, from: from ?? null, to: row.scheduled_date });
  }
  return moves;
}
