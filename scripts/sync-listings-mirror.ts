/**
 * npx tsx scripts/sync-listings-mirror.ts [--force]
 *
 * Copies every listing (fields, photos, PDFs) from Webflow into Supabase.
 * Safe to run any time and as often as you like: it only reads Webflow, only
 * copies files Supabase doesn't have yet, and skips listings that haven't
 * changed. `--force` re-writes every row even if it looks unchanged.
 *
 * The hourly cron (/api/listings/mirror) runs the same code; this script is for
 * the first full copy and for running it by hand.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { syncListingsMirror } from "../src/lib/listings/webflow-mirror";

// .env.local by hand — this repo has no dotenv, and shell exports would win anyway
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await syncListingsMirror({
    supabase,
    supabaseUrl: env.SUPABASE_URL,
    workerBase: "https://cre8-api-proxy.kjsx04.workers.dev",
    force: process.argv.includes("--force"),
    log: (m) => console.log(m),
  });

  console.log("\n── Listings mirror ──");
  console.log(`Webflow listings : ${result.webflowTotal}`);
  console.log(`Written          : ${result.upserted.length}`);
  console.log(`Unchanged        : ${result.unchanged}`);
  console.log(`Files copied     : ${result.filesCopied}`);
  console.log(`Removed          : ${result.removed.length}${result.removed.length ? " → " + result.removed.join(", ") : ""}`);
  if (result.warnings.length) {
    console.log(`\nWarnings (${result.warnings.length}):`);
    for (const w of result.warnings) console.log("  - " + w);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
