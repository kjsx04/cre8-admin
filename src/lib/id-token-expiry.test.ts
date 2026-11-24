/**
 * Run: npx tsx src/lib/id-token-expiry.test.ts   (or `npm test id-token`)
 */

import { REFRESH_MARGIN_SECONDS, idTokenNeedsRefresh } from "./id-token-expiry";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const now = 1_000_000;
assert(!idTokenNeedsRefresh(now + 3600, now), "a token with an hour left is used as is");
assert(idTokenNeedsRefresh(now - 10, now), "an expired token is renewed (the 'API 401' case)");
assert(idTokenNeedsRefresh(now + REFRESH_MARGIN_SECONDS - 1, now), "a token about to expire is renewed before it is sent");
assert(!idTokenNeedsRefresh(now + REFRESH_MARGIN_SECONDS + 60, now), "a token comfortably inside its life is not renewed");
assert(idTokenNeedsRefresh(undefined, now) && idTokenNeedsRefresh(Number.NaN, now), "a token with no readable expiry is renewed");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
