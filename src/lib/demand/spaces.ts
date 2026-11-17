import type { Deal, DemandSpace, ListingContext, SpaceType } from "./types";

export interface ListingRow {
  id: string;
  name: string;
  fullAddress?: string | null;
  cityCounty?: string | null;
  acres?: number | null;
  buildingSqft?: number | null;
  listPrice?: string | null;
  listingType?: string | null;
  propertyType?: string | null;
  zoning?: string | null;
  overview?: string | null;
  spacesHtml?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sold?: boolean | null;
}

export interface ParsedSpace {
  label: string;
  amount: number;
  unit: "sf" | "acres";
}

/** Pull suite / pad rows out of the HTML table the listing editor stores. */
export function parseSpacesHtml(html: string | null | undefined): ParsedSpace[] {
  if (!html) return [];
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const out: ParsedSpace[] = [];
  for (const row of rows) {
    const cells: string[] = [];
    const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(row))) cells.push(decode(stripTags(cellMatch[1])));
    if (cells.length < 2) continue;
    const size = parseSize(cells[1]);
    if (!size || !cells[0]) continue;
    out.push({ label: cells[0], amount: size.amount, unit: size.unit });
  }
  return out;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseSize(raw: string): { amount: number; unit: "sf" | "acres" } | null {
  const match = raw.trim().match(/^([0-9]*\.?[0-9,]+)\s*(sf|sq\.?\s*ft\.?|acres?)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, unit: /^ac/i.test(match[2]) ? "acres" : "sf" };
}

export function parseCityCounty(raw: string | null | undefined): { city: string | null; county: string | null } {
  if (!raw || !raw.trim()) return { city: null, county: null };
  const parts = raw.split(/[,/]/).map((s) => s.replace(/\bAZ\b/i, "").trim()).filter(Boolean);
  let county: string | null = null;
  const cities: string[] = [];
  for (const part of parts) {
    const cleaned = part.replace(/\s+county$/i, "").trim();
    if (/county$/i.test(part) || COUNTIES.has(cleaned.toLowerCase())) {
      if (!county) county = cleaned;
      continue;
    }
    cities.push(part);
  }
  return { city: cities[0] || null, county };
}

const COUNTIES = new Set([
  "maricopa", "pinal", "gila", "pima", "yavapai", "coconino", "yuma", "mohave",
  "cochise", "santa cruz", "graham", "greenlee", "la paz", "navajo", "apache",
]);

export function dealFromListingType(listingType: string | null | undefined): Deal {
  const text = (listingType || "").toLowerCase();
  const sale = text.includes("sale");
  const lease = text.includes("lease");
  if (sale && lease) return "both";
  if (lease) return "lease";
  if (sale) return "sale";
  return "both";
}

export function detectDriveThru(...texts: (string | null | undefined)[]): boolean | null {
  const blob = texts.filter(Boolean).join("\n");
  if (!blob.trim()) return null;
  if (/\bno\s+drive[-\s]?thr(?:u|ough)\b/i.test(blob) || /\bno\s+drivethrough\b/i.test(blob)) return false;
  if (/\bdrive[-\s]?thr(?:u|ough)\b/i.test(blob) || /\bdrivethrough\b/i.test(blob)) return true;
  return null;
}

function propertyFamily(propertyType: string): ListingContext["propertyFamily"] {
  const p = propertyType.toLowerCase();
  if (p.includes("development site") || p === "land" || p === "improved land" || p === "powered land") return "land";
  if (p.includes("medical")) return "medical";
  if (p.includes("office")) return "office";
  if (p.includes("industrial")) return "industrial";
  if (p.includes("retail") || p.includes("land")) return p.includes("land") ? "land" : "retail";
  return "other";
}

function spaceTypeFor(label: string, unit: "sf" | "acres" | null, propertyType: string): SpaceType {
  if (/end[-\s]?cap/i.test(label)) return "endcap";
  const family = propertyFamily(propertyType);
  const pads = propertyType.toLowerCase().includes("retail pads") || /pad/i.test(label);
  if (pads && family !== "land") return "pad";
  if (unit === "acres" && family === "land" && !/pad/i.test(label)) return "land parcel";
  if (unit === "acres" && pads) return "pad";
  if (unit === "sf") return "inline";
  if (family === "land") return "land parcel";
  if (propertyType.toLowerCase().includes("retail pads")) return "pad";
  return "inline";
}

/**
 * Spaces to match when the listing has no saved listing_spaces yet.
 * Pad and suite rows win over the site total — a 28 ac center with 1.3 ac pads
 * is those pads, not one 28 ac parcel.
 */
export function deriveSpaces(row: ListingRow): Omit<DemandSpace, "id">[] {
  const parsed = parseSpacesHtml(row.spacesHtml);
  const deal = dealFromListingType(row.listingType);
  const driveThru = detectDriveThru(row.name, row.overview, row.spacesHtml, row.zoning);
  const status = row.sold ? "sold" : "available";
  const propertyType = row.propertyType || "";

  if (parsed.length > 0) {
    return parsed.map((space, index) => ({
      label: space.label,
      spaceType: spaceTypeFor(space.label, space.unit, propertyType),
      acres: space.unit === "acres" ? space.amount : null,
      sf: space.unit === "sf" ? Math.round(space.amount) : null,
      driveThru,
      deal,
      priceRate: parsed.length === 1 ? row.listPrice || null : null,
      status,
      notes: null,
      sortOrder: index,
    }));
  }

  const family = propertyFamily(propertyType);
  const endcap = /end[-\s]?cap/i.test(`${row.name || ""} ${row.overview || ""}`);
  const spaceType: SpaceType =
    propertyType.toLowerCase().includes("retail pads")
      ? "pad"
      : family === "land"
        ? "land parcel"
        : endcap
          ? "endcap"
          : "inline";
  const label = spaceType === "pad" ? "Pad" : spaceType === "land parcel" ? "Parcel" : spaceType === "endcap" ? "Endcap" : "Suite";
  return [
    {
      label,
      spaceType,
      acres: spaceType === "inline" || spaceType === "endcap" ? null : row.acres ?? null,
      sf: spaceType === "inline" || spaceType === "endcap" ? row.buildingSqft ?? null : null,
      driveThru,
      deal,
      priceRate: row.listPrice || null,
      status,
      notes: null,
      sortOrder: 0,
    },
  ];
}

export function listingContext(row: ListingRow): ListingContext {
  const propertyType = row.propertyType || "";
  const { city, county } = parseCityCounty(row.cityCounty);
  return {
    id: row.id,
    name: row.name,
    city,
    county,
    marketLabel: [city, county].filter(Boolean).join(", ") || row.cityCounty || "",
    lat: row.latitude ?? null,
    lng: row.longitude ?? null,
    zoning: row.zoning ?? null,
    propertyType,
    propertyFamily: propertyFamily(propertyType),
  };
}
