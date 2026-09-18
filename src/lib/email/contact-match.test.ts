/**
 * Unit tests for Resend contact parse/search/display helpers.
 * Run: npx tsx src/lib/email/contact-match.test.ts
 */

import {
  contactMatchesQuery,
  contactSearchScore,
  extractCompany,
  formatContactPrimaryLine,
  isUnsubscribed,
  parseContactListBody,
  unwrapContact,
} from "./contact-match";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const kevin = unwrapContact({
  id: "70636885-6881-4e33-8750-15949f443835",
  email: "kevin@cre8advisors.com",
  first_name: "Kevin",
  last_name: "Smith",
  unsubscribed: false,
  properties: { company: { value: "CRE8 Advisors", type: "string" } },
});

assert(kevin?.email === "kevin@cre8advisors.com", "unwrap email");
assert(kevin?.company === "CRE8 Advisors", "unwrap nested company property");
assert(formatContactPrimaryLine(kevin!) === "Kevin Smith, CRE8 Advisors", "primary line with company");
assert(contactMatchesQuery(kevin!, "kevin"), "match first name");
assert(contactMatchesQuery(kevin!, "SMITH"), "match last name case-insensitive");
assert(contactMatchesQuery(kevin!, "cre8"), "match company partial");
assert(contactMatchesQuery(kevin!, "kevin@cre8advisors.com"), "match email");
assert(!contactMatchesQuery(kevin!, "colliers"), "no false company match");
assert(
  contactSearchScore(kevin!, "kevin") >
    contactSearchScore({ id: "x", email: "kevin.x@example.com", first_name: "Kevin", last_name: "Manship" }, "kevin"),
  "company-filled Kevin ranks above email-only Kevin"
);

const noCompany = unwrapContact({
  email: "a@b.com",
  first_name: "Ada",
  last_name: "Lovelace",
});
assert(formatContactPrimaryLine(noCompany!) === "Ada Lovelace", "primary line omits missing company");

assert(extractCompany({ properties: { company: "CBRE" } }) === "CBRE", "string company property");
assert(extractCompany({ company: "Colliers" }) === "Colliers", "top-level company");
assert(
  extractCompany({ properties: { "4022ee71-be02-4ed5-9947-3e21e32897d0": { value: "JLL" } } }) === "JLL",
  "company property by official id"
);
assert(extractCompany({ properties: { brokerage: { value: "Lee & Associates" } } }) === "Lee & Associates", "fallback brokerage key");
assert(extractCompany({}) === "", "no invented company");

assert(isUnsubscribed(false) === false, "bool false is subscribed");
assert(isUnsubscribed("false") === false, "string false is subscribed");
assert(isUnsubscribed(true) === true, "bool true is unsubscribed");
assert(isUnsubscribed("true") === true, "string true is unsubscribed");

const wrapped = unwrapContact({
  data: { id: "1", email: "Pat@X.com", first_name: "Pat" },
});
assert(wrapped?.email === "pat@x.com", "unwrap nested data.email + lowercase");

const list = parseContactListBody({
  object: "list",
  has_more: true,
  data: [
    { id: "a", email: "spencer.nast@cbre.com", first_name: "Spencer", last_name: "Nast", unsubscribed: false, properties: { company: "CBRE" } },
    { id: "b", email: "bad" },
  ],
});
assert(list.rows.length === 2, "list parses data[]");
assert(list.hasMore === true, "has_more");
assert(list.rows[0].company === "CBRE", "list row company");

const nestedList = parseContactListBody({
  data: { data: [{ email: "x@y.com", first_name: "X" }], has_more: false },
});
assert(nestedList.rows.length === 1 && nestedList.rows[0].email === "x@y.com", "nested data.data");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall contact-match tests passed");
