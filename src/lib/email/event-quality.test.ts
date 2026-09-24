/**
 * Run: npx tsx src/lib/email/event-quality.test.ts
 *
 * The first real blast logged 1,689 clicks from 343 "clickers" against 734
 * delivered — a 46.7% click-through rate. Corporate gateways open every link
 * before anyone reads the email. These cover the rules that separate the two,
 * and the one rule that protects real people from being filtered out with them.
 */

import { classifySend, humanClickers, isScannerUserAgent, isAppleMppUserAgent, scannerUserAgentsByShare, type RawEvent } from "./event-quality";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const T0 = Date.parse("2026-09-23T21:33:00Z");
const at = (secs: number) => new Date(T0 + secs * 1000).toISOString();

let n = 0;
function ev(over: Partial<RawEvent>): RawEvent {
  n += 1;
  return {
    id: `e${n}`,
    event_type: "email.clicked",
    email_id: "r1",
    broadcast_id: "b1",
    occurred_at: at(60),
    link: "https://cre8advisors.com/listings/x",
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/143.0.0.0 Safari/537.36",
    ipAddress: "1.2.3.4",
    ...over,
  };
}
const delivered = (rid: string, secs = 0) =>
  ev({ event_type: "email.delivered", email_id: rid, occurred_at: at(secs), link: null, userAgent: null });

// ── Named scanners ──
assert(isScannerUserAgent("Mozilla/4.0 (compatible; ms-office; MSOffice 16)"), "Outlook prefetch is a scanner");
assert(isScannerUserAgent("Mimecast Ltd"), "Mimecast is a scanner");
assert(isScannerUserAgent("python-requests/2.31"), "python-requests is a scanner");
assert(isScannerUserAgent("Mozilla/5.0 HeadlessChrome/120"), "headless Chrome is a scanner");
assert(!isScannerUserAgent("Mozilla/5.0 (iPhone) Safari/605.1.15"), "a real iPhone is not a scanner");
assert(!isScannerUserAgent(null), "a missing user agent is not a scanner — the rule is skipped");
assert(isAppleMppUserAgent("AppleMail/16.0"), "Apple Mail is recognised for MPP");

// ── The behavioural rule: a spoofed agent spread across a whole send ──
// Real shape from the blast: Chrome/109 on hundreds of recipients at once.
const SPOOF = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/109.0.0.0 Safari/537.36";
const wide: RawEvent[] = [];
for (let i = 0; i < 40; i++) wide.push(ev({ email_id: `w${i}`, userAgent: SPOOF }));
for (let i = 0; i < 60; i++) wide.push(ev({ email_id: `h${i}`, userAgent: `Chrome/14${i % 5}.0 Safari` }));
const spoofed = scannerUserAgentsByShare(wide);
assert(spoofed.has(SPOOF), "one agent on 40% of a send's recipients is flagged as a scanner");
assert(spoofed.size === 1, "ordinary spread-out agents are left alone");

// Too small a send to draw conclusions from
const tiny = [ev({ email_id: "a", userAgent: SPOOF }), ev({ email_id: "b", userAgent: SPOOF })];
assert(scannerUserAgentsByShare(tiny).size === 0, "a 2-recipient send is too small for the share rule");

// ── Pre-delivery clicks ──
const early = [delivered("r1", 0), ev({ email_id: "r1", occurred_at: at(3) })];
assert(
  classifySend(early).find((v) => v.event_id === early[1].id)?.reason === "pre_delivery_click",
  "a click 3 seconds after delivery is a bot"
);
const later = [delivered("r2", 0), ev({ email_id: "r2", occurred_at: at(120) })];
assert(
  classifySend(later).find((v) => v.event_id === later[1].id)?.is_bot === false,
  "a click two minutes later is a person"
);

// ── Burst: the pattern the original brief missed ──
// 214 recipients did exactly this: 3 clicks, only 2 distinct links, 0.2 seconds.
const burst = [
  delivered("r3", 0),
  ev({ email_id: "r3", occurred_at: at(70.0), link: "https://cre8advisors.com/listings/x" }),
  ev({ email_id: "r3", occurred_at: at(70.1), link: "https://cre8advisors.com" }),
  ev({ email_id: "r3", occurred_at: at(70.2), link: "https://cre8advisors.com/listings/x" }),
];
const burstVerdicts = classifySend(burst);
assert(
  burstVerdicts.filter((v) => v.reason === "burst_multi_link").length === 3,
  "3 clicks over 2 links in 0.2s is a burst — counting clicks, not just distinct links"
);

// Two clicks a minute apart is a person reading
const paced = [
  delivered("r4", 0),
  ev({ email_id: "r4", occurred_at: at(60), link: "https://cre8advisors.com/listings/x" }),
  ev({ email_id: "r4", occurred_at: at(200), link: "https://cre8advisors.com" }),
];
assert(classifySend(paced).every((v) => !v.is_bot), "two clicks two minutes apart are human");

// ── Opens ──
const instant = [delivered("r5", 0), ev({ event_type: "email.opened", email_id: "r5", occurred_at: at(1), link: null })];
const iv = classifySend(instant).find((v) => v.event_id === instant[1].id);
assert(iv?.is_unreliable_open === true && iv?.is_bot === false, "an open 1s after delivery is unreliable, not a bot");
const mpp = [delivered("r6", 0), ev({ event_type: "email.opened", email_id: "r6", occurred_at: at(300), link: null, userAgent: "AppleMail/16.0" })];
const mv = classifySend(mpp).find((v) => v.event_id === mpp[1].id);
assert(mv?.is_unreliable_open === true && mv?.is_bot === false, "Apple MPP is a real person with a meaningless open");

// ── The override that protects real people ──
const mixed = [
  delivered("r7", 0),
  ev({ email_id: "r7", occurred_at: at(70.0), link: "a" }),
  ev({ email_id: "r7", occurred_at: at(70.1), link: "b" }),
  ev({ email_id: "r7", occurred_at: at(70.2), link: "c" }),
  ev({ email_id: "r7", occurred_at: at(900), link: "https://cre8advisors.com/listings/x" }),
];
const mixedV = classifySend(mixed);
assert(mixedV.filter((v) => v.is_bot).length === 3, "the burst is still flagged");
assert(
  humanClickers(mixed, mixedV).has("r7"),
  "a recipient with one clean click is human even though their gateway swept the links"
);

// Someone whose every click was a burst is not a clicker
const allBot = [delivered("r8", 0), ev({ email_id: "r8", occurred_at: at(70.0), link: "a" }), ev({ email_id: "r8", occurred_at: at(70.1), link: "b" }), ev({ email_id: "r8", occurred_at: at(70.2), link: "c" })];
assert(!humanClickers(allBot, classifySend(allBot)).has("r8"), "a recipient with only burst clicks is not a human clicker");

// ── Non-engagement events are never flagged ──
const plain = [delivered("r9", 0), ev({ event_type: "email.bounced", email_id: "r9", link: null, userAgent: null })];
assert(classifySend(plain).every((v) => !v.is_bot && !v.is_unreliable_open), "sent/delivered/bounced carry no verdict");

// ── Missing data skips its rule rather than inventing one ──
const noUa = [delivered("r10", 0), ev({ email_id: "r10", occurred_at: at(300), userAgent: null })];
assert(classifySend(noUa).every((v) => !v.is_bot), "a click with no user agent is not assumed to be a bot");
const noDelivery = classifySend([ev({ email_id: "r11", occurred_at: at(1) })]);
assert(noDelivery.every((v) => !v.is_bot), "with no delivery event the timing rule is skipped, not guessed");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall event-quality tests passed");
