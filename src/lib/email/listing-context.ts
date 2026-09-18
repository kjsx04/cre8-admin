/**
 * Flatten a CMS listing into factual lines for AI body copy.
 * Only known ListingFieldData keys — never invents values.
 */

import {
  BROKERS,
  LISTING_TYPES,
  ListingItem,
  PROPERTY_TYPES,
} from "@/lib/admin-constants";

export const BODY_LENGTHS = ["2-sentences", "1-paragraph", "2-paragraphs"] as const;
export type BodyLength = (typeof BODY_LENGTHS)[number];

export function isBodyLength(value: unknown): value is BodyLength {
  return typeof value === "string" && (BODY_LENGTHS as readonly string[]).includes(value);
}

function add(lines: string[], label: string, value: unknown) {
  if (value == null) return;
  if (typeof value === "boolean") {
    if (value) lines.push(`${label}: yes`);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    lines.push(`${label}: ${value}`);
    return;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (text) lines.push(`${label}: ${text}`);
}

/** Plain-text fact sheet for one listing. Empty fields are omitted. */
export function serializeListingFacts(item: ListingItem): string {
  const fd = item.fieldData || {};
  const lines: string[] = [];

  add(lines, "Name", fd.name);
  add(lines, "Address", fd["full-address"]);
  add(lines, "City / county", fd["city-county"]);
  add(lines, "Cross streets", fd["cross-streets"]);
  add(lines, "Price", fd["list-price"]);
  if (fd["square-feet"] != null) add(lines, "Acres", fd["square-feet"]);
  if (fd["building-sqft"] != null) add(lines, "Building SF", fd["building-sqft"]);
  add(lines, "Listing type", fd["listing-type-2"] ? LISTING_TYPES[fd["listing-type-2"]] || fd["listing-type-2"] : "");
  add(lines, "Property type", fd["property-type"] ? PROPERTY_TYPES[fd["property-type"]] || fd["property-type"] : "");
  add(lines, "Zoning", fd.zoning);
  add(lines, "Zoning municipality", fd["zoning-municipality"]);
  add(lines, "Overview", fd["property-overview"]);
  add(lines, "Spaces available", fd["spaces-available"]);
  add(lines, "Traffic count", fd["traffic-count"]);
  if (fd.sold) add(lines, "Status", "Sold");
  else if (fd["under-contract"]) add(lines, "Status", "Under contract");
  else if (fd.available) add(lines, "Status", "Available");
  if (fd.featured) add(lines, "Featured", true);
  if (Array.isArray(fd["listing-brokers"]) && fd["listing-brokers"].length) {
    const names = fd["listing-brokers"].map((id) => BROKERS[id] || id).filter(Boolean);
    if (names.length) add(lines, "Listing brokers", names.join(", "));
  }
  const captions = (fd.gallery || [])
    .map((img) => (img.alt || "").trim())
    .filter((alt) => alt && alt.toLowerCase() !== "null");
  if (captions.length) add(lines, "Photo captions", captions.join("; "));

  return lines.join("\n");
}

export const LENGTH_INSTRUCTIONS: Record<BodyLength, string> = {
  "2-sentences": "Write EXACTLY two sentences. No more.",
  "1-paragraph": "Write exactly one short paragraph (about 3–5 sentences). No second paragraph.",
  "2-paragraphs": "Write exactly two short paragraphs, separated by a single blank line.",
};
