/**
 * Unit tests for audience count cache / refresh / pagination helpers.
 * Run: npx tsx src/lib/email/audience-count.test.ts
 */

import {
  isAudienceZero,
  isPreferredAudienceName,
  nextContactPageCursor,
  pickCountOnError,
  retryAfterMs,
  shouldCacheAudienceCounts,
  shouldSoftRefreshAudience,
  sortAudienceSegments,
} from "./audience-count";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const brokers0 = { id: "1680dbe6-0635-4c38-8d7d-7f37b08a1cb4", name: "Brokers", total: 0, subscribed: 0, unsubscribed: 0 };
const brokers760 = { ...brokers0, total: 760, subscribed: 760 };
const buyers = { id: "5c3d642d-439f-4ce2-874c-aac68f6d9b36", name: "Buyers", total: 2616, subscribed: 2616, unsubscribed: 0 };
const sellers = { id: "f7fd87ec-304d-4a40-b2f7-e38628653e9f", name: "Sellers", total: 2437, subscribed: 2437, unsubscribed: 0 };

assert(isPreferredAudienceName("Brokers") && isPreferredAudienceName("test"), "Brokers / Test are preferred");
assert(isAudienceZero(brokers0) && !isAudienceZero(brokers760), "zero vs live");

const sorted = sortAudienceSegments([{ name: "Sellers" }, { name: "Zeta" }, { name: "Brokers" }, { name: "Buyers" }]);
assert(
  sorted.map((s) => s.name).join(",") === "Brokers,Buyers,Sellers,Zeta",
  "preferred order then alpha"
);

assert(
  pickCountOnError(brokers0, brokers760).subscribed === 760,
  "failed recount keeps the last live Brokers count"
);
assert(pickCountOnError(brokers0, brokers0).subscribed === 0, "no previous live count stays 0");

assert(
  shouldCacheAudienceCounts([brokers760, buyers, sellers], { anyFailed: false }) === true,
  "cache a complete live read"
);
assert(
  shouldCacheAudienceCounts([brokers0, buyers, sellers], { anyFailed: true }) === false,
  "do not cache Brokers=0 from a failed count"
);
assert(
  shouldCacheAudienceCounts([brokers0, { ...buyers, total: 0, subscribed: 0 }, { ...sellers, total: 0, subscribed: 0 }], {
    anyFailed: false,
  }) === false,
  "do not cache an all-zero read"
);

assert(shouldSoftRefreshAudience([brokers0, buyers, sellers]) === true, "soft-refresh mixed Brokers=0");
assert(shouldSoftRefreshAudience([brokers760, buyers, sellers]) === false, "no refresh when all preferred are live");
assert(
  shouldSoftRefreshAudience([
    { ...brokers0 },
    { ...buyers, total: 0, subscribed: 0 },
    { ...sellers, total: 0, subscribed: 0 },
  ]) === true,
  "soft-refresh all-zero"
);

const page = [{ id: "a" }, { id: "b" }];
assert(
  nextContactPageCursor({ rows: page, hasMore: true, after: null, added: 2 }) === "b",
  "full page advances after last id"
);
assert(
  nextContactPageCursor({ rows: page, hasMore: false, after: null, added: 2 }) === null,
  "has_more false stops"
);
assert(
  nextContactPageCursor({ rows: [], hasMore: true, after: null, added: 0 }) === null,
  "empty page stops even if has_more"
);
assert(
  nextContactPageCursor({ rows: page, hasMore: true, after: "b", added: 0 }) === null,
  "duplicate page (added=0) stops"
);

assert(retryAfterMs(0, "2") === 2000, "Retry-After seconds");
assert(retryAfterMs(0) === 400, "first backoff without header");
assert(retryAfterMs(3) === 3200, "exponential backoff");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall audience-count tests passed");
