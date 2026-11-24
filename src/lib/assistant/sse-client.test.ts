/**
 * Run: npx tsx src/lib/assistant/sse-client.test.ts   (or `npm test sse-client`)
 * The browser-side reader for the assistant's stream.
 */

import { sseLine } from "./chat";
import { parseSseBuffer } from "./sse-client";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

// What the server writes, read back by the browser.
const wire =
  sseLine({ type: "status", text: "Looking up listings…" }) +
  sseLine({ type: "token", text: "Mesa Dr " }) +
  sseLine({ type: "tool_error", tool: "get_listing", message: "A lookup failed." }) +
  sseLine({ type: "done" });

const all = parseSseBuffer(wire);
assert(all.events.length === 4 && all.rest === "", "every complete event the server sends is read back");
assert(all.events[1].type === "token" && (all.events[1] as { text: string }).text === "Mesa Dr ", "token text survives the round trip");
assert(all.events[2].type === "tool_error", "a failed lookup reaches the browser as its own event");

// The network splits the stream anywhere, even mid-event.
const cut = wire.length - 10;
const first = parseSseBuffer(wire.slice(0, cut));
assert(first.events.length === 3 && first.rest.length > 0, "a half-arrived event waits for the rest");
const second = parseSseBuffer(first.rest + wire.slice(cut));
assert(second.events.length === 1 && second.events[0].type === "done", "the rest of a split event is read once it arrives");

// One character at a time still gives every event exactly once.
let buf = "";
let count = 0;
for (const ch of wire) {
  const r = parseSseBuffer(buf + ch);
  buf = r.rest;
  count += r.events.length;
}
assert(count === 4, "a stream arriving one character at a time yields each event once");

assert(parseSseBuffer("data: {not json}\n\n" + sseLine({ type: "done" })).events.length === 1, "a malformed event is skipped, not fatal");
assert(parseSseBuffer(": keep-alive\n\n").events.length === 0, "comment lines are ignored");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
