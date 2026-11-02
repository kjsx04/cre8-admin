/**
 * Run: npx tsx src/lib/email/body-html.test.ts
 *
 * The custom-email body is the one place where HTML the user typed or pasted
 * reaches a real send. These cover what survives, what doesn't, and that the
 * styles email clients need end up inline.
 */

import { sanitizeEmailBodyHtml, renderEmailBodyHtml, hasBodyHtmlContent } from "./body-html";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok ", msg);
  }
}

const STYLE = { font: "Inter, Arial, sans-serif", color: "#BFBFBF" };

// ── What survives ──
assert(
  sanitizeEmailBodyHtml("<p>Hello <strong>there</strong></p>") === "<p>Hello <strong>there</strong></p>",
  "paragraphs and bold come through untouched"
);
assert(
  sanitizeEmailBodyHtml("<ul><li>One</li><li>Two</li></ul>") === "<ul><li>One</li><li>Two</li></ul>",
  "lists come through untouched"
);
assert(
  sanitizeEmailBodyHtml('<a href="https://cre8advisors.com">site</a>') === '<a href="https://cre8advisors.com">site</a>',
  "an https link keeps its address"
);
assert(
  sanitizeEmailBodyHtml('<a href="mailto:kevin@cre8advisors.com">mail</a>').includes("mailto:"),
  "a mailto link keeps its address"
);

// ── What doesn't ──
assert(
  sanitizeEmailBodyHtml('<p style="color:red" class="x">Hi</p>') === "<p>Hi</p>",
  "styles and classes are stripped from a paragraph"
);
assert(
  !sanitizeEmailBodyHtml('<a href="javascript:alert(1)">click</a>').includes("<a"),
  "a javascript: link becomes plain words"
);
assert(
  !sanitizeEmailBodyHtml('<a href="data:text/html;base64,xxx">click</a>').includes("<a"),
  "a data: link becomes plain words"
);
assert(
  sanitizeEmailBodyHtml("<script>alert(1)</script><p>Hi</p>") === "<p>Hi</p>",
  "a script block goes completely — tag and contents"
);
assert(
  !sanitizeEmailBodyHtml('<p>Hi<img src="x" onerror="alert(1)"></p>').includes("img"),
  "an image with an inline handler is removed"
);
assert(
  sanitizeEmailBodyHtml("<div><span>Hi</span></div>") === "Hi",
  "unknown tags are unwrapped, the words stay"
);

// ── Empty ──
assert(sanitizeEmailBodyHtml("") === "", "empty in, empty out");
assert(hasBodyHtmlContent("<p></p>") === false, "a page of empty tags counts as no content");
assert(hasBodyHtmlContent("<p>Hi</p>") === true, "real words count as content");

// ── Inline styles for email clients ──
const rendered = renderEmailBodyHtml('<p>Hi <a href="https://x.com">link</a></p><ul><li>One</li></ul>', STYLE);
assert(rendered.includes('<p style="margin:0 0 14px 0;'), "<p> carries its own style attribute");
assert(rendered.includes("<li style="), "<li> carries its own style attribute");
assert(rendered.includes('<a href="https://x.com" style="color:#8CC644'), "a link keeps its href AND gains a colour");
assert(rendered.includes(STYLE.color), "the copy colour is applied");
assert(renderEmailBodyHtml("", STYLE) === "", "nothing to render gives an empty string, not empty tags");

console.log(failed === 0 ? "\nall body-html tests passed" : `\n${failed} body-html test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
