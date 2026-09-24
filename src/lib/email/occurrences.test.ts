/**
 * Run: npx tsx src/lib/email/occurrences.test.ts
 *
 * On 2026-09-24 a 9:00 AM send was cancelled by a failed provider sync. The
 * calendar went on showing it as scheduled for over an hour, because the only
 * states it could express were "queued", "projected" and "sent". These cover the
 * fourth one: its time came and went and nothing was sent.
 */

import { expandOccurrences } from "./occurrences";
import type { Campaign } from "./types";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const NOW = new Date("2026-09-24T17:08:00Z"); // 10:08 AM Phoenix, the moment it was noticed
const FROM = new Date("2026-09-20T00:00:00Z");
const TO = new Date("2026-10-05T00:00:00Z");

function campaign(over: Partial<Campaign>): Campaign {
  return {
    id: "c1",
    listing_name: "Marketplace at Blossom Rock",
    campaign_type: "recurring",
    frequency: "weekly",
    status: "active",
    scheduled_date: "2026-09-24T16:00:00Z", // 9:00 AM Phoenix
    next_send_date: "2026-09-24T16:00:00Z",
    last_sent_at: null,
    provider_send_id: null,
    end_date: null,
    priority: "normal",
    ...over,
  } as unknown as Campaign;
}

const stateAt = (c: Campaign) => {
  const items = expandOccurrences([c], FROM, TO, NOW);
  return items.find((i) => i.date.toISOString().startsWith("2026-09-24T16:00"))?.state;
};

// ── The real failure ──
assert(stateAt(campaign({})) === "missed", "a past slot with nothing queued and nothing sent is missed");
assert(
  stateAt(campaign({ provider_send_id: "01a0cf6e-aaa,01a0cf6e-bbb" })) === "missed",
  "still missed even if a provider id is on file — the time passed and nothing sent"
);

// ── Sent ──
assert(
  stateAt(campaign({ last_sent_at: "2026-09-24T16:00:04Z" })) === "sent",
  "a slot with a matching last_sent_at is sent"
);
assert(
  stateAt(campaign({ last_sent_at: "2026-09-24T16:58:00Z" })) === "sent",
  "a send an hour late still counts as that slot"
);
assert(
  stateAt(campaign({ last_sent_at: "2026-09-17T16:00:00Z" })) === "missed",
  "last week's send does not make this week's slot look sent"
);

// ── Future slots are untouched ──
const future = campaign({ scheduled_date: "2026-09-25T16:00:00Z", next_send_date: "2026-09-25T16:00:00Z" });
assert(
  expandOccurrences([future], FROM, TO, NOW).find((i) => i.dateKey === "2026-09-25")?.state === "projected",
  "a future slot with no provider id is projected, not missed"
);
const futureQueued = campaign({
  scheduled_date: "2026-09-25T16:00:00Z",
  next_send_date: "2026-09-25T16:00:00Z",
  provider_send_id: "abc",
});
assert(
  expandOccurrences([futureQueued], FROM, TO, NOW).find((i) => i.dateKey === "2026-09-25")?.state === "confirmed",
  "a future slot that is queued at Resend is confirmed"
);

// ── Grace window: a send a few minutes late is not yet a failure ──
const justNow = campaign({
  scheduled_date: "2026-09-24T17:00:00Z",
  next_send_date: "2026-09-24T17:00:00Z",
  provider_send_id: "abc",
});
assert(
  expandOccurrences([justNow], FROM, TO, NOW).find((i) => i.date.toISOString().startsWith("2026-09-24T17:00"))
    ?.state === "confirmed",
  "8 minutes late is inside the grace window, still confirmed"
);

// ── Completed campaigns read as sent, never missed ──
const done = campaign({ status: "completed", campaign_type: "one-time", frequency: "one-time" });
assert(stateAt(done) === "sent", "a completed campaign's slot is sent");

// ── Paused and draft stay off the calendar entirely ──
for (const status of ["draft", "paused", "cancelled"] as const) {
  assert(expandOccurrences([campaign({ status })], FROM, TO, NOW).length === 0, `${status} campaigns are not on the calendar`);
}

// ── A missed slot must not stop future recurrences projecting ──
const items = expandOccurrences([campaign({})], FROM, TO, NOW);
assert(items.length > 1, "a missed slot still projects the following weeks");
assert(items.filter((i) => i.state === "missed").length === 1, "only the slot that passed is missed");
assert(
  items.filter((i) => i.dateKey === "2026-10-01").every((i) => i.state === "projected"),
  "next week's occurrence is projected"
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall occurrences tests passed");
