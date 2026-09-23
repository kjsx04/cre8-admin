/**
 * Run: npx tsx src/lib/email/place.test.ts
 *
 * Placement is how a saved draft gets onto the calendar. Test mode is the one
 * that has to be permissive: it exists so a real send can be verified end to end,
 * so it deliberately ignores windows, caps, spacing and end dates.
 */

import { testSendIso, placementProblem, isTestMode, diffSlots, PHOENIX_OFFSET } from "./place";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

// ── Test send time ──
assert(PHOENIX_OFFSET === "-07:00", "Phoenix is always -07:00 (no DST)");
assert(testSendIso("2026-09-23", "11:05") === "2026-09-23T11:05:00-07:00", "date + time become a Phoenix instant");
assert(testSendIso("2026-09-23", "") === null, "missing time is rejected");
assert(testSendIso("", "11:05") === null, "missing date is rejected");
assert(testSendIso("23-09-2026", "11:05") === null, "wrong date format is rejected");
assert(testSendIso("2026-09-23", "1105") === null, "wrong time format is rejected");

// A weekend, middle of the night slot is fine — that's the point of Test
assert(testSendIso("2026-09-26", "23:45") === "2026-09-26T23:45:00-07:00", "Test allows nights and weekends");

// ── Mode ──
assert(isTestMode("test"), "test priority is test mode");
assert(!isTestMode("high") && !isTestMode("normal") && !isTestMode("custom"), "the AI priorities are not test mode");

// ── Validation ──
assert(placementProblem({ priority: "test", send_date: "2026-09-23", send_time: "11:05" }) === null, "a complete test send is valid");
assert(placementProblem({ priority: "test" }) !== null, "a test send with no date/time is rejected");

assert(placementProblem({ priority: "normal", campaign_type: "one-time" }) === null, "Fit one-time is valid");
assert(placementProblem({ priority: "high", campaign_type: "one-time" }) === null, "Top one-time is valid");
assert(placementProblem({ priority: "normal", campaign_type: "recurring" }) !== null, "recurring needs a frequency");
assert(placementProblem({ priority: "normal", campaign_type: "recurring", frequency: "weekly" }) === null, "recurring with a frequency is valid");

assert(placementProblem({ priority: "custom", campaign_type: "one-time" }) !== null, "Custom needs a number");
assert(placementProblem({ priority: "custom", campaign_type: "one-time", priority_rank: 0 }) !== null, "Custom rank must be 1 or more");
assert(placementProblem({ priority: "custom", campaign_type: "one-time", priority_rank: 3 }) === null, "Custom with a rank is valid");

// Test ignores an end date that would block a normal placement
assert(
  placementProblem({ priority: "test", send_date: "2026-09-23", send_time: "11:05", end_date: "2020-01-01" }) === null,
  "Test ignores a past end date"
);

// ── Moves the calendar animates ──
const before = [
  { id: "a", scheduled_date: "2026-09-29T16:00:00Z", next_send_date: null, status: "active", provider_send_id: null },
  { id: "b", scheduled_date: "2026-09-30T16:00:00Z", next_send_date: null, status: "scheduled", provider_send_id: null },
  { id: "me", scheduled_date: null, next_send_date: null, status: "draft", provider_send_id: null },
];
const after = [
  { id: "a", scheduled_date: "2026-10-01T16:00:00Z" }, // pushed
  { id: "b", scheduled_date: "2026-09-30T16:00:00Z" }, // untouched
  { id: "me", scheduled_date: "2026-09-29T16:00:00Z" }, // the one we placed
  { id: "new", scheduled_date: "2026-10-02T16:00:00Z" }, // wasn't there before
];
const moves = diffSlots(before, after, "me");
assert(moves.length === 1, "only genuinely moved campaigns are reported");
assert(moves[0].id === "a", "the pushed campaign is the one reported");
assert(moves[0].from === "2026-09-29T16:00:00Z" && moves[0].to === "2026-10-01T16:00:00Z", "from and to are carried through");
assert(!moves.some((m) => m.id === "me"), "the placed campaign is not listed as a move");
assert(!moves.some((m) => m.id === "new"), "a campaign that wasn't scheduled before is not a move");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall place tests passed");
