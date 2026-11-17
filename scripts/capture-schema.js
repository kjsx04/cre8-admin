#!/usr/bin/env node
/**
 * Capture the live Supabase schema for cre8-admin's tables as a migration file.
 *
 * WHY THIS EXISTS
 * The tables in this project were created by hand in the Supabase dashboard,
 * so for a long time the schema for the deal pipeline, listings workflow,
 * market intel and the logo library existed only in production — the database
 * could not be rebuilt from the repo. This script regenerates a baseline from
 * what is actually deployed, so that can't silently happen again.
 *
 * USAGE
 *   node scripts/capture-schema.js                       # print to stdout
 *   node scripts/capture-schema.js -o supabase/migrations/<date>_baseline.sql
 *
 * Requires SUPABASE_ACCESS_TOKEN in the environment (it is exported from
 * ~/.zshrc). This talks to the Supabase Management API because psql is not
 * installed and there is no direct database connection configured.
 *
 * The generated file is idempotent — `if not exists`, `or replace`, and
 * exception-guarded DO blocks throughout — so it is safe to run against the
 * existing project, where it should be a no-op. To verify a regenerated file
 * without changing anything, swap the trailing `commit;` for `rollback;` and
 * POST it to the same endpoint: DDL is transactional in Postgres, so every
 * statement executes and nothing persists.
 */

const fs = require("fs");

const PROJECT_REF = "xrgfupoyaexgcrtxmqpp";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// The 16 tables cre8-admin reads. The same Supabase project also hosts
// cre8-map's tables (sale_comps, census_tracts, zoning_sources, site_plans,
// planning_events, …) plus PostGIS; those belong to that repo and are
// deliberately excluded. Keep this list in sync with the `.from("…")` calls
// in src/ — `grep -rho '\.from("[a-z_]*")' src | sort -u` lists them.
const TABLES = [
  "brand_logos",
  "brokers",
  "deal_dates",
  "deal_members",
  "deals",
  "email_alerts",
  "email_campaigns",
  "email_contact_health",
  "email_contacts",
  "email_events",
  "email_sends",
  "email_settings",
  "lease_payments",
  "listing_checklists",
  "listing_priorities",
  "market_intel",
  "rep_firms",
  "tenants",
  "category_defaults",
  "size_tiers",
  "tenant_contacts",
  "tenant_locations",
  "tenant_relationships",
  "tenant_size_tiers",
  "category_size_tiers",
  "listing_spaces",
  "demand_overrides",
  "demand_interest",
  "tenant_research_log",
];

// Grouped so the output reads in dependency order (parents before children).
const GROUPS = [
  ["Brokers — referenced by deals, deal_members and campaigns", ["brokers"]],
  ["Deal pipeline (CRE8 Flow)", ["deals", "deal_members", "deal_dates", "lease_payments"]],
  ["Listings workflow", ["listing_checklists", "listing_priorities"]],
  [
    "Email campaigns",
    ["email_campaigns", "email_settings", "email_sends", "email_events", "email_alerts"],
  ],
  ["Email contacts and list hygiene", ["email_contacts", "email_contact_health"]],
  ["Market intel", ["market_intel"]],
  ["Brand logo library", ["brand_logos"]],
  [
    "Demand — tenants, spaces, and size tiers",
    [
      "rep_firms",
      "tenants",
      "category_defaults",
      "size_tiers",
      "tenant_contacts",
      "tenant_locations",
      "tenant_relationships",
      "tenant_size_tiers",
      "category_size_tiers",
      "listing_spaces",
      "demand_overrides",
      "demand_interest",
      "tenant_research_log",
    ],
  ],
];

// Application RPCs and trigger functions we own. Everything else in the
// public schema is PostGIS or pg_trgm (775 functions — do not capture those).
const TRIGGER_FNS = ["set_updated_at", "update_updated_at", "update_market_intel_timestamp"];
const APP_FNS = ["patch_checklist_items", "audience_overlaps"];

// ---------------------------------------------------------------------------
// Management API
// ---------------------------------------------------------------------------

async function query(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const tableList = TABLES.map((t) => `'${t}'`).join(",");

// ---------------------------------------------------------------------------
// Type rendering
// ---------------------------------------------------------------------------

// information_schema reports SQL-standard type names, which aren't always what
// you'd write back (ARRAY and USER-DEFINED tell you nothing). udt_name carries
// the real underlying type.
function typeOf(c) {
  const t = c.data_type;

  if (t === "ARRAY") {
    // udt_name for an array is the element type prefixed with an underscore.
    return c.udt_name.replace(/^_/, "") + "[]";
  }
  if (t === "character varying") {
    return c.character_maximum_length ? `varchar(${c.character_maximum_length})` : "text";
  }
  if (t === "character") {
    return c.character_maximum_length ? `char(${c.character_maximum_length})` : "char";
  }
  if (t === "numeric" && c.numeric_precision != null) {
    return c.numeric_scale != null
      ? `numeric(${c.numeric_precision},${c.numeric_scale})`
      : `numeric(${c.numeric_precision})`;
  }
  if (t === "timestamp with time zone") return "timestamptz";
  if (t === "timestamp without time zone") return "timestamp";
  if (t === "time with time zone") return "timetz";
  if (t === "USER-DEFINED") return c.udt_name;

  return t;
}

// Quote only when the identifier isn't a plain lowercase word, to keep the
// output readable.
function quoteIdent(name) {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name}"`;
}

function columnLine(c) {
  let line = `  ${quoteIdent(c.column_name)} ${typeOf(c)}`;
  if (c.column_default !== null) line += ` default ${c.column_default}`;
  if (c.is_nullable === "NO") line += " not null";
  return line;
}

function lowerCreate(def) {
  return def.replace(/^CREATE OR REPLACE FUNCTION/i, "create or replace function").trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!TOKEN) {
    console.error(
      "SUPABASE_ACCESS_TOKEN is not set. It is exported from ~/.zshrc —\n" +
        "start a login shell, or export it before running this script."
    );
    process.exit(1);
  }

  const [cols, cons, idx, allEnums, fns, trgs] = await Promise.all([
    query(
      `select table_name, ordinal_position, column_name, data_type, udt_name,
              character_maximum_length, numeric_precision, numeric_scale,
              is_nullable, column_default
       from information_schema.columns
       where table_schema='public' and table_name in (${tableList})
       order by table_name, ordinal_position`
    ),
    query(
      `select conrelid::regclass::text as tbl, conname, contype,
              pg_get_constraintdef(oid) as def
       from pg_constraint
       where connamespace='public'::regnamespace
         and conrelid::regclass::text in (${tableList})
       order by conrelid::regclass::text, contype, conname`
    ),
    query(
      `select tablename, indexname, indexdef from pg_indexes
       where schemaname='public' and tablename in (${tableList})
       order by tablename, indexname`
    ),
    query(
      `select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
       from pg_type t
       join pg_enum e on e.enumtypid=t.oid
       join pg_namespace n on n.oid=t.typnamespace
       where n.nspname='public'
       group by t.typname order by t.typname`
    ),
    query(
      `select p.proname, pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in (${[...TRIGGER_FNS, ...APP_FNS].map((f) => `'${f}'`).join(",")})`
    ),
    query(
      `select c.relname as tbl, t.tgname, pg_get_triggerdef(t.oid) as def
       from pg_trigger t
       join pg_class c on c.oid=t.tgrelid
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and not t.tgisinternal
         and c.relname in (${tableList})
       order by c.relname, t.tgname`
    ),
  ]);

  const byTable = {};
  for (const c of cols) (byTable[c.table_name] = byTable[c.table_name] || []).push(c);

  const missing = TABLES.filter((t) => !byTable[t]);
  if (missing.length) {
    console.error(`WARNING: these tables were not found in production: ${missing.join(", ")}`);
  }

  // Only the enum types our tables actually use — the project also defines
  // listing_status, which belongs to cre8-map's `listings` table.
  const usedEnums = new Set(
    cols.filter((c) => c.data_type === "USER-DEFINED").map((c) => c.udt_name)
  );
  const enums = allEnums.filter((e) => usedEnums.has(e.typname));

  // Primary keys, uniques and checks go inline in CREATE TABLE. Foreign keys
  // go in a separate pass at the end so table order can never break the file.
  const inlineCons = {};
  const fkCons = [];
  for (const c of cons) {
    const tbl = c.tbl.replace(/^public\./, "");
    if (c.contype === "f") fkCons.push({ tbl, name: c.conname, def: c.def });
    else (inlineCons[tbl] = inlineCons[tbl] || []).push(c);
  }

  // pg_indexes also lists the indexes backing primary-key and unique
  // constraints. Those are already emitted inline, so drop them here.
  const constraintNames = new Set(cons.map((c) => c.conname));
  const realIdx = {};
  for (const i of idx) {
    if (constraintNames.has(i.indexname)) continue;
    (realIdx[i.tablename] = realIdx[i.tablename] || []).push(i);
  }

  const fnByName = {};
  for (const f of fns) fnByName[f.proname] = f.def;

  const today = new Date().toISOString().slice(0, 10);
  const out = [];

  out.push(`-- cre8-admin — baseline schema (captured from production ${today})
--
-- Generated by scripts/capture-schema.js. Do not hand-edit: regenerate it, or
-- add a new dated migration alongside it for an incremental change.
--
-- WHY THIS FILE EXISTS
-- The tables below were created by hand in the Supabase dashboard or by
-- ad-hoc scripts, so the schema for the deal pipeline, the listings workflow,
-- market intel and the logo library existed ONLY in the live project.
-- supabase/migrations/ held six email migrations and nothing else, which
-- meant the database could not be rebuilt from the repo and there was no way
-- to stand up a staging copy.
--
-- This is a point-in-time capture of what production actually looks like,
-- read out of information_schema and pg_catalog. It is idempotent
-- (if not exists / or replace / exception-guarded DO blocks throughout), so
-- it is safe to run against the existing project, where it is a no-op.
--
-- SCOPE: the ${TABLES.length} tables cre8-admin reads. The same Supabase project also
-- hosts cre8-map's tables (sale_comps, census_tracts, zoning_sources,
-- site_plans, planning_events, …) and the PostGIS extension. Those are
-- deliberately NOT in this file — they belong to that repo.
--
-- Row Level Security is not configured on these tables and this file does not
-- add it. The admin reaches Supabase only through server-side API routes
-- using the service-role key, which bypasses RLS by design.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
`);

  // Enum types must exist before the tables whose columns use them. Postgres
  // has no "create type if not exists", so each is guarded by a DO block.
  out.push(`
-- ============================================================
-- Enum types
-- ============================================================
`);
  for (const e of enums) {
    // The API returns a Postgres array literal like "{a,b,c}".
    const labels = e.labels
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((l) => `'${l.replace(/^"|"$/g, "")}'`)
      .join(", ");
    out.push(`do $$ begin
  create type ${e.typname} as enum (${labels});
exception when duplicate_object then null; end $$;`);
  }
  out.push("");

  out.push(`
-- ============================================================
-- Trigger functions (defined first — the triggers below use them)
-- ============================================================
`);
  for (const name of TRIGGER_FNS) {
    if (fnByName[name]) out.push(lowerCreate(fnByName[name]) + ";\n");
  }

  for (const [label, tables] of GROUPS) {
    out.push(`
-- ============================================================
-- ${label}
-- ============================================================
`);

    for (const tbl of tables) {
      const tcols = byTable[tbl];
      if (!tcols) {
        out.push(`-- WARNING: ${tbl} not found in production\n`);
        continue;
      }

      const parts = tcols.map(columnLine);

      // Primary key first, then uniques, then checks — easiest to read.
      const order = { p: 0, u: 1, c: 2 };
      for (const c of (inlineCons[tbl] || []).sort(
        (a, b) => order[a.contype] - order[b.contype]
      )) {
        parts.push(`  constraint ${c.conname} ${c.def}`);
      }

      out.push(`create table if not exists ${tbl} (\n${parts.join(",\n")}\n);\n`);

      for (const i of realIdx[tbl] || []) {
        out.push(
          i.indexdef
            .replace(/^CREATE UNIQUE INDEX /, "create unique index if not exists ")
            .replace(/^CREATE INDEX /, "create index if not exists ") + ";"
        );
      }

      const ttrg = trgs.filter((t) => t.tbl === tbl);
      for (const t of ttrg) {
        // Triggers have no "if not exists", so drop first to stay idempotent.
        out.push(`drop trigger if exists ${t.tgname} on ${tbl};`);
        out.push(t.def + ";");
      }

      if ((realIdx[tbl] || []).length || ttrg.length) out.push("");
    }
  }

  out.push(`
-- ============================================================
-- Foreign keys
-- Added after every table exists so the order above doesn't matter.
-- ============================================================
`);
  for (const fk of fkCons) {
    // Postgres has no "add constraint if not exists".
    out.push(`do $$ begin
  alter table ${fk.tbl} add constraint ${fk.name} ${fk.def};
exception when duplicate_object then null; end $$;`);
  }

  out.push(`
-- ============================================================
-- Application RPCs
-- ============================================================
`);
  for (const name of APP_FNS) {
    if (fnByName[name]) out.push(lowerCreate(fnByName[name]) + ";\n");
  }

  out.push("commit;");

  const sql = out.join("\n") + "\n";

  const outIdx = process.argv.indexOf("-o");
  if (outIdx !== -1 && process.argv[outIdx + 1]) {
    fs.writeFileSync(process.argv[outIdx + 1], sql);
    console.error(
      `Wrote ${process.argv[outIdx + 1]} — ${Object.keys(byTable).length} tables, ` +
        `${enums.length} enums, ${cons.length - fkCons.length} inline constraints, ` +
        `${fkCons.length} foreign keys, ` +
        `${Object.values(realIdx).reduce((s, a) => s + a.length, 0)} indexes, ` +
        `${trgs.length} triggers, ${fns.length} functions.`
    );
  } else {
    process.stdout.write(sql);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
