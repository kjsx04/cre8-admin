/**
 * The map's left column and the Demand list group tenants by category.
 * Search narrows every category. Who is on the map is tracked separately.
 * Case variants and retired labels share one header via categoryKey.
 * The map lists every tenant; one with no stored locations shows "No locations"
 * and can be given its first pin with the + button.
 */

import { categoryKey, categoryLabel } from "./categories";

export interface TenantListItem {
  id: string;
  brandName: string;
  category: string;
}

export interface MapFit {
  bucket: "optimal" | "possible" | "excluded";
  score: number;
}

export interface MapCategory<T extends TenantListItem> {
  category: string;
  count: number;
  /** Default rows: Top fits, or the full category when no listing is selected. */
  shown: T[];
  /** Every matching tenant, Top first. */
  all: T[];
}

const BUCKET_RANK = { optimal: 0, possible: 1, excluded: 2 };

/** The map fits a tenant's locations only when nothing else is on the map. */
export function fitOnFirstShow(shownBefore: number): boolean {
  return shownBefore === 0;
}

/**
 * Tenants that have at least one stored location.
 * The Demand map no longer uses this (it lists everyone, so a tenant with no
 * stores can get its first pin); kept for views that only want drawable tenants.
 */
export function withMapLocations<T extends { locationCount: number }>(brands: T[]): T[] {
  return brands.filter((brand) => brand.locationCount > 0);
}

export function tenantMatchesQuery(brand: Pick<TenantListItem, "brandName" | "category">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${brand.brandName} ${brand.category}`.toLowerCase().includes(q);
}

/**
 * Categories with no matching tenants are omitted.
 * With a listing, `shown` is the Top (optimal) fits in score order.
 * Without one, `shown` is the whole category in brand-name order.
 * Headers start collapsed. A listing still shows `shown` until the user
 * clicks; an explicit collapse then hides every row.
 */
export function groupMapCategories<T extends TenantListItem>(
  brands: T[],
  query: string,
  fits: Map<string, MapFit> | null
): MapCategory<T>[] {
  const byCategory = new Map<string, { label: string; list: T[] }>();
  for (const brand of brands) {
    if (!tenantMatchesQuery(brand, query)) continue;
    const key = categoryKey(brand.category) || "other";
    const entry = byCategory.get(key);
    if (entry) entry.list.push(brand);
    else byCategory.set(key, { label: categoryLabel(brand.category), list: [brand] });
  }
  return Array.from(byCategory.values())
    .filter((entry) => entry.list.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(({ label, list }) => {
      const all = list.slice().sort((a, b) => compareTenants(a, b, fits));
      const shown = fits ? all.filter((brand) => fits.get(brand.id)?.bucket === "optimal") : all;
      return { category: label, count: all.length, shown, all };
    });
}

/**
 * The triangle is open when any tenant rows are showing.
 * Search forces that. A stored true or false is an explicit click and wins,
 * including over Top. With no click yet, a listing is open only while it has
 * Top rows, and All listings starts closed.
 */
export function categoryIsOpen(
  category: string,
  opened: Readonly<Record<string, boolean>>,
  searching: boolean,
  listingSelected: boolean,
  topCount: number
): boolean {
  if (searching) return true;
  if (Object.prototype.hasOwnProperty.call(opened, category)) return opened[category];
  return listingSelected && topCount > 0;
}

/**
 * Search shows every match. An explicit collapse hides every row, including
 * Top and tenants on the map. Before any click, a listing shows Top and
 * All listings shows nothing.
 */
export function categoryRows<T extends TenantListItem>(
  group: MapCategory<T>,
  opened: Readonly<Record<string, boolean>>,
  searching: boolean,
  listingSelected: boolean
): T[] {
  if (searching) return group.all;
  if (Object.prototype.hasOwnProperty.call(opened, group.category)) {
    return opened[group.category] ? group.all : [];
  }
  return listingSelected ? group.shown : [];
}

/**
 * Clicking the header or its triangle hides every row when any are visible,
 * and shows the whole category otherwise. Search does not record a click.
 */
export function toggleCategoryDisclosure(
  category: string,
  opened: Readonly<Record<string, boolean>>,
  searching: boolean,
  listingSelected: boolean,
  topCount: number
): Record<string, boolean> {
  if (searching) return opened;
  const open = categoryIsOpen(category, opened, false, listingSelected, topCount);
  return { ...opened, [category]: !open };
}

function compareTenants(a: TenantListItem, b: TenantListItem, fits: Map<string, MapFit> | null): number {
  if (!fits) return a.brandName.localeCompare(b.brandName);
  const left = fits.get(a.id);
  const right = fits.get(b.id);
  const leftRank = left ? BUCKET_RANK[left.bucket] : 3;
  const rightRank = right ? BUCKET_RANK[right.bucket] : 3;
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftScore = left?.score ?? 0;
  const rightScore = right?.score ?? 0;
  if (leftScore !== rightScore) return rightScore - leftScore;
  return a.brandName.localeCompare(b.brandName);
}
