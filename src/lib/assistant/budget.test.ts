/**
 * Run: npx tsx src/lib/assistant/budget.test.ts   (or `npm test budget`)
 *
 * Cost math, the Arizona month and day, the cap, the rate limit and the
 * staff-email check. No network, no database.
 */

import {
  BUDGET_PAUSED_MESSAGE,
  DEFAULT_MONTHLY_BUDGET_USD,
  checkBudget,
  checkRate,
  estimateCostUsd,
  isStaffEmail,
  parseBudgetUsd,
  phoenixDayStart,
  phoenixMonthStart,
} from "./budget";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ── Cost ────────────────────────────────────────────────────

// 100k fresh input at $1.25 per 1M + 100k output at $2.50 per 1M.
assert(
  close(estimateCostUsd("grok-4.3", { inputTokens: 100_000, cachedTokens: 0, outputTokens: 100_000, reasoningTokens: 0 }), 0.375),
  "grok-4.3: 100k in + 100k out = $0.375",
);
// Cached tokens are billed at the cached rate, not on top of the fresh rate.
assert(
  close(estimateCostUsd("grok-4.3", { inputTokens: 100_000, cachedTokens: 100_000, outputTokens: 0, reasoningTokens: 0 }), 0.02),
  "grok-4.3: fully cached prompt costs the cached rate only",
);
// Reasoning tokens count as output.
assert(
  close(estimateCostUsd("grok-4.3", { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 100_000 }), 0.25),
  "reasoning tokens are billed as output",
);
// A prompt of 200k or more uses the long-context rates.
assert(
  close(estimateCostUsd("grok-4.3", { inputTokens: 200_000, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }), 0.5),
  "a 200k prompt uses the long-context input rate",
);
// More cached than input cannot go negative.
assert(
  estimateCostUsd("grok-4.3", { inputTokens: 100, cachedTokens: 5000, outputTokens: 0, reasoningTokens: 0 }) >= 0,
  "cached tokens above the prompt size never make the cost negative",
);
// An unknown model is priced at the highest known rate, not at zero.
assert(
  estimateCostUsd("grok-unknown", { inputTokens: 100_000, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }) >=
    estimateCostUsd("grok-4.3", { inputTokens: 100_000, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
  "an unknown model is never priced below grok-4.3",
);
// A typical lookup is a fraction of a cent.
const lookup = estimateCostUsd("grok-4.3", { inputTokens: 5000, cachedTokens: 3000, outputTokens: 400, reasoningTokens: 0 });
assert(lookup > 0 && lookup < 0.01, `a typical lookup costs under a cent ($${lookup})`);

// ── Arizona month and day (UTC-7 all year) ───────────────────

assert(
  phoenixMonthStart(new Date("2026-11-24T18:00:00Z")).toISOString() === "2026-11-01T07:00:00.000Z",
  "month start is midnight on the 1st, Arizona time",
);
// 03:00 UTC on Dec 1 is still 8 pm on Nov 30 in Arizona, so it is still November.
assert(
  phoenixMonthStart(new Date("2026-12-01T03:00:00Z")).toISOString() === "2026-11-01T07:00:00.000Z",
  "just after midnight UTC on the 1st is still the previous Arizona month",
);
assert(
  phoenixMonthStart(new Date("2026-12-01T07:00:00Z")).toISOString() === "2026-12-01T07:00:00.000Z",
  "the new month starts at 07:00 UTC on the 1st",
);
assert(
  phoenixDayStart(new Date("2026-11-24T05:00:00Z")).toISOString() === "2026-11-23T07:00:00.000Z",
  "5 am UTC is still the previous Arizona day",
);

// ── Cap ─────────────────────────────────────────────────────

assert(parseBudgetUsd(undefined) === DEFAULT_MONTHLY_BUDGET_USD, "no env value falls back to $50");
assert(parseBudgetUsd("75") === 75, "env value of 75 is used");
assert(parseBudgetUsd("abc") === DEFAULT_MONTHLY_BUDGET_USD, "a non-number falls back to $50");
assert(parseBudgetUsd("0") === DEFAULT_MONTHLY_BUDGET_USD, "zero falls back to $50 (it would block everyone)");
assert(parseBudgetUsd("-5") === DEFAULT_MONTHLY_BUDGET_USD, "a negative number falls back to $50");

assert(checkBudget(10, 50).allowed, "under the cap is allowed");
assert(checkBudget(49.99, 50, 0.02).allowed === false, "a call that would cross the cap is refused");
assert(checkBudget(50, 50).allowed === true, "exactly at the cap with a zero-cost estimate is not yet over");
assert(checkBudget(50.01, 50).allowed === false, "over the cap is refused");
assert(checkBudget(60, 50).message === BUDGET_PAUSED_MESSAGE, "a refusal carries the friendly message");
assert(checkBudget(60, 50).remainingUsd === 0, "remaining never goes below zero");

// ── Rate limit ──────────────────────────────────────────────

assert(checkRate(0, 0).allowed, "a new user is allowed");
assert(checkRate(19, 30).allowed, "19 in the window is allowed");
assert(checkRate(20, 30).allowed === false, "20 in the window is refused");
assert(checkRate(5, 80).allowed === false, "80 in a day is refused");
assert(checkRate(5, 79).allowed, "79 in a day is allowed");

// ── Staff email ─────────────────────────────────────────────

assert(isStaffEmail("kevin@cre8advisors.com"), "a company address passes");
assert(isStaffEmail("  Kevin@CRE8Advisors.com "), "case and spaces do not matter");
assert(!isStaffEmail("kevin@gmail.com"), "a personal address is refused");
assert(!isStaffEmail("kevin@cre8advisors.com.evil.io"), "a lookalike domain is refused");
assert(!isStaffEmail("evil@notcre8advisors.com"), "a domain that merely ends the same is refused");
assert(!isStaffEmail("3f9a1c2e-0000-4000-8000-123456789abc"), "a bare object id (no email) is refused");
assert(!isStaffEmail(""), "empty is refused");
assert(!isStaffEmail(null), "null is refused");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
