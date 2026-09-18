/**
 * Pure helpers for Resend contact list/search parsing.
 * Kept free of fetch so we can unit-test shapes without an API key.
 */

/** Official Resend custom property for brokerage / firm (string). */
export const COMPANY_PROPERTY_KEY = "company";
export const COMPANY_PROPERTY_ID = "4022ee71-be02-4ed5-9947-3e21e32897d0";

const FALLBACK_COMPANY_KEYS = ["brokerage", "firm", "organization", "company_name"] as const;

export type MatchedContact = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  unsubscribed?: boolean;
  company?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Pull a scalar out of a Resend property (`"CBRE"` or `{ value: "CBRE", type: "string" }`). */
export function propertyValue(value: unknown): string {
  const direct = asString(value);
  if (direct) return direct;
  const obj = asRecord(value);
  if (!obj) return "";
  return asString(obj.value);
}

/** Company / brokerage from Resend `company` (id 4022ee71-…). Empty when unset. */
export function extractCompany(row: unknown): string {
  const obj = asRecord(row);
  if (!obj) return "";
  const props = asRecord(obj.properties);
  if (props) {
    const official = propertyValue(props[COMPANY_PROPERTY_KEY]) || propertyValue(props[COMPANY_PROPERTY_ID]);
    if (official) return official;
    for (const value of Object.values(props)) {
      const rec = asRecord(value);
      if (!rec) continue;
      const key = asString(rec.key);
      const id = asString(rec.id);
      if (key === COMPANY_PROPERTY_KEY || id === COMPANY_PROPERTY_ID) {
        const v = propertyValue(rec);
        if (v) return v;
      }
    }
    for (const key of FALLBACK_COMPANY_KEYS) {
      const v = propertyValue(props[key]);
      if (v) return v;
    }
  }
  const top = propertyValue(obj[COMPANY_PROPERTY_KEY]);
  if (top) return top;
  return "";
}

export function contactFullName(c: Pick<MatchedContact, "first_name" | "last_name">): string {
  return [c.first_name, c.last_name]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p && p.toLowerCase() !== "null")
    .join(" ");
}

/** Primary search-result line: `Full Name, Company` (company omitted when missing). */
export function formatContactPrimaryLine(c: MatchedContact): string {
  const name = contactFullName(c);
  const company = (c.company || "").trim();
  if (name && company) return `${name}, ${company}`;
  if (name) return name;
  if (company) return company;
  return (c.email || "").trim();
}

export function isUnsubscribed(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string" && /^(true|1|yes)$/i.test(value.trim())) return true;
  return false;
}

export function contactMatchesQuery(c: MatchedContact, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  const hay = [c.email || "", contactFullName(c), c.company || ""].join(" ").toLowerCase();
  return hay.includes(needle);
}

export function unwrapContact(body: unknown): MatchedContact | null {
  const obj = asRecord(body);
  if (!obj) return null;
  const row = obj.email ? obj : asRecord(obj.data);
  if (!row) return null;
  const email = asString(row.email).toLowerCase();
  if (!email) return null;
  return {
    id: asString(row.id) || email,
    email,
    first_name: asString(row.first_name) || null,
    last_name: asString(row.last_name) || null,
    unsubscribed: isUnsubscribed(row.unsubscribed),
    company: extractCompany(row),
  };
}

export function parseContactListBody(body: unknown): { rows: MatchedContact[]; hasMore: boolean } {
  const obj = asRecord(body);
  let raw: unknown = obj?.data;
  let hasMore = Boolean(obj?.has_more);

  if (raw && !Array.isArray(raw)) {
    const inner = asRecord(raw);
    if (inner) {
      raw = inner.data || inner.contacts || inner.items;
      if (typeof inner.has_more === "boolean") hasMore = inner.has_more;
    }
  }
  if (!Array.isArray(raw)) {
    raw = obj?.contacts || obj?.items || [];
  }
  const list: unknown[] = Array.isArray(raw) ? raw : [];

  const rows: MatchedContact[] = [];
  for (const item of list) {
    const c = unwrapContact(item);
    if (c) rows.push(c);
  }
  return { rows, hasMore };
}
