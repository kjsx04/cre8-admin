/**
 * Run: npx tsx src/lib/email/merge-tags.test.ts
 *
 * Merge tags only work on broadcasts. If a tag ever reaches the transactional
 * endpoint unresolved, a real person reads "Hi {{{contact.first_name|there}}},".
 * These cover the resolver that stops that happening.
 */

import {
  MERGE_TAGS,
  hasMergeTags,
  resolveMergeTags,
  previewMergeTags,
  SAMPLE_EMAIL,
} from "./merge-tags";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok ", msg);
  }
}

const FIRST = MERGE_TAGS[0].token;

// ── The tokens are the syntax Resend documents ──
assert(FIRST === "{{{contact.first_name}}}", "the first-name token matches the Broadcasts editor docs");
assert(
  MERGE_TAGS.every((t) => !t.token.includes("|")),
  "no tag carries a fallback word — a missing value is dropped, not replaced"
);
assert(
  MERGE_TAGS.every((t) => /^\{\{\{contact\.[a-z_]+(\|[^}]*)?\}\}\}$/.test(t.token)),
  "every token is triple-braced contact.<key>"
);

// ── Detection ──
assert(hasMergeTags(`<p>Hi ${FIRST},</p>`), "a tag is detected");
assert(!hasMergeTags("<p>Hi there,</p>"), "plain copy has no tags");
assert(
  !hasMergeTags('<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>'),
  "the unsubscribe tag is left alone — that one is Resend's job"
);

// ── Resolving for a real person ──
assert(
  resolveMergeTags(`Hi ${FIRST},`, { first_name: "Bradley" }) === "Hi Bradley,",
  "a known first name is substituted"
);
assert(
  resolveMergeTags(`Hi ${FIRST},`, { first_name: null }) === "Hi,",
  'a missing first name is dropped with its space — "Hi," not "Hi ,"'
);
assert(
  resolveMergeTags(`Hi ${FIRST},`, { first_name: "   " }) === "Hi,",
  "whitespace counts as missing"
);
assert(
  resolveMergeTags(`Hi ${FIRST},`, null) === "Hi,",
  "no contact at all also drops the name cleanly"
);
assert(
  resolveMergeTags(`<p>Hi ${FIRST},</p>`, { first_name: null }) === "<p>Hi,</p>",
  "the same holds inside a paragraph tag"
);
assert(
  resolveMergeTags(`Hi ${FIRST} {{{contact.last_name}}},`, { first_name: "Ada", last_name: null }) === "Hi Ada,",
  "a present first name and a missing last name leave no double space"
);
assert(
  resolveMergeTags(`Hi ${FIRST},`, { first_name: "Kevin" }) === "Hi Kevin,",
  "a present name keeps the space in front of it"
);
assert(
  resolveMergeTags("{{{contact.last_name}}}", { last_name: null }) === "",
  "a missing value leaves nothing, never raw braces"
);
assert(
  resolveMergeTags("{{{contact.email}}}", { email: "pat@x.com" }) === "pat@x.com",
  "the email tag resolves"
);
assert(
  resolveMergeTags(
    `${FIRST} {{{contact.last_name}}} <{{{contact.email}}}>`,
    { first_name: "Ada", last_name: "Rose", email: "ada@x.com" }
  ) === "Ada Rose <ada@x.com>",
  "several tags in one line all resolve"
);
assert(
  resolveMergeTags(`${FIRST} and ${FIRST}`, { first_name: "Jo" }) === "Jo and Jo",
  "the same tag twice resolves both times"
);
assert(
  !resolveMergeTags(`Hi ${FIRST}, ${"{{{contact.last_name}}}"}`, {}).includes("{{{"),
  "nothing resolvable is left behind for a contact with no fields at all"
);

// ── An unknown property is still cleared, not leaked ──
assert(
  resolveMergeTags("{{{contact.company|a company}}}", { first_name: "Jo" }) === "a company",
  "a hand-typed fallback is still honoured if someone writes one"
);
assert(
  !resolveMergeTags("{{{contact.nonsense}}}", null).includes("{"),
  "an unmapped property with no fallback leaves nothing"
);

// ── Preview ──
assert(previewMergeTags(`Hi ${FIRST},`) === "Hi,", "the preview drops the name the same way a real send does");
assert(!previewMergeTags(`Hi ${FIRST},`).includes("{{{"), "the preview never shows raw braces");
assert(
  previewMergeTags("{{{contact.email}}}") === SAMPLE_EMAIL,
  "the preview shows an obvious sample email, not a blank — every contact has one"
);
assert(SAMPLE_EMAIL.includes("@") && !SAMPLE_EMAIL.includes("cre8"), "the sample email can't be mistaken for real data");

// ── Leaves everything else alone ──
assert(resolveMergeTags("", null) === "", "empty in, empty out");
assert(
  resolveMergeTags("<p>Plain copy, 3 > 2 &amp; fine.</p>", null) === "<p>Plain copy, 3 > 2 &amp; fine.</p>",
  "copy with no tags is untouched"
);

console.log(failed === 0 ? "\nall merge-tags tests passed" : `\n${failed} merge-tags test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
