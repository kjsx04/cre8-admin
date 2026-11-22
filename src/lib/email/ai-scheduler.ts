/**
 * The two AI calls the email scheduler makes: pick a send slot for one
 * campaign, and rebalance one week of sends.
 *
 * WHY THIS IS A LIBRARY AND NOT TWO API ROUTES
 * This logic used to live in /api/email/schedule and
 * /api/email/schedule/optimize, and scheduler.ts reached it over HTTP —
 * `fetch(`${baseUrl}/api/email/schedule`)` — from inside another route
 * handler. That was wrong three ways:
 *
 *   1. Both routes were reachable from the public internet with no auth, so
 *      anyone could spend model tokens on this account at will.
 *   2. Authenticating them would have broken the scheduler, because the
 *      server has no user token to present — which would have meant
 *      inventing an internal shared secret for a call the process was making
 *      to itself.
 *   3. It cost an extra serverless invocation (and possible cold start) per
 *      scheduled campaign, for no benefit.
 *
 * Both functions are pure in the sense that matters: input in, parsed result
 * out, no database access and no request object. The database reads that build
 * their inputs stay in scheduler.ts, where they were.
 *
 * Nothing in the browser ever called these endpoints — the optimize route's own
 * comment said "not by the browser" — so deleting them removed public surface
 * without removing a feature.
 */

import { completeText } from "@/lib/ai/client";
import { MAX_SENDS_PER_DAY } from "@/lib/email/constants";

/** One campaign as the prompt sees it. */
export type CalendarItem = {
  id: string;
  listing_name: string;
  email_label: string;
  scheduled_date: string;
  campaign_type: string;
  priority?: string;
  rank?: number | null;
  rank_total?: number;
  listing_id?: string;
  is_announcement?: boolean;
  /** Projected future occurrences hold their slot but cannot be moved. */
  projected?: boolean;
  movable?: boolean;
};

export type PickSlotInput = {
  campaign_id: string;
  email_label: string;
  campaign_type?: string;
  listing_name?: string;
  frequency?: string | null;
  /** "high" | "normal" | "custom" — the composer's Priority choice. */
  priority?: string;
  /** "top" | "fit" | "custom" — whether other campaigns may be moved. */
  placement?: string;
  /** Listing rank (1 = most important) from the Priorities list, or null. */
  rank?: number | null;
  rank_total?: number;
  /** Announcements bypass listing spacing. */
  is_announcement?: boolean;
  /** Rules block built from the Settings panel — see rulesText() in scheduler.ts. */
  rules?: string;
  /** Recurring next occurrence should land near this date. */
  target_date?: string | null;
  existing_campaigns?: CalendarItem[];
};

export type PickSlotResult = {
  new_campaign_slot: { date: string; time: string; reasoning?: string };
  calendar_changes: { id: string; new_date: string; new_time: string; reason: string }[];
};

export type OptimizeInput = {
  week_start: string;
  items: CalendarItem[];
  notes?: string | null;
  rules?: string;
};

export type OptimizeResult = {
  moves: { id: string; new_date: string; new_time: string; reason: string }[];
};

/** Phoenix "now", as the prompts need it. Arizona does not observe DST. */
function phoenixNow() {
  const mst = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" }));
  return {
    date: mst.toISOString().substring(0, 10),
    time: mst.toTimeString().substring(0, 5),
    dayOfWeek: mst.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

/**
 * The model is asked for bare JSON, but a stray sentence before the object
 * still happens. Fall back to the first {...} span before giving up.
 */
function parseJsonResponse(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Failed to parse ${what} response as JSON`);
    return JSON.parse(match[0]);
  }
}

async function askModel(systemPrompt: string, userMessage: string): Promise<string> {
  return completeText({
    tier: "flagship",
    maxTokens: 2048,
    system: systemPrompt,
    user: userMessage,
  });
}

/**
 * Pick the optimal send slot for one campaign, and say which existing sends
 * (if any) should shift to make room.
 *
 * Throws on a bad input, an API failure or an unparseable answer. The caller
 * (requestAiSlot in scheduler.ts) catches and falls back.
 */
export async function pickSlot(input: PickSlotInput): Promise<PickSlotResult> {
  const {
    campaign_id,
    email_label,
    campaign_type,
    listing_name,
    frequency,
    priority,
    placement,
    rank,
    rank_total,
    is_announcement,
    rules,
    target_date,
    existing_campaigns,
  } = input;

  if (!campaign_id || !email_label) {
    throw new Error("Missing campaign_id or email_label");
  }

  const now = phoenixNow();

  const existingList = (existing_campaigns || [])
    .map(
      (c) =>
        `- ID: ${c.id} | "${c.email_label}: ${c.listing_name}" | Scheduled: ${c.scheduled_date || "unscheduled"} | Type: ${c.campaign_type} | Rank: ${c.rank != null ? `${c.rank} of ${c.rank_total}` : c.priority === "high" ? "TOP" : "unranked"}${c.projected ? " | PROJECTED (future recurring send — occupies the slot, cannot be shifted)" : ""}`
    )
    .join("\n");

  const systemPrompt = `You are an AI email campaign scheduler for CRE8 Advisors, a commercial real estate brokerage in Phoenix, AZ.

Your job: pick the optimal send time for a new email campaign and adjust the existing calendar if needed.

RULES:
${rules || "- Business days only, Mon–Fri 7:00–17:00 Phoenix time. Max 2 sends per day, 2-hour gap, at least 24 hours out."}

Current date: ${now.date} (${now.dayOfWeek})
Current time: ${now.time} MST
All times below are Phoenix (MST) local time. Your answer must be Phoenix local time too.

EXISTING SCHEDULED CAMPAIGNS:
${existingList || "None"}

NEW CAMPAIGN TO SCHEDULE:
- ID: ${campaign_id}
- Label: ${email_label}
- Type: ${campaign_type}
- Listing: ${listing_name}
- Frequency: ${frequency || "one-time"}
- Rank: ${rank != null ? `${rank} of ${rank_total}` : priority === "high" ? "TOP (new, placed at the top of the list)" : "unranked (bottom)"}
- Announcement: ${is_announcement ? "YES — must go out at the best available slot; listing spacing does not apply to it" : "no"}
- Placement: ${
    placement === "fit"
      ? "FIT — take the best slot that is still free. Do NOT move any existing campaign; calendar_changes MUST be an empty array."
      : placement === "top"
        ? "TOP — this campaign outranks everything. Give it the best slot in the next few days; you MAY shift lower-ranked, non-projected campaigns to make room."
        : "CUSTOM RANK — schedule it where its rank deserves; you MAY shift lower-ranked, non-projected campaigns to make room, never higher-ranked ones."
  }
${target_date ? `- TARGET DATE: this is the next occurrence of a recurring campaign. Schedule it in the same week as ${target_date} (same weekday/time as the previous send when possible). If that date is already in the past, pick the next valid business-hours slot at least 24 hours from now.` : ""}

Return ONLY valid JSON (no markdown, no preamble):
{
  "new_campaign_slot": {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "reasoning": "Brief explanation of why this slot was chosen"
  },
  "calendar_changes": [
    {
      "id": "campaign_uuid_that_was_shifted",
      "new_date": "YYYY-MM-DD",
      "new_time": "HH:MM",
      "reason": "Why this campaign was shifted"
    }
  ]
}

If no calendar changes are needed, return an empty array for calendar_changes.`;

  const text = await askModel(
    systemPrompt,
    `Schedule this campaign: "${email_label}: ${listing_name}" (${campaign_type}, frequency: ${frequency || "one-time"})`
  );

  const result = parseJsonResponse(text, "scheduling") as PickSlotResult;

  if (!result.new_campaign_slot?.date || !result.new_campaign_slot?.time) {
    throw new Error("AI response missing date or time");
  }

  return {
    new_campaign_slot: result.new_campaign_slot,
    calendar_changes: Array.isArray(result.calendar_changes) ? result.calendar_changes : [],
  };
}

/**
 * Rebalance one week of scheduled sends with as few moves as possible.
 *
 * Returns only the sends it decided to move. An empty list means the week
 * already satisfies the rules. Malformed moves (bad date or time format) are
 * dropped here rather than being handed to the caller.
 */
export async function optimizeSlots(input: OptimizeInput): Promise<OptimizeResult> {
  const { week_start, items, notes, rules } = input;

  if (!week_start || !Array.isArray(items)) {
    throw new Error("Missing week_start or items");
  }
  if (items.length === 0) return { moves: [] };

  const now = phoenixNow();

  const list = items
    .map(
      (c) =>
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

Current date: ${now.date}
Current time: ${now.time} MST
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

  const text = await askModel(systemPrompt, "Rebalance this week.");
  const result = parseJsonResponse(text, "optimizer") as { moves?: unknown };

  const moves = Array.isArray(result.moves)
    ? (result.moves as { id?: string; new_date?: string; new_time?: string; reason?: string }[])
        .filter(
          (mv) =>
            mv &&
            mv.id &&
            /^\d{4}-\d{2}-\d{2}$/.test(mv.new_date || "") &&
            /^\d{2}:\d{2}$/.test(mv.new_time || "")
        )
        .map((mv) => ({
          id: mv.id as string,
          new_date: mv.new_date as string,
          new_time: mv.new_time as string,
          reason: mv.reason || "",
        }))
    : [];

  return { moves };
}
