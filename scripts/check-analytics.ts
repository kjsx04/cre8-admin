/**
 * npx tsx scripts/check-analytics.ts
 *
 * Runs the real dashboard maths against the live event table and prints it, so
 * the numbers on screen can be checked against SQL rather than trusted.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { buildAnalytics, type AnalyticsEvent, type AnalyticsCampaign } from "../src/lib/email/analytics";

// .env.local by hand — this repo has no dotenv, and shell exports would win anyway
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const events: AnalyticsEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("email_events")
      .select("id, event_type, campaign_id, email_id, broadcast_id, occurred_at, payload")
      .not("campaign_id", "is", null)
      .order("occurred_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (row.payload || {}) as any;
      const detail = p.click || p.open || {};
      events.push({
        id: row.id,
        event_type: row.event_type,
        campaign_id: row.campaign_id,
        email_id: row.email_id,
        broadcast_id: row.broadcast_id,
        occurred_at: row.occurred_at,
        link: detail.link ?? null,
        userAgent: detail.userAgent ?? null,
        ipAddress: detail.ipAddress ?? null,
        bounce_type: p.bounce?.type ?? null,
      });
    }
    if ((data || []).length < 1000) break;
  }

  const { data: campaigns } = await supabase
    .from("email_campaigns")
    .select("id, listing_name, email_label, status, campaign_type, campaign_kind, frequency, segment_id, created_at, last_sent_at");

  const s = buildAnalytics(events, (campaigns || []) as AnalyticsCampaign[], null);

  console.log(`\n${events.length} attributed events across ${s.campaignsWithData} campaigns, ${s.sends} sends\n`);
  console.log("REACH");
  console.log(`  attempted ${s.reach.emails}  delivered ${s.reach.delivered} (${pct(s.reach.deliveryRate)})`);
  console.log(`  bounced ${s.reach.bounced} (${pct(s.reach.bounceRate)}) — ${s.reach.hardBounces} hard, ${s.reach.softBounces} soft`);

  console.log("\nENGAGEMENT              human        raw");
  const row = (label: string, h: string, r: string) => console.log(`  ${label.padEnd(20)}${h.padStart(7)}${r.padStart(11)}`);
  row("opens", String(s.human.opens), String(s.raw.opens));
  row("unique openers", String(s.human.uniqueOpeners), String(s.raw.uniqueOpeners));
  row("open rate", pct(s.human.openRate), pct(s.raw.openRate));
  row("clicks", String(s.human.clicks), String(s.raw.clicks));
  row("unique clickers", String(s.human.uniqueClickers), String(s.raw.uniqueClickers));
  row("click rate", pct(s.human.clickRate), pct(s.raw.clickRate));
  row("click-to-open", pct(s.human.clickToOpenRate), pct(s.raw.clickToOpenRate));

  console.log(`\nFILTERED  ${s.noise.filteredClicks} clicks (${pct(s.noise.filteredClickShare)}), ${s.noise.filteredOpens} opens`);
  for (const r of s.noise.reasons) console.log(`  ${r.reason.padEnd(20)} ${r.count}`);

  console.log("\nTOP LINKS");
  for (const l of s.links.slice(0, 5)) console.log(`  ${String(l.clicks).padStart(4)} clicks / ${String(l.clickers).padStart(3)} people  ${l.url}`);

  console.log("\nPER CAMPAIGN");
  for (const c of s.perCampaign) {
    console.log(`  ${c.name} — ${c.sends} send(s), ${c.reach.delivered} delivered, open ${pct(c.human.openRate)}, click ${pct(c.human.clickRate)}, ${c.daysRunning}d running`);
  }

  const hot = s.clicksByHour.filter((b) => b.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
  console.log("\nHUMAN CLICKS BY PHOENIX HOUR");
  for (const b of hot) console.log(`  ${String(b.bucket).padStart(2)}:00  ${b.count}`);
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
