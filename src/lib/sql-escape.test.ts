/**
 * Tests for escapeLikePattern.
 *
 * Run: npx tsx src/lib/sql-escape.test.ts   (or `npm test sql-escape`)
 *
 * Same shape as every other test file here: plain assertions, exit code says
 * pass or fail.
 */

import { escapeLikePattern } from "./sql-escape";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("ok ", msg);
  } else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

// A normal email is unchanged — the common path must not break broker lookup.
assert(
  escapeLikePattern("kevin@cre8advisors.com") === "kevin@cre8advisors.com",
  "an ordinary email passes through untouched"
);
assert(
  escapeLikePattern("Andy@CRE8Advisors.com") === "Andy@CRE8Advisors.com",
  "mixed-case email is untouched (casing is handled by ilike, not here)"
);

// The actual exploit: a bare % matched every broker.
assert(escapeLikePattern("%") === "\\%", "a bare % is escaped");
assert(
  escapeLikePattern("%@cre8advisors.com") === "\\%@cre8advisors.com",
  "a leading wildcard is escaped"
);
assert(escapeLikePattern("a%b") === "a\\%b", "an embedded % is escaped");

// Underscore matches any single character, so it needs escaping too.
assert(escapeLikePattern("first_last@x.com") === "first\\_last@x.com", "_ is escaped");
assert(escapeLikePattern("___") === "\\_\\_\\_", "every _ is escaped");

// The backslash has to be doubled first, or it would escape our own escapes.
assert(escapeLikePattern("a\\b") === "a\\\\b", "a backslash is doubled");
assert(
  escapeLikePattern("\\%") === "\\\\\\%",
  "a backslash followed by % escapes both, in the right order"
);

// Nothing should be dropped.
assert(escapeLikePattern("") === "", "empty string stays empty");
assert(
  escapeLikePattern("100%_done\\yes").includes("100\\%\\_done\\\\yes"),
  "a mixed string escapes all three characters"
);

if (failed === 0) {
  console.log("\nall passed");
}
process.exit(failed === 0 ? 0 : 1);
