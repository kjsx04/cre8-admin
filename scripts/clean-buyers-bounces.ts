/**
 * npx tsx scripts/clean-buyers-bounces.ts [--apply]
 *
 * Two clean-ups, both re-computed live so nothing acts on a stale snapshot:
 *
 *   1. Take hard-bounced addresses out of the Buyers segment. The contact is
 *      kept in Resend, still marked unsubscribed — that record is what stops a
 *      later CSV import quietly resurrecting a dead address.
 *   2. Take anyone out of "Auto: Brokers + Buyers" who is in neither source
 *      list. ensureUnionSegment was meant to do this and failed silently.
 *
 * Addresses that unsubscribed themselves are never touched.
 * Without --apply it only reports.
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = env.RESEND_API_KEY;
const APPLY = process.argv.includes("--apply");

const BROKERS = "1680dbe6-0635-4c38-8d7d-7f37b08a1cb4";
const BUYERS = "5c3d642d-439f-4ce2-874c-aac68f6d9b36";
const UNION = "94e41fd2-9ef3-425b-9e35-945d52f436e4";

const hash = (e: string) => createHash("sha256").update(e.trim().toLowerCase()).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Contact { id: string; email: string; unsubscribed?: boolean }

async function members(segmentId: string): Promise<Contact[]> {
  const out: Contact[] = [];
  let after: string | undefined;
  for (let i = 0; i < 300; i++) {
    const u = new URL(`https://api.resend.com/segments/${segmentId}/contacts`);
    u.searchParams.set("limit", "100");
    if (after) u.searchParams.set("after", after);
    // Resend allows 10 requests a second; a long walk right after a burst of
    // deletes will hit that, so back off rather than dying mid-list.
    let r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    for (let attempt = 0; r.status === 429 && attempt < 5; attempt++) {
      await sleep(800 * (attempt + 1));
      r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    }
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const rows: Contact[] = (await r.json()).data || [];
    out.push(...rows);
    if (rows.length < 100) break;
    after = rows[rows.length - 1]?.id;
    if (!after) break;
  }
  return out;
}

/** Small parallel batches: fast enough, under Resend's rate limit, and every response is checked. */
async function removeAll(emails: string[], segmentId: string, label: string) {
  let ok = 0;
  const failed: { email: string; status: number | string }[] = [];

  for (let i = 0; i < emails.length; i += 8) {
    const batch = emails.slice(i, i + 8);
    await Promise.all(
      batch.map(async (email) => {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const r = await fetch(
              `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${segmentId}`,
              { method: "DELETE", headers: { Authorization: `Bearer ${KEY}` } }
            );
            if (r.ok || r.status === 404) { ok++; return; }      // 404 = already gone
            if (r.status === 429) { await sleep(600 * (attempt + 1)); continue; }
            failed.push({ email, status: r.status });
            return;
          } catch (e) {
            if (attempt === 3) failed.push({ email, status: String(e) });
          }
        }
      })
    );
    process.stdout.write(`\r  ${label}: ${ok}/${emails.length}`);
  }

  console.log(`\r  ${label}: ${ok}/${emails.length} removed${failed.length ? `, ${failed.length} FAILED` : ""}`);
  if (failed.length) console.log("   failures:", failed.slice(0, 10));
  return failed.length;
}

async function main() {
  // ── Bounce health, paged past the 1,000-row cap ──
  const health = new Map<string, string | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("email_contact_health")
      .select("email_hash, last_bounce_kind")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data || []) health.set(r.email_hash, r.last_bounce_kind);
    if ((data || []).length < 1000) break;
  }

  // ── 1. Dead addresses in Buyers ──
  const buyers = await members(BUYERS);
  const unsub = buyers.filter((c) => c.unsubscribed);
  const dead = unsub.filter((c) => health.get(hash(c.email)) === "hard").map((c) => c.email);
  const selfOptOut = unsub.filter((c) => health.get(hash(c.email)) !== "hard");

  console.log(`Buyers: ${buyers.length} contacts, ${unsub.length} unsubscribed`);
  console.log(`  ${dead.length} hard bounced   -> remove from the list`);
  console.log(`  ${selfOptOut.length} opted out themselves -> left alone\n`);

  // ── 2. Strays in the combined list ──
  const union = await members(UNION);
  const brokers = await members(BROKERS);
  const source = new Set([...brokers, ...buyers].map((c) => c.email.toLowerCase()));
  const strays = union.filter((c) => !source.has(c.email.toLowerCase())).map((c) => c.email);

  console.log(`Auto: Brokers + Buyers: ${union.length} members`);
  console.log(`  ${strays.length} in neither Brokers nor Buyers -> remove\n`);

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to make these changes.");
    return;
  }

  console.log("Applying…");
  const f1 = await removeAll(dead, BUYERS, "Buyers");
  // Dead buyers also have to leave the combined list, or the next send finds them there
  const f2 = await removeAll(Array.from(new Set([...strays, ...dead])), UNION, "Combined list");

  console.log("\nVerifying…");
  const buyersAfter = await members(BUYERS);
  const unionAfter = await members(UNION);
  const sourceAfter = new Set([...(await members(BROKERS)), ...buyersAfter].map((c) => c.email.toLowerCase()));
  const straysAfter = unionAfter.filter((c) => !sourceAfter.has(c.email.toLowerCase()));

  console.log(`  Buyers:        ${buyers.length} -> ${buyersAfter.length}  (${buyersAfter.filter(c=>c.unsubscribed).length} unsubscribed left)`);
  console.log(`  Combined list: ${union.length} -> ${unionAfter.length}  (${straysAfter.length} strays left)`);
  if (f1 + f2 > 0) console.log(`  ${f1 + f2} removals failed — re-run to retry.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
