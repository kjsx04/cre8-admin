/**
 * Standard choices for the listing form's dropdowns.
 *
 * Three listing fields used to be typed by hand and ended up with dozens of
 * spellings (City / County had 38 across 64 listings; List Price had three
 * capitalisations of "Call for Pricing"). The form now offers dropdowns and
 * writes ONE standard spelling. Each field is still saved to Webflow as plain
 * text in the same field as before — nothing about how a listing is stored or
 * published changes.
 *
 * IMPORTANT: a listing's stored value is only rewritten when someone actually
 * changes that field. Opening and saving an old listing leaves "Queen Creek /
 * Maricopa" exactly as it was. (The SharePoint folder name is built from the
 * City / County text, so silently rewriting it could point a listing at a new
 * folder.)
 *
 * To add a city: add it to CITY_TABLE in src/lib/demand/markets.ts — the
 * dropdowns here read from that one list.
 */

import { AZ_CITY_OPTIONS, AZ_COUNTY_NAMES, standardPlace } from "@/lib/demand/markets";

export { AZ_CITY_OPTIONS, AZ_COUNTY_NAMES };

// ============================================================
// CITY / COUNTY
// ============================================================

/** The one way City / County is written: "Mesa, Maricopa County, AZ". */
export function formatCityCounty(city: string | null | undefined, county: string | null | undefined): string {
  const cityText = String(city || "").trim();
  const countyText = String(county || "").replace(/\s+county$/i, "").trim();
  const parts: string[] = [];
  if (cityText) parts.push(cityText);
  if (countyText) parts.push(`${countyText} County`);
  if (parts.length === 0) return "";
  return `${parts.join(", ")}, AZ`;
}

/** Reads whatever is stored ("Queen Creek / Maricopa") into a city and a county for the dropdowns. */
export function readCityCounty(stored: string | null | undefined): { city: string; county: string; cityIsStandard: boolean } {
  const place = standardPlace(stored);
  const city = place.city || "";
  return {
    city,
    county: place.county || "",
    cityIsStandard: AZ_CITY_OPTIONS.some((option) => option.city === city),
  };
}

/** The county a standard city is in ("Mesa" → "Maricopa"), or "" if the city isn't in the list. */
export function countyForCity(city: string): string {
  return AZ_CITY_OPTIONS.find((option) => option.city === city)?.county || "";
}

// ============================================================
// ZONING MUNICIPALITY
// ============================================================

/**
 * Who sets the zoning: a city / town, or the county for unincorporated land.
 * Written the way most listings already had it: "Mesa", "Pinal County".
 */
export const MUNICIPALITY_OPTIONS: string[] = [
  ...AZ_CITY_OPTIONS.map((option) => option.city),
  ...AZ_COUNTY_NAMES.map((name) => `${name} County`),
].sort((a, b) => a.localeCompare(b));

/** "Town of Queen Creek" → "Queen Creek" when that is one of the standard choices; otherwise the text as typed. */
export function readMunicipality(stored: string | null | undefined): { value: string; isStandard: boolean } {
  const text = String(stored || "").trim();
  if (!text) return { value: "", isStandard: true };
  const stripped = text.replace(/^(city|town)\s+of\s+/i, "").trim();
  const match = MUNICIPALITY_OPTIONS.find((option) => option.toLowerCase() === stripped.toLowerCase());
  return match ? { value: match, isStandard: true } : { value: text, isStandard: false };
}

// ============================================================
// LIST PRICE
// ============================================================

/** The one spelling of the no-price text. */
export const CALL_FOR_PRICING = "Call for Pricing";

export function isCallForPricing(value: string | null | undefined): boolean {
  return /^\s*call\s+for\s+pricing\s*$/i.test(String(value || ""));
}

/**
 * Tidies a typed price when the box loses focus:
 *   "call for pricing" (any capitals) → "Call for Pricing"
 *   "2200000" / "2,200,000" / "$2200000" → "$2,200,000"
 * Anything else ("$18.50/SF NNN", "$2.2M") is left exactly as typed.
 */
export function tidyPrice(typed: string | null | undefined): string {
  const text = String(typed || "").trim();
  if (!text) return "";
  if (isCallForPricing(text)) return CALL_FOR_PRICING;
  const plain = text.match(/^\$?\s*([\d,]+)(\.\d{1,2})?$/);
  if (!plain) return text;
  const whole = Number(plain[1].replace(/,/g, ""));
  // Small numbers are rents or rates ("18.50"), not sale prices — leave them alone.
  if (!Number.isFinite(whole) || whole < 1000) return text;
  const cents = plain[2] && Number(plain[2]) > 0 ? plain[2] : "";
  return `$${whole.toLocaleString("en-US")}${cents}`;
}

// ============================================================
// ZONING (suggestions only — codes differ in every city, so this stays a text box)
// ============================================================

/** Shown as type-ahead suggestions under the Zoning box. Anything can still be typed. */
export const ZONING_SUGGESTIONS: string[] = [
  "AG", "RU-43", "R1-43", "R1-6",
  "C-1", "C-2", "C-3", "C-O", "NC", "GC", "LC", "CB-1", "CB-2", "B-2", "GR",
  "LI", "GI", "I-1", "I-2", "I-P", "BP", "PEP",
  "PAD", "PUD", "MPC", "MU",
];
