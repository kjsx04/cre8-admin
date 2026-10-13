/**
 * Run: npx tsx src/lib/logos.test.ts
 */

import { logoDownloadUrl, logoFileName, logoMatchesQuery, planLogoUpload, slugifyLogoName } from "./logos";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

assert(slugifyLogoName("Chase Bank") === "chase-bank", "spaces become hyphens");
assert(slugifyLogoName("  AT&T  ") === "at-and-t", "ampersand is spelled out and edges are trimmed");
assert(slugifyLogoName("Café Rio") === "cafe-rio", "accents are stripped");
assert(slugifyLogoName("!!!") === "", "a name with no letters has no slug");

assert(logoFileName("chase-bank", "color") === "chase-bank.png", "color file is <slug>.png");
assert(logoFileName("chase-bank", "white") === "chase-bank-white.png", "white file keeps the -white suffix");

const url = "https://xrgfupoyaexgcrtxmqpp.supabase.co/storage/v1/object/public/logos/chase-bank.png";
assert(
  logoDownloadUrl(url, "chase-bank.png") === `image/png:chase-bank.png:${url}`,
  "drag payload points at the full-res PNG"
);

assert(logoMatchesQuery({ name: "Chase Bank", aliases: ["JPMorgan"] }, "jpm") === true, "search hits an alias");
assert(logoMatchesQuery({ name: "Chase Bank", aliases: ["JPMorgan"] }, "CHASE") === true, "search is case-insensitive");
assert(logoMatchesQuery({ name: "Chase Bank", aliases: [] }, "wells") === false, "unrelated names miss");
assert(logoMatchesQuery({ name: "Chase Bank", aliases: null }, "  ") === true, "blank search matches everything");

// 1×1 transparent PNG
const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
));

const planned = planLogoUpload({
  name: "  Test Cafe  ",
  category: "QSR & Coffee",
  aliasesRaw: "TC, tc, Test",
  bytes: png,
});
assert(planned.ok === true, "a real PNG with a known category is accepted");
if (planned.ok) {
  assert(planned.plan.slug === "test-cafe", "planned slug comes from the name");
  assert(planned.plan.width === 1 && planned.plan.height === 1, "IHDR size is read");
  assert(JSON.stringify(planned.plan.aliases) === JSON.stringify(["TC", "Test"]), "duplicate aliases collapse");
}

const badType = planLogoUpload({
  name: "Nope",
  category: "Not a category",
  aliasesRaw: "",
  bytes: png,
});
assert(badType.ok === false, "unknown categories are rejected");

const badFile = planLogoUpload({
  name: "Nope",
  category: "QSR & Coffee",
  aliasesRaw: "",
  bytes: Uint8Array.from([1, 2, 3, 4]),
});
assert(!badFile.ok && badFile.error === "File must be a PNG", "non-PNG bytes are rejected");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
