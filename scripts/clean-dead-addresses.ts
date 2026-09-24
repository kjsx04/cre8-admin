/**
 * npx tsx scripts/clean-dead-addresses.ts [--apply]
 *
 * Sweep every Resend list for addresses that are known dead, and take them out.
 *
 * "Dead" means a hard bounce on record in email_contact_health — the recipient's
 * provider said the mailbox does not exist. It does NOT mean unsubscribed: a
 * person who opted out themselves must stay in Resend, marked unsubscribed, or
 * a later import would mail them again after they asked not to be.
 *
 * What it does, per list:
 *   1. Any member with a hard bounce is marked unsubscribed (the tombstone that
 *      survives a CSV re-import), then removed from the list.
 *   2. Managed "Auto:" union segments additionally lose anyone who is in none of
 *      their source lists — the state ensureUnionSegment was failing to reach.
 *
 * Dry run by default. --apply to make the changes.
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

const hash = (e: string) => createHash("sha256").update(e.trim().toLowerCase()).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Contact { id: string; email: string; unsubscribed?: boolean }
interface Segment { id: string; name: string }

/** Resend allows 10 requests a second — back off rather than dying mid-walk. */
async function api(path: string, init: RequestInit = {}): Promise<Response> {
  let r = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
  });
  for (let attempt = 0; r.status === 429 && attempt < 6; attempt++) {
    await sleep(800 * (attempt + 1));
    r = await fetch(`https://api.resend.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    });
  }
  return r;
}

async function segments(): Promise<Segment[]> {
  const r = await api("/segments");
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()).data || [];
}

async function members(segmentId: string): Promise<Contact[]> {
  const out: Contact[] = [];
  let after: string | undefined;
  for (let i = 0; i < 400; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const r = await api(`/segments/${segmentId}/contacts?${qs}`);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const rows: Contact[] = (await r.json()).data || [];
    out.push(...rows);
    if (rows.length < 100) break;
    after = rows[rows.length - 1]?.id;
    if (!after) break;
  }
  return out;
}

/** Small parallel batches — quick, inside the rate limit, and every response is checked. */
async function each<T>(items: T[], label: string, fn: (item: T) => Promise<boolean>): Promise<number> {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += 8) {
    await Promise.all(
      items.slice(i, i + 8).map(async (item) => ((await fn(item)) ? ok++ : failed++))
    );
    process.stdout.write(`\r    ${label}: ${ok + failed}/${items.length}`);
  }
  console.log(`\r    ${label}: ${ok}/${items.length}${failed ? `  ${failed} FAILED` : ""}`);
  return failed;
}

async function main() {
  // ── Bounce health, paged past the 1,000-row cap ──
  const hardBounced = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("email_contact_health")
      .select("email_hash, last_bounce_kind")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data || []) if (r.last_bounce_kind === "hard") hardBounced.add(r.email_hash);
    if ((data || []).length < 1000) break;
  }
  console.log(`${hardBounced.size} addresses have a hard bounce on record\n`);

  const all = await segments();
  const real = all.filter((s) => !/^auto:/i.test(s.name));
  const auto = all.filter((s) => /^auto:/i.test(s.name));

  // Membership of every real list, so union strays can be worked out
  const memberOf = new Map<string, Contact[]>();
  for (const s of real) memberOf.set(s.id, await members(s.id));

  let totalFailed = 0;

  // ── Real lists ──
  for (const s of real) {
    const rows = memberOf.get(s.id)!;
    const dead = rows.filter((c) => hardBounced.has(hash(c.email)));
    const optedOut = rows.filter((c) => c.unsubscribed && !hardBounced.has(hash(c.email)));
    // A hard bounce that Resend still shows as subscribed never got suppressed
    const notYetSuppressed = dead.filter((c) => !c.unsubscribed);

    console.log(`${s.name}: ${rows.length} contacts`);
    console.log(`  ${dead.length} dead${notYetSuppressed.length ? ` (${notYetSuppressed.length} still marked subscribed)` : ""} -> remove`);
    console.log(`  ${optedOut.length} opted out themselves -> left in place`);

    if (!APPLY || dead.length === 0) { console.log(); continue; }

    // Suppress first, so the tombstone exists even if the removal is interrupted
    if (notYetSuppressed.length) {
      totalFailed += await each(notYetSuppressed, "suppress", async (c) => {
        const r = await api(`/contacts/${encodeURIComponent(c.email)}`, {
          method: "PATCH",
          body: JSON.stringify({ unsubscribed: true }),
        });
        return r.ok;
      });
    }
    totalFailed += await each(dead, "remove", async (c) => {
      const r = await api(`/contacts/${encodeURIComponent(c.email)}/segments/${s.id}`, { method: "DELETE" });
      return r.ok || r.status === 404; // 404 = already gone
    });
    console.log();
  }

  // ── Managed union segments ──
  for (const s of auto) {
    const rows = await members(s.id);
    // "Auto: Brokers + Buyers" -> the lists it is built from
    const sourceNames = s.name.replace(/^auto:\s*/i, "").split("+").map((n) => n.trim().toLowerCase());
    const sources = real.filter((r) => sourceNames.includes(r.name.toLowerCase()));
    const live = new Set(sources.flatMap((r) => memberOf.get(r.id)!).map((c) => c.email.toLowerCase()));

    const stale = rows.filter(
      (c) => hardBounced.has(hash(c.email)) || !live.has(c.email.toLowerCase())
    );

    console.log(`${s.name}: ${rows.length} members, built from ${sources.map((x) => x.name).join(" + ") || "(sources not found)"}`);
    console.log(`  ${stale.length} dead or in none of the source lists -> remove`);

    if (!APPLY || stale.length === 0 || sources.length === 0) { console.log(); continue; }

    totalFailed += await each(stale, "remove", async (c) => {
      const r = await api(`/contacts/${encodeURIComponent(c.email)}/segments/${s.id}`, { method: "DELETE" });
      return r.ok || r.status === 404;
    });
    console.log();
  }

  if (!APPLY) { console.log("Dry run. Re-run with --apply to make these changes."); return; }
  if (totalFailed) console.log(`${totalFailed} operations failed — re-run to retry.`);

  console.log("\nFinal state");
  for (const s of await segments()) {
    const rows = await members(s.id);
    const dead = rows.filter((c) => hardBounced.has(hash(c.email))).length;
    console.log(`  ${s.name.padEnd(26)} ${String(rows.length).padStart(5)} contacts, ${rows.filter((c) => c.unsubscribed).length} unsubscribed, ${dead} dead`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
