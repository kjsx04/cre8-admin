/**
 * Demand categories, after the cleanup to 20 proper-case names.
 * Older rows (and a few tenants) still use the previous labels.
 * Comparisons go through categoryKey so both spellings hit the same default.
 */

export const DEMAND_CATEGORIES = [
  "QSR",
  "Casual Dining",
  "Auto Service",
  "Big Box",
  "Fast Casual",
  "C-Store/Fuel",
  "Specialty Retail",
  "Fitness",
  "Grocery",
  "Bank/Credit Union",
  "Car Wash",
  "Entertainment",
  "Services",
  "Medical/Dental",
  "Coffee",
  "Pet",
  "Childcare",
  "Pharmacy",
  "Self-Storage",
  "Hotel",
] as const;

export type DemandCategory = (typeof DEMAND_CATEGORIES)[number];

/** Retired labels that mean one of the 20. Keys are already passed through categoryKey. */
const ALIASES: Record<string, string> = {
  "qsr w drive thru": "qsr",
  "qsr with drive thru": "qsr",
  "coffee drive thru": "coffee",
  "fuel c store jobber": "c store fuel",
  bank: "bank credit union",
  daycare: "childcare",
  "self storage truck rental": "self storage",
  medical: "medical dental",
};

const CANONICAL = new Map(DEMAND_CATEGORIES.map((name) => [categoryKey(name), name]));

/**
 * Lowercase, trim, and treat spaces, hyphens, and slashes as the same separator.
 * Then fold a few retired labels onto the current name.
 */
export function categoryKey(value: string | null | undefined): string {
  const flat = (value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[flat] || flat;
}

export function sameCategory(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = categoryKey(a);
  const right = categoryKey(b);
  return left.length > 0 && left === right;
}

export function isMedicalDental(category: string | null | undefined): boolean {
  return categoryKey(category) === categoryKey("Medical/Dental");
}

export function isDemandCategory(value: string): value is DemandCategory {
  return (DEMAND_CATEGORIES as readonly string[]).includes(value);
}

/** Same 20 names, kept for the list editor and its tests. */
export const CANONICAL_CATEGORIES = DEMAND_CATEGORIES;

export function isCanonicalCategory(value: string): boolean {
  return isDemandCategory(value);
}

/** Options for a tenant editor. Keeps a legacy value visible so editing doesn't blank it. */
export function categoryOptions(current: string | null | undefined): string[] {
  const name = (current || "").trim();
  if (name && !isDemandCategory(name)) return [name, ...DEMAND_CATEGORIES];
  return [...DEMAND_CATEGORIES];
}

function preferCategoryName(candidate: string, current: string): boolean {
  const canonical = CANONICAL.get(categoryKey(candidate));
  if (canonical && candidate === canonical && current !== canonical) return true;
  if (canonical && current === canonical) return false;
  const candidateProper = candidate !== candidate.toLowerCase();
  const currentProper = current !== current.toLowerCase();
  return candidateProper && !currentProper;
}

/** One row per category key. When an old and a new row both exist, the proper-case name wins. */
export function indexByCategory<T extends { category: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = categoryKey(row.category);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || preferCategoryName(row.category, prev.category)) map.set(key, row);
  }
  return map;
}

export function lookupCategory<T extends { category: string }>(rows: T[], category: string | null | undefined): T | null {
  if (!category) return null;
  return indexByCategory(rows).get(categoryKey(category)) ?? null;
}
