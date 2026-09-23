/**
 * Run: npx tsx src/lib/email/broadcast-name.test.ts
 *
 * Resend rejects a broadcast whose internal `name` runs past 70 characters, and
 * it rejects the whole create call — so a long subject made a campaign
 * unsendable to any segment. The subject itself must never be shortened.
 */

import { buildBroadcastName } from "./provider";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const MAX = 70;

// ── The real failure from 2026-09-23 ──
const blossom = "Retail pads available in the heart of superstition vistas: Marketplace at Blossom Rock";
assert(blossom.length === 85 || blossom.length === 86, `the failing subject is long (${blossom.length} chars)`);

const sentNow = buildBroadcastName(blossom, " (sent now)");
assert(sentNow.length <= MAX, `Send now name fits the limit (${sentNow.length})`);
assert(sentNow.endsWith(" (sent now)"), "the suffix survives so broadcasts stay tellable apart");
assert(sentNow.startsWith("Retail pads available"), "the name still starts with the real subject");
assert(sentNow.includes("..."), "the cut is marked");

const scheduled = buildBroadcastName(blossom, " (9/23/2026)");
assert(scheduled.length <= MAX, `scheduled name fits the limit (${scheduled.length})`);
assert(scheduled.endsWith(" (9/23/2026)"), "the date suffix survives");

// ── Short subjects are untouched ──
assert(buildBroadcastName("Just Listed: Beloat 76", " (sent now)") === "Just Listed: Beloat 76 (sent now)", "a short subject passes straight through");
assert(buildBroadcastName("Just Listed: Beloat 76") === "Just Listed: Beloat 76", "no suffix is fine");
assert(buildBroadcastName("") === "", "empty subject is fine");

// ── Boundary ──
const exact = "x".repeat(MAX);
assert(buildBroadcastName(exact) === exact, "exactly at the limit is not mangled");
assert(buildBroadcastName(exact).length === MAX, "exactly at the limit stays exact");
const oneOver = "x".repeat(MAX + 1);
assert(buildBroadcastName(oneOver).length <= MAX, "one over the limit is trimmed");

// ── Never exceeds the cap, whatever it is handed ──
const cases: [string, string][] = [
  ["a".repeat(500), " (sent now)"],
  ["a".repeat(500), ""],
  ["short", " ".repeat(80)],          // absurd suffix
  ["", " (sent now)"],
  ["Land Opportunities in the West Valley — Five Pads Now Available", " (10/14/2026)"],
];
for (const [subject, suffix] of cases) {
  const out = buildBroadcastName(subject, suffix);
  assert(out.length <= MAX, `never over the cap: ${subject.slice(0, 18)}… + "${suffix.slice(0, 12)}" → ${out.length}`);
}

// ── No trailing space before the marker ──
const spacey = buildBroadcastName("Just Listed: A Very Long Property Name That Goes On And On   ", " (sent now)");
assert(!spacey.includes(" ..."), "trailing whitespace is trimmed before the marker");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall broadcast-name tests passed");
