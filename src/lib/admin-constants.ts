/**
 * Admin Dashboard Constants
 *
 * All Webflow CMS option IDs, broker info, and API config
 * for the listings management dashboard.
 */

// Cloudflare Worker proxy URL
export const API_BASE = "https://cre8-api-proxy.kjsx04.workers.dev";

// Mapbox config (same token as cre8-map — set in Vercel env vars)
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
export const PHX_CENTER: [number, number] = [-111.94, 33.45];
export const PHX_ZOOM = 9.5;

// SharePoint site URL
export const SP_SITE_URL =
  "https://cre8advisors.sharepoint.com/sites/CRE8Operations";

// ---- Listing Type option IDs → display names ----
export const LISTING_TYPES: Record<string, string> = {
  "844ae85d08f5a68c907ac4be3eb984ea": "For Sale",
  "bc83ed2759c79020a9a4428cbe30da2f": "For Lease",
  "13f04de01e08de37ea5f8ec4427d2dc4": "Sale / Lease",
};

// Reverse lookup: display name → option ID
export const LISTING_TYPES_REV: Record<string, string> = Object.fromEntries(
  Object.entries(LISTING_TYPES).map(([k, v]) => [v, k])
);

// ---- Property Type option IDs → display names ----
export const PROPERTY_TYPES: Record<string, string> = {
  "65a0153353ea95ab735bf02fe556ce7f": "Retail",
  "62d84a03cece728ffd8c343eecd82684": "Retail Pads",
  "ce6a96d500dbb4713d567b48d21b72c7": "Retail Development Site",
  "c25687914772fa3ea205f474b8a964c1": "Industrial",
  "5bbeb7ce34d4c7183067446b261d0696": "Powered Land",
  "4eb9d1d3ec6d0462232cb066da667813": "Industrial Development Site",
  "9e45605ad4788d429493e0d1a88bf4a6": "Medical",
  "8e7ecd439b659a4be06a867ab6e6b126": "Office",
  "1e01fc2af78fe67044bfde09e9e9c4e1": "Land",
  "c5a5745aa5ce2d446f03636b31d8c661": "Improved Land",
};

// Short display names for the dashboard table
export const PROPERTY_TYPES_SHORT: Record<string, string> = {
  "65a0153353ea95ab735bf02fe556ce7f": "Retail",
  "62d84a03cece728ffd8c343eecd82684": "Retail Pads",
  "ce6a96d500dbb4713d567b48d21b72c7": "Retail Dev Site",
  "c25687914772fa3ea205f474b8a964c1": "Industrial",
  "5bbeb7ce34d4c7183067446b261d0696": "Powered Land",
  "4eb9d1d3ec6d0462232cb066da667813": "Industrial Dev Site",
  "9e45605ad4788d429493e0d1a88bf4a6": "Medical",
  "8e7ecd439b659a4be06a867ab6e6b126": "Office",
  "1e01fc2af78fe67044bfde09e9e9c4e1": "Land",
  "c5a5745aa5ce2d446f03636b31d8c661": "Improved Land",
};

// Reverse lookup: display name → option ID
export const PROPERTY_TYPES_REV: Record<string, string> = Object.fromEntries(
  Object.entries(PROPERTY_TYPES).map(([k, v]) => [v, k])
);

// ---- Brokers (Webflow Team collection item IDs) ----
export const BROKERS: Record<string, string> = {
  "6987ab84b1ac0ee1e143f72f": "Rommie Mojahed",
  "6987abdaa473a39098593f50": "Andy Kroot",
  "6987fada67c88dd8b9b89e39": "Lindsey Dulle",
  "6987fb2fa8757569eefd70fa": "Chad Shipley",
  "6987fb6d372758be66e14cb8": "Kevin Smith",
};

export const BROKER_CONTACTS: Record<
  string,
  { email: string; phone: string }
> = {
  "6987ab84b1ac0ee1e143f72f": {
    email: "Rommie@cre8Advisors.com",
    phone: "602.702.4663",
  },
  "6987abdaa473a39098593f50": {
    email: "Andy@CRE8Advisors.com",
    phone: "602.430.8589",
  },
  "6987fada67c88dd8b9b89e39": {
    email: "Lindsey@cre8advisors.com",
    phone: "602.317.7713",
  },
  "6987fb2fa8757569eefd70fa": {
    email: "Chad@cre8advisors.com",
    phone: "480.220.5954",
  },
  "6987fb6d372758be66e14cb8": {
    email: "Kevin@cre8advisors.com",
    phone: "518.428.8316",
  },
};

// ---- Helper: find the broker ID for a signed-in user's email ----
// Matches the MSAL account email against BROKER_CONTACTS (case-insensitive).
// Returns null when the user isn't one of the 5 brokers (e.g. admin account).
export function brokerIdForEmail(email?: string | null): string | null {
  if (!email) return null;
  const lower = email.trim().toLowerCase();
  for (const [id, contact] of Object.entries(BROKER_CONTACTS)) {
    if (contact.email.toLowerCase() === lower) return id;
  }
  return null;
}

// ---- TypeScript types for Webflow CMS listing items ----
export interface ListingFieldData {
  name?: string;
  slug?: string;
  "full-address"?: string;
  "city-county"?: string;
  "square-feet"?: number; // Actually stores acres (Webflow quirk)
  "building-sqft"?: number;
  "list-price"?: string;
  "listing-type-2"?: string;
  "property-type"?: string;
  zoning?: string;
  "zoning-municipality"?: string;
  "property-overview"?: string;
  "listing-brokers"?: string[];
  latitude?: number;
  longitude?: number;
  "google-maps-link"?: string;
  available?: boolean;
  sold?: boolean;
  featured?: boolean;
  floorplan?: { url: string; alt: string };
  gallery?: { url: string; alt: string }[];
  "package-2"?: string;
  "alta-survey-2"?: string;
  "site-plan-2"?: string;
  "spaces-available"?: string;
  "cross-streets"?: string;
  "traffic-count"?: string;
  "drone-hero"?: boolean;
}

export interface ListingItem {
  id: string;
  isDraft?: boolean;
  isArchived?: boolean;
  lastPublished?: string;
  lastUpdated?: string;
  fieldData: ListingFieldData;
}

// ---- Helper: determine listing status ----
export function getListingStatus(item: ListingItem): "Live" | "Draft" | "Sold" {
  const fd = item.fieldData || {};
  if (fd.sold) return "Sold";
  if (item.isDraft || !item.lastPublished) return "Draft";
  return "Live";
}

// ---- Helper: format date like "Feb 28" ----
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(dateStr?: string): string {
  if (!dateStr) return "\u2014";
  const dt = new Date(dateStr);
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

// ---- Helper: get city from "City, County, State" string ----
export function cityShort(cityCounty?: string): string {
  if (!cityCounty) return "\u2014";
  return cityCounty.split(",")[0].trim();
}

// ---- Helper: generate URL slug from listing name ----
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // strip special chars
    .replace(/\s+/g, "-")          // spaces → dashes
    .replace(/-+/g, "-")           // collapse multiple dashes
    .replace(/^-|-$/g, "");        // trim leading/trailing dashes
}
