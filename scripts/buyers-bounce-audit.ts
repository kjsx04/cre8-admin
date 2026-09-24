/**
 * npx tsx scripts/buyers-bounce-audit.ts
 *
 * Read-only. Lists who in the Buyers segment is unsubscribed, and why, by
 * joining Resend's membership against the local bounce-health table.
 *
 * The distinction matters: an address Resend marks unsubscribed is either a
 * bounce our policy suppressed, or a person who opted out themselves. Those
 * two must not be treated the same.
 */

import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = env.RESEND_API_KEY;
const BUYERS = "5c3d642d-439f-4ce2-874c-aac68f6d9b36";

const hash = (e: string) => createHash("sha256").update(e.trim().toLowerCase()).digest("hex");

interface Contact { id: string; email: string; unsubscribed?: boolean }

/** Walk the whole segment — Resend pages 100 at a time */
async function segmentContacts(segmentId: string): Promise<Contact[]> {
  const out: Contact[] = [];
  let after: string | undefined;
  for (let page = 0; page < 200; page++) {
    const url = new URL(`https://api.resend.com/segments/${segmentId}/contacts`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const body = await res.json();
    const rows: Contact[] = body.data || [];
    out.push(...rows);
    if (rows.length < 100) break;
    after = rows[rows.length - 1]?.id;
    if (!after) break;
  }
  return out;
}

async function main() {
  const contacts = await segmentContacts(BUYERS);
  const unsub = contacts.filter((c) => c.unsubscribed);
  console.log(`Buyers: ${contacts.length} contacts, ${unsub.length} unsubscribed\n`);

  // Bounce health, paged past the 1,000-row cap
  const health = new Map<string, { kind: string | null; reason: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("email_contact_health")
      .select("email_hash, last_bounce_kind, suppress_reason")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data || []) health.set(r.email_hash, { kind: r.last_bounce_kind, reason: r.suppress_reason });
    if ((data || []).length < 1000) break;
  }

  const hardBounced: Contact[] = [];
  const softOrOther: Contact[] = [];
  const optedOut: Contact[] = [];

  for (const c of unsub) {
    const h = health.get(hash(c.email));
    if (h?.kind === "hard") hardBounced.push(c);
    else if (h?.kind === "soft" || h?.kind === "complaint") softOrOther.push(c);
    else optedOut.push(c); // no bounce on record — they unsubscribed themselves
  }

  console.log(`  hard bounced (dead address)   ${hardBounced.length}`);
  console.log(`  soft bounced / complaint      ${softOrOther.length}`);
  console.log(`  no bounce on record           ${optedOut.length}   <- opted out themselves, must NOT be deleted`);

  writeFileSync("/tmp/buyers-hard-bounced.json", JSON.stringify(hardBounced, null, 2));
  console.log(`\nWrote ${hardBounced.length} hard-bounced contacts to /tmp/buyers-hard-bounced.json`);
  console.log("Sample:", hardBounced.slice(0, 5).map((c) => c.email).join(", "));

  if (optedOut.length) {
    console.log("\nOpted out themselves (left alone):", optedOut.slice(0, 10).map((c) => c.email).join(", "));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
