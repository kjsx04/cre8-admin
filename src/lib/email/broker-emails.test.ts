/**
 * Run: npx tsx src/lib/email/broker-emails.test.ts
 */

import { EMAIL_SENDERS } from "./constants";
import { isCre8BrokerEmail, parseTestRecipients, resolveCre8BrokerEmails } from "./broker-emails";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

assert(EMAIL_SENDERS.length >= 5, "roster has CRE8 brokers");
assert(EMAIL_SENDERS.every((s) => isCre8BrokerEmail(s.email)), "every roster email is accepted");
assert(isCre8BrokerEmail("KEVIN@CRE8ADVISORS.COM"), "broker match is case-insensitive");
assert(!isCre8BrokerEmail("outsider@example.com"), "non-roster address is rejected");
assert(!isCre8BrokerEmail(""), "empty is rejected");

assert(
  JSON.stringify(parseTestRecipients(["Kevin@cre8advisors.com", " Kevin@cre8advisors.com "])) ===
    JSON.stringify(["Kevin@cre8advisors.com"]),
  "duplicate recipients collapse"
);
assert(parseTestRecipients("Andy@CRE8Advisors.com").length === 1, "single string is accepted");
assert(parseTestRecipients(null).length === 0, "null yields no recipients");

const resolved = resolveCre8BrokerEmails(["Kevin@cre8advisors.com", "not-a-broker@cre8advisors.com"]);
assert(resolved.emails.length === 1 && resolved.invalid.length === 1, "splits roster vs outsiders");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
