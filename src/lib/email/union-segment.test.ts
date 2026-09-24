/**
 * Run: npx tsx src/lib/email/union-segment.test.ts
 *
 * Picking Buyers and Sellers used to create two broadcasts, and 883 contacts are
 * on both lists — they would have received the same email twice. These cover the
 * naming, diffing and counting that make a multi-list send go out once per person.
 */

import { unionSegmentName, unionKey, membershipDiff, membersCsv, UNION_PREFIX } from "./union-segment";
import { uniqueAcross, overlapCount, type AudienceOverlap } from "./audience-overlap";
import { isManagedAudienceName } from "./audience-count";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

// ── Naming: the same pick always resolves to the same segment ──
assert(unionSegmentName(["Buyers", "Sellers"]) === "Auto: Buyers + Sellers", "names read the way the lists do");
assert(
  unionSegmentName(["Sellers", "Buyers"]) === unionSegmentName(["Buyers", "Sellers"]),
  "pick order does not create a second segment"
);
assert(unionSegmentName([" Buyers ", "Sellers"]) === "Auto: Buyers + Sellers", "stray spaces don't fork the name");
assert(unionSegmentName(["Brokers", "Buyers", "Sellers"]) === "Auto: Brokers + Buyers + Sellers", "three lists");
assert(unionSegmentName(["Buyers", ""]) === "Auto: Buyers", "an empty name is dropped");
assert(unionSegmentName(["Buyers", "Sellers"]).startsWith(UNION_PREFIX), "managed segments carry the prefix");

// The prefix is what keeps these out of the picker
assert(isManagedAudienceName(unionSegmentName(["Buyers", "Sellers"])), "a managed segment is recognised as managed");
assert(!isManagedAudienceName("Buyers"), "a real list is not managed");
assert(!isManagedAudienceName("Automotive Investors"), "a list that merely starts with 'Auto' is not managed");

// Resend caps a segment name at 191 chars; three long list names stay well under
assert(unionSegmentName(["Brokers", "Buyers", "Sellers"]).length < 100, "the name stays short enough for Resend");

// ── Key: same ids in any order = one segment ──
assert(unionKey(["b", "a"]) === unionKey(["a", "b"]), "id order does not change the key");
assert(unionKey(["a", "a", "b"]) === unionKey(["a", "b"]), "a repeated id does not change the key");
assert(unionKey([]) === "", "no ids is an empty key");

// ── Diff: what has to change in Resend ──
const d1 = membershipDiff(["a@x.com", "b@x.com"], ["b@x.com", "c@x.com"]);
assert(d1.add.length === 1 && d1.add[0] === "c@x.com", "only the missing contact is added");
assert(d1.remove.length === 1 && d1.remove[0] === "a@x.com", "only the departed contact is removed");

const d2 = membershipDiff(["A@X.com"], ["a@x.com"]);
assert(d2.add.length === 0 && d2.remove.length === 0, "case differences are not a change");

const d3 = membershipDiff([], ["a@x.com", "b@x.com"]);
assert(d3.add.length === 2 && d3.remove.length === 0, "a brand new segment is filled, not emptied");

const d4 = membershipDiff(["a@x.com"], []);
assert(d4.remove.length === 1, "an emptied selection removes everyone");

const same = ["a@x.com", "b@x.com"];
const d5 = membershipDiff(same, same);
assert(d5.add.length === 0 && d5.remove.length === 0, "an unchanged list makes no Resend calls");

// ── CSV the bulk import accepts ──
const csv = membersCsv(["a@x.com", "b@x.com"]);
assert(csv.split("\n")[0] === "email", "the header names the column");
assert(csv.split("\n").length === 3, "one row per contact");

// ── Counting: the number the composer shows ──
// Real shape from the mirror on 2026-09-23. Groups are disjoint: each contact
// appears in exactly one, keyed by the exact set of lists it belongs to.
const BROKERS = "brokers-id";
const BUYERS = "buyers-id";
const SELLERS = "sellers-id";
const overlaps: AudienceOverlap[] = [
  { segment_ids: [BUYERS], total: 1725, subscribed: 1725 },
  { segment_ids: [SELLERS], total: 1547, subscribed: 1547 },
  { segment_ids: [BUYERS, SELLERS], total: 876, subscribed: 876 },
  { segment_ids: [BROKERS], total: 835, subscribed: 835 },
  { segment_ids: [BROKERS, SELLERS], total: 10, subscribed: 10 },
  { segment_ids: [BROKERS, BUYERS], total: 8, subscribed: 8 },
  { segment_ids: [BROKERS, BUYERS, SELLERS], total: 7, subscribed: 7 },
];

const buyersOnly = uniqueAcross(overlaps, [BUYERS]);
assert(buyersOnly?.total === 1725 + 876 + 8 + 7, `Buyers alone is every group containing Buyers (${buyersOnly?.total})`);

const both = uniqueAcross(overlaps, [BUYERS, SELLERS]);
assert(both?.total === 4173, `Buyers + Sellers is 4,173 unique people, not 5,056 (${both?.total})`);

const allThree = uniqueAcross(overlaps, [BROKERS, BUYERS, SELLERS]);
assert(allThree?.total === 5008, `all three lists is every contact (${allThree?.total})`);

assert(uniqueAcross(overlaps, []) === null, "no selection has no count");
assert(uniqueAcross([], [BUYERS]) === null, "no overlap data falls back to summing");
assert(uniqueAcross(overlaps, ["not-a-list"]) === null, "an unknown list falls back rather than showing 0");

// Unsubscribed contacts are counted but don't receive
const withOptOuts: AudienceOverlap[] = [{ segment_ids: [BUYERS], total: 100, subscribed: 96 }];
const u = uniqueAcross(withOptOuts, [BUYERS]);
assert(u?.subscribed === 96 && u?.unsubscribed === 4, "opted-out contacts are separated from recipients");

// ── The note under the picker ──
assert(overlapCount(overlaps, [BUYERS, SELLERS]) === 876 + 7, "people on both picked lists are counted once");
assert(overlapCount(overlaps, [BUYERS]) === 0, "one list has no duplicates");
assert(overlapCount(overlaps, [BROKERS, BUYERS]) === 8 + 7, "Brokers + Buyers overlap is small");
assert(overlapCount([], [BUYERS, SELLERS]) === 0, "no overlap data means no claim about duplicates");

// The count shown must never exceed the sum of the lists, and never be less
// than the biggest single list
const sumOfLists = 2616 + 2440;
assert((both?.total || 0) < sumOfLists, "the de-duplicated count is smaller than the sum");
assert((both?.total || 0) >= (buyersOnly?.total || 0), "the union is at least as big as one of its lists");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall union-segment tests passed");
