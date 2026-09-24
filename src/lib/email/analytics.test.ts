/**
 * npx tsx src/lib/email/analytics.test.ts
 *
 * Checks the aggregation maths, not the bot rules — those have their own test.
 * The cases here are the ones that were easy to get wrong: an address that
 * bounces then delivers, rates divided by the wrong denominator, and a campaign
 * filter applied before classification instead of after.
 */

import { buildAnalytics, type AnalyticsEvent, type AnalyticsCampaign } from "./analytics";

let failures = 0;
function assert(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}`, extra === undefined ? "" : extra);
  }
}

const T0 = Date.parse("2026-09-23T16:00:00Z");
const at = (secs: number) => new Date(T0 + secs * 1000).toISOString();

let seq = 0;
function ev(partial: Partial<AnalyticsEvent> & { event_type: string; email_id: string }): AnalyticsEvent {
  return {
    id: `e${++seq}`,
    broadcast_id: "bc1",
    campaign_id: "c1",
    occurred_at: at(0),
    link: null,
    userAgent: null,
    ipAddress: null,
    bounce_type: null,
    ...partial,
  };
}

const CAMPAIGNS: AnalyticsCampaign[] = [
  {
    id: "c1", listing_name: "Blossom Rock", email_label: "Retail pads", status: "active",
    campaign_type: "recurring", campaign_kind: "single", frequency: "weekly",
    segment_id: "all", created_at: at(0), last_sent_at: at(0),
  },
  {
    id: "c2", listing_name: "Meridian & Pecos", email_label: "Just Listed", status: "active",
    campaign_type: "recurring", campaign_kind: "single", frequency: "weekly",
    segment_id: "all", created_at: at(0), last_sent_at: at(0),
  },
];

console.log("\nReach");
{
  const events: AnalyticsEvent[] = [
    // a delivers
    ev({ event_type: "email.sent", email_id: "a" }),
    ev({ event_type: "email.delivered", email_id: "a", occurred_at: at(30) }),
    // b hard bounces
    ev({ event_type: "email.sent", email_id: "b" }),
    ev({ event_type: "email.bounced", email_id: "b", occurred_at: at(30), bounce_type: "Permanent" }),
    // c soft bounces
    ev({ event_type: "email.sent", email_id: "c" }),
    ev({ event_type: "email.bounced", email_id: "c", occurred_at: at(30), bounce_type: "Transient" }),
    // d soft bounces then delivers on the retry — the later delivery wins
    ev({ event_type: "email.sent", email_id: "d" }),
    ev({ event_type: "email.bounced", email_id: "d", occurred_at: at(30), bounce_type: "Transient" }),
    ev({ event_type: "email.delivered", email_id: "d", occurred_at: at(90) }),
    // e is accepted at the edge then fails inside the recipient's network.
    // This is the real Outlook "hop count exceeded" pattern — 49 of them on the
    // first blast — and it must count as a bounce, not a delivery.
    ev({ event_type: "email.sent", email_id: "e" }),
    ev({ event_type: "email.delivered", email_id: "e", occurred_at: at(30) }),
    ev({ event_type: "email.bounced", email_id: "e", occurred_at: at(90), bounce_type: "Permanent" }),
  ];
  const s = buildAnalytics(events, CAMPAIGNS, null);
  assert("counts 5 emails attempted", s.reach.emails === 5, s.reach.emails);
  assert("counts 2 delivered", s.reach.delivered === 2, s.reach.delivered);
  assert("2 hard bounces", s.reach.hardBounces === 2, s.reach.hardBounces);
  assert("1 soft bounce", s.reach.softBounces === 1, s.reach.softBounces);
  assert("a retried address is not a bounce", s.reach.bounced === 3, s.reach.bounced);
  assert("delivered-then-bounced is a bounce", s.reach.delivered === 2 && s.reach.hardBounces === 2, s.reach);
  assert("delivery rate is delivered/attempted", Math.abs(s.reach.deliveryRate - 0.4) < 1e-9, s.reach.deliveryRate);
  assert("one send", s.sends === 1, s.sends);
}

console.log("\nEngagement rates use delivered as the denominator");
{
  const events: AnalyticsEvent[] = [];
  // 10 delivered, 4 open, 2 of those click once each — slowly, so nothing is flagged
  for (let i = 0; i < 10; i++) {
    events.push(ev({ event_type: "email.sent", email_id: `r${i}` }));
    events.push(ev({ event_type: "email.delivered", email_id: `r${i}`, occurred_at: at(30) }));
  }
  for (let i = 0; i < 4; i++) {
    events.push(ev({ event_type: "email.opened", email_id: `r${i}`, occurred_at: at(600 + i), userAgent: "Chrome" }));
  }
  for (let i = 0; i < 2; i++) {
    events.push(ev({ event_type: "email.clicked", email_id: `r${i}`, occurred_at: at(900 + i * 60), link: "https://cre8advisors.com/a", userAgent: "Chrome" }));
  }
  const s = buildAnalytics(events, CAMPAIGNS, null);
  assert("open rate 4/10", Math.abs(s.human.openRate - 0.4) < 1e-9, s.human.openRate);
  assert("click rate 2/10", Math.abs(s.human.clickRate - 0.2) < 1e-9, s.human.clickRate);
  assert("click-to-open 2/4", Math.abs(s.human.clickToOpenRate - 0.5) < 1e-9, s.human.clickToOpenRate);
  assert("no noise on clean traffic", s.noise.filteredClicks === 0, s.noise);
  assert("top link recorded", s.links[0]?.url === "https://cre8advisors.com/a" && s.links[0].clicks === 2, s.links);
}

console.log("\nScanner traffic is filtered, and raw is still reported");
{
  const events: AnalyticsEvent[] = [];
  for (let i = 0; i < 30; i++) {
    events.push(ev({ event_type: "email.sent", email_id: `r${i}` }));
    events.push(ev({ event_type: "email.delivered", email_id: `r${i}`, occurred_at: at(30) }));
  }
  // 25 recipients get scanned: 3 instant clicks each across 3 links
  for (let i = 0; i < 25; i++) {
    for (let k = 0; k < 3; k++) {
      events.push(ev({
        event_type: "email.clicked", email_id: `r${i}`, occurred_at: at(31 + k * 0.05),
        link: `https://cre8advisors.com/l${k}`, userAgent: "Mozilla/5.0 GatewayScan",
      }));
    }
  }
  // one real person clicks once, ten minutes later
  events.push(ev({ event_type: "email.clicked", email_id: "r29", occurred_at: at(600), link: "https://cre8advisors.com/l0", userAgent: "Chrome/124" }));

  const s = buildAnalytics(events, CAMPAIGNS, null);
  assert("raw clicks include the scanner", s.raw.clicks === 76, s.raw.clicks);
  assert("human clicks are just the person", s.human.clicks === 1, s.human.clicks);
  assert("one human clicker", s.human.uniqueClickers === 1, s.human.uniqueClickers);
  assert("noise share is reported", s.noise.filteredClicks === 75, s.noise);
  assert("a reason is attached", s.noise.reasons.length > 0, s.noise.reasons);
}

console.log("\nScoping to one campaign");
{
  const events: AnalyticsEvent[] = [
    ev({ event_type: "email.sent", email_id: "a", campaign_id: "c1", broadcast_id: "bc1" }),
    ev({ event_type: "email.delivered", email_id: "a", campaign_id: "c1", broadcast_id: "bc1", occurred_at: at(30) }),
    ev({ event_type: "email.opened", email_id: "a", campaign_id: "c1", broadcast_id: "bc1", occurred_at: at(600), userAgent: "Chrome" }),
    ev({ event_type: "email.sent", email_id: "z", campaign_id: "c2", broadcast_id: null }),
    ev({ event_type: "email.delivered", email_id: "z", campaign_id: "c2", broadcast_id: null, occurred_at: at(30) }),
  ];

  const all = buildAnalytics(events, CAMPAIGNS, null);
  assert("all scope sees both campaigns", all.campaignsWithData === 2, all.campaignsWithData);
  assert("all scope counts 2 delivered", all.reach.delivered === 2, all.reach.delivered);
  assert("per-campaign rows for both", all.perCampaign.length === 2, all.perCampaign.map((c) => c.id));
  assert("per-campaign names resolved", all.perCampaign.some((c) => c.name === "Meridian & Pecos"), all.perCampaign);

  const one = buildAnalytics(events, CAMPAIGNS, "c1");
  assert("scoped delivered is 1", one.reach.delivered === 1, one.reach.delivered);
  assert("scoped open rate is 1/1", Math.abs(one.human.openRate - 1) < 1e-9, one.human.openRate);
  assert("scoped still lists every campaign for comparison", one.perCampaign.length === 2, one.perCampaign.length);
  assert("campaignId echoed back", one.campaignId === "c1", one.campaignId);
}

console.log("\nTiming buckets are Phoenix, not UTC");
{
  // 16:00 UTC is 9:00 AM Phoenix, on a Wednesday
  const events: AnalyticsEvent[] = [
    ev({ event_type: "email.sent", email_id: "a" }),
    ev({ event_type: "email.delivered", email_id: "a", occurred_at: at(30) }),
    ev({ event_type: "email.clicked", email_id: "a", occurred_at: at(60), link: "https://x", userAgent: "Chrome" }),
  ];
  const s = buildAnalytics(events, CAMPAIGNS, null);
  assert("24 hour buckets", s.clicksByHour.length === 24, s.clicksByHour.length);
  assert("click lands in the 9 AM bucket", s.clicksByHour[9].count === 1, s.clicksByHour.filter((b) => b.count));
  assert("7 weekday buckets, Sunday first", s.clicksByWeekday.length === 7, s.clicksByWeekday.length);
  assert("click lands on Wednesday", s.clicksByWeekday[3].count === 1, s.clicksByWeekday.filter((b) => b.count));
  assert("send counted once on Wednesday", s.sendsByWeekday[3].count === 1, s.sendsByWeekday.filter((b) => b.count));
}

console.log("\nEmpty input");
{
  const s = buildAnalytics([], CAMPAIGNS, null);
  assert("no divide-by-zero", s.human.openRate === 0 && s.human.clickRate === 0 && s.reach.deliveryRate === 0);
  assert("no campaigns with data", s.campaignsWithData === 0);
  assert("days running is 0", s.daysRunning === 0, s.daysRunning);
}

console.log(failures === 0 ? "\nAll analytics tests passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
