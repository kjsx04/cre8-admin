/**
 * Run: npx tsx src/lib/logos.test.ts
 */

import { listVariants, logoCategories, logoDownloadUrl, logoFileName, logoMatchesQuery, planLogoUpload, selectLogoVariant, slugifyLogoName, variantLabel } from "./logos";

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
assert(
  logoFileName("chase-bank", "wordmark", "https://xrgfupoyaexgcrtxmqpp.supabase.co/storage/v1/object/public/logos/chase-bank-wordmark.png") === "chase-bank-wordmark.png",
  "extra variants download as the file named in the URL"
);
assert(logoFileName("chase-bank", "icon-white") === "chase-bank-icon-white.png", "a variant without a URL still gets a slug-key name");
assert(variantLabel("icon-white") === "Icon white", "icon-white has a short pill label");
assert(variantLabel("horizontal") === "Horizontal", "unknown keys are title-cased");

const options = listVariants({
  stacked: "https://example.com/stacked.png",
  white: "https://example.com/white.png",
  icon: "",
  wordmark: "https://example.com/wordmark.png",
  color: "https://example.com/color.png",
  badge: "https://example.com/badge.png",
});
assert(
  JSON.stringify(options.map((o) => o.key)) === JSON.stringify(["color", "white", "wordmark", "stacked", "badge"]),
  "variants are ordered and empty urls are dropped"
);

const sample = {
  color: "https://example.com/color.png",
  white: "https://example.com/white.png",
  icon: "https://example.com/icon.png",
  "icon-white": "https://example.com/icon-white.png",
};
assert(selectLogoVariant(sample, { tone: "color", shape: "full" })?.key === "color", "full logo defaults to color");
assert(selectLogoVariant(sample, { tone: "white", shape: "full" })?.key === "white", "white toggle uses the white file");
assert(selectLogoVariant({ color: sample.color }, { tone: "white", shape: "full" })?.key === "color", "missing white falls back to color");
assert(selectLogoVariant(sample, { tone: "color", shape: "icon" })?.key === "icon", "icon toggle uses the icon file");
assert(selectLogoVariant(sample, { tone: "white", shape: "icon" })?.key === "icon-white", "white icon uses icon-white");
assert(
  selectLogoVariant({ color: sample.color, white: sample.white, icon: sample.icon }, { tone: "white", shape: "icon" })?.key === "icon",
  "a color icon stands in when icon-white is missing"
);
assert(
  selectLogoVariant({ color: sample.color, white: sample.white }, { tone: "white", shape: "icon" })?.key === "white",
  "no icon falls back to the full logo"
);
assert(
  selectLogoVariant({ color: sample.color }, { tone: "white", shape: "icon" })?.key === "color",
  "no icon and no white falls back to color"
);
assert(selectLogoVariant({}, { tone: "color", shape: "full" }) === null, "an empty variant map selects nothing");

assert(
  JSON.stringify(logoCategories([
    { category: "Hotels" },
    { category: "  Fast Casual & Snacks " },
    { category: "Hotels" },
    { category: "" },
    { category: "Cities & Downtowns" },
    { category: null },
  ])) === JSON.stringify(["Cities & Downtowns", "Fast Casual & Snacks", "Hotels"]),
  "category chips are the unique names, sorted"
);

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
