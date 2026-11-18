/**
 * Run: npx tsx src/lib/demand/store-edits.test.ts
 */
import { applyStoreEdits } from "./store-edits";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok ", msg);
}

type Store = { id: string; status: string };

const fetched: Store[] = [
  { id: "old", status: "open" },
  { id: "gone", status: "open" },
];

const kept = applyStoreEdits(fetched, [{ n: 1, op: "add", store: { id: "new", status: "signed" } }]);
assert(kept.map((store) => store.id).join() === "old,gone,new", "a pin saved during the fetch is kept when the response is stale");

const once = applyStoreEdits(
  [...fetched, { id: "new", status: "signed" }],
  [{ n: 1, op: "add", store: { id: "new", status: "signed" } }]
);
assert(once.filter((store) => store.id === "new").length === 1, "a pin the response already includes is not duplicated");

const removed = applyStoreEdits(fetched, [{ n: 1, op: "remove", id: "gone" }]);
assert(removed.map((store) => store.id).join() === "old", "a delete during the fetch is not resurrected");

const patched = applyStoreEdits(fetched, [{ n: 1, op: "patch", id: "old", patch: { status: "under_construction" } }]);
assert(patched[0].status === "under_construction", "a status edit during the fetch wins");

const restored = applyStoreEdits(fetched, [
  { n: 1, op: "remove", id: "gone" },
  { n: 2, op: "add", store: { id: "gone", status: "signed" } },
]);
assert(restored.find((store) => store.id === "gone")?.status === "signed", "undoing a delete puts the pin back");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
