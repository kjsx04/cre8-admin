/**
 * Run: npx tsx src/lib/email/template-version.test.ts
 */

import {
  CURRENT_TEMPLATE_VERSION,
  canRefreshListing,
  canSyncTemplate,
  needsTemplateSync,
  selectTemplateSyncTargets,
  templateStamp,
  usesCurrentTemplate,
} from "./template-version";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

assert(CURRENT_TEMPLATE_VERSION === "2026-09-20-1", "version id");
assert(usesCurrentTemplate({ template_version: CURRENT_TEMPLATE_VERSION }), "current matches");
assert(usesCurrentTemplate({ template_version: null }), "null is current (pre-version rows)");
assert(usesCurrentTemplate({}), "missing is current");
assert(!usesCurrentTemplate({ template_version: "2010-01-01" }), "stale version is frozen");

const stamp = templateStamp(new Date("2026-09-19T12:00:00.000Z"));
assert(stamp.template_version === CURRENT_TEMPLATE_VERSION, "stamp version");
assert(stamp.template_synced_at === "2026-09-19T12:00:00.000Z", "stamp time");

assert(canSyncTemplate("draft") && canSyncTemplate("scheduled") && canSyncTemplate("active") && canSyncTemplate("paused"), "syncable statuses");
assert(!canSyncTemplate("completed") && !canSyncTemplate("cancelled"), "sent/cancelled never sync");
assert(canRefreshListing("scheduled") && !canRefreshListing("completed"), "refresh listing same gate");

assert(needsTemplateSync({ status: "scheduled", template_version: "2010-01-01" }), "stale scheduled needs sync");
assert(!needsTemplateSync({ status: "scheduled", template_version: CURRENT_TEMPLATE_VERSION }), "current scheduled skips");
assert(!needsTemplateSync({ status: "completed", template_version: "2010-01-01" }), "completed never syncs");
assert(!needsTemplateSync({ status: "draft", template_version: null }), "null version treated as current");

const picked = selectTemplateSyncTargets([
  { id: "a", status: "draft", template_version: "old" },
  { id: "b", status: "scheduled", template_version: CURRENT_TEMPLATE_VERSION },
  { id: "c", status: "completed", template_version: "old" },
  { id: "d", status: "active", template_version: "old" },
  { id: "e", status: "paused", template_version: "old" },
]);
assert(picked.map((r) => r.id).join(",") === "a,d,e", "bulk targets only stale eligible");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall template-version tests passed");
