/**
 * Run: npx tsx src/lib/email/schedule-dates.test.ts
 *
 * The calendar displays Sunday → Saturday, but the AI scheduler still reasons in
 * Monday → Sunday weeks. Those two framings only differ at the weekend, and the
 * scheduler never places a send there — but the planner has to hand the
 * optimizer the right Monday or it would rebalance the wrong week.
 */

import {
  startOfWeekSunday,
  startOfWeekMonday,
  weekKeys,
  plannerKeys,
  monthGridKeys,
  rangeLabel,
  addDays,
  isWeekend,
  PLANNER_DAYS,
} from "./schedule-dates";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

// 2026-09-23 is a Wednesday
const WED = "2026-09-23";

// ── Sunday-first weeks ──
assert(startOfWeekSunday(WED) === "2026-09-20", "the week containing Wed Sep 23 starts Sun Sep 20");
assert(startOfWeekSunday("2026-09-20") === "2026-09-20", "a Sunday is its own week start");
assert(startOfWeekSunday("2026-09-26") === "2026-09-20", "Saturday belongs to the week that began the Sunday before");
assert(startOfWeekSunday("2026-09-27") === "2026-09-27", "the next Sunday starts a new week");

const week = weekKeys(startOfWeekSunday(WED));
assert(week.length === 7, "a week is seven days");
assert(week[0] === "2026-09-20" && week[6] === "2026-09-26", "the week runs Sunday to Saturday");
assert(isWeekend(week[0]) && isWeekend(week[6]), "the weekend sits at both ends");
assert(!week.slice(1, 6).some(isWeekend), "the five weekdays are in the middle");

// ── Two-week planner ──
const planner = plannerKeys(startOfWeekSunday(WED));
assert(PLANNER_DAYS === 14, "the planner spans a fortnight");
assert(planner.length === 14, "fourteen day columns");
assert(planner[0] === "2026-09-20", "it opens on the Sunday of the current week");
assert(planner[13] === "2026-10-03", "it closes on the Saturday two weeks later");
assert(planner[7] === "2026-09-27", "the second row starts on the following Sunday");

// Paging a fortnight lands exactly where the last one ended, with no gap or repeat
const next = plannerKeys(addDays(startOfWeekSunday(WED), PLANNER_DAYS));
assert(next[0] === addDays(planner[13], 1), "paging forward continues the day after the last one shown");
assert(!next.some((k) => planner.includes(k)), "paging forward never repeats a day");

// ── Handing the optimizer the right Monday ──
// The planner shows Sun–Sat rows; optimizeWeek() snaps its argument to a Monday.
const displayStart = startOfWeekSunday(WED);
for (const offset of [1, 8]) {
  const handed = addDays(displayStart, offset);
  const monday = startOfWeekMonday(handed);
  assert(monday === handed, `offset ${offset} lands exactly on a Monday (${monday})`);
  const rowStart = addDays(displayStart, offset - 1);
  const rowKeys = weekKeys(rowStart);
  assert(rowKeys.includes(monday), `that Monday is inside the displayed row starting ${rowStart}`);
  // Every weekday of the displayed row belongs to the week the optimizer will touch
  const weekdaysShown = rowKeys.filter((k) => !isWeekend(k));
  const weekdaysOptimized = weekKeys(monday).filter((k) => !isWeekend(k));
  assert(
    weekdaysShown.every((k) => weekdaysOptimized.includes(k)),
    `every weekday shown in that row is one the optimizer covers (offset ${offset})`
  );
}

// The naive version would have been wrong: handing it the Sunday snaps backwards
assert(
  startOfWeekMonday(displayStart) === addDays(displayStart, -6),
  "handing the optimizer the Sunday would have rebalanced the PREVIOUS week"
);

// ── Month grid ──
const grid = monthGridKeys("2026-09-15");
assert(grid.length === 42, "six rows of seven");
assert(!isWeekend(grid[1]), "the second cell is a Monday, so the first is a Sunday");
assert(isWeekend(grid[0]), "the grid opens on a weekend day");
assert(startOfWeekSunday(grid[0]) === grid[0], "the grid opens on a Sunday");
assert(grid.includes("2026-09-01") && grid.includes("2026-09-30"), "the whole month is covered");
for (let i = 0; i < 42; i += 7) {
  assert(startOfWeekSunday(grid[i]) === grid[i], `row ${i / 7 + 1} starts on a Sunday`);
}

// ── Labels ──
assert(rangeLabel("2026-09-20", "2026-09-26") === "Sep 20 – 26, 2026", "a single week reads as one month");
assert(rangeLabel("2026-09-20", "2026-10-03") === "Sep 20 – Oct 3, 2026", "a fortnight crossing a month names both");
assert(rangeLabel("2026-12-27", "2027-01-09") === "Dec 27, 2026 – Jan 9, 2027", "crossing a year names both years");

// ── Past / today comparison the calendar relies on ──
// Day keys are YYYY-MM-DD, so plain string comparison is chronological
assert("2026-09-22" < "2026-09-23", "a key from yesterday sorts before today");
assert(!("2026-09-24" < "2026-09-23"), "a key from tomorrow does not");
assert("2026-09-30" < "2026-10-01", "the comparison holds across a month boundary");
assert("2026-12-31" < "2027-01-01", "and across a year boundary");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall schedule-dates tests passed");
