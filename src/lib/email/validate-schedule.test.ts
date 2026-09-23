/**
 * Run: npx tsx src/lib/email/validate-schedule.test.ts
 *
 * Covers the trap that cancelled the Meridian & Pecos campaign on 2026-09-23:
 * an end date at or before the first send.
 */

import { endDateProblem } from "./validate-schedule";
import { lookalikeDomain, lookalikeWarning } from "./lookalike-domain";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const now = new Date("2026-09-22T22:31:00Z"); // 3:31 PM Phoenix, when the campaign was made

// ── End date ──
assert(endDateProblem(null, null, now) === null, "no end date is always fine");
assert(endDateProblem("", null, now) === null, "empty end date is fine");
assert(endDateProblem("2026-12-31", null, now) === null, "a future end date is fine");

// The real case: created Sep 22, ends Sep 22, first send Sep 23 09:00
const realCase = endDateProblem("2026-09-22", "2026-09-23T16:00:00Z", now);
assert(realCase !== null, "end date before the first send is rejected");
assert(/after the end date/.test(realCase || ""), "the message explains the first send lands too late");

assert(endDateProblem("2026-09-01", null, now) !== null, "an end date already in the past is rejected");
assert(/in the past/.test(endDateProblem("2026-09-01", null, now) || ""), "past end date says so");

// Same-day sends still allowed — "ends Sep 30" means end OF Sep 30
assert(endDateProblem("2026-09-30", "2026-09-30T16:00:00Z", now) === null, "a send on the end date itself is allowed");
assert(endDateProblem("2026-09-30", "2026-10-01T16:00:00Z", now) !== null, "a send the day after the end date is rejected");

assert(endDateProblem("not-a-date", null, now) !== null, "garbage date is rejected");

// ── Lookalike domains ──
assert(lookalikeDomain("kevin@cre8adivsors.com") === "cre8advisors.com", "the real typo is caught");
assert(lookalikeDomain("kevin@cre8advisors.com") === null, "the correct domain is not flagged");
assert(lookalikeDomain("kevin@cre8advisor.com") === "cre8advisors.com", "missing letter is caught");
assert(lookalikeDomain("someone@gmail.com") === null, "unrelated domains are not flagged");
assert(lookalikeDomain("someone@cbre.com") === null, "other brokerages are not flagged");
assert(lookalikeDomain("no-at-sign") === null, "a non-address is not flagged");
assert((lookalikeWarning("kevin@cre8adivsors.com") || "").includes("cre8advisors.com"), "warning names the intended domain");
assert(lookalikeWarning("kevin@cre8advisors.com") === null, "no warning for a good address");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall validate-schedule tests passed");
