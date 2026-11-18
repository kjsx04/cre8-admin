/**
 * The map's left column groups tenants by category.
 * Search narrows every category. Who is on the map is tracked separately.
 */

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

export function tenantMatchesQuery(brand: Pick<TenantListItem, "brandName" | "category">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${brand.brandName} ${brand.category}`.toLowerCase().includes(q);
}

/**
 * Categories with no matching tenants are omitted.
 * With a listing, `shown` is the Top (optimal) fits in score order.
 * Without one, `shown` is the whole category in brand-name order, which is the list the map uses today.
 */
export function groupMapCategories<T extends TenantListItem>(
  brands: T[],
  query: string,
  fits: Map<string, MapFit> | null
): MapCategory<T>[] {
  const byCategory = new Map<string, T[]>();
  for (const brand of brands) {
    if (!tenantMatchesQuery(brand, query)) continue;
    const list = byCategory.get(brand.category) || [];
    list.push(brand);
    byCategory.set(brand.category, list);
  }
  return Array.from(byCategory.entries())
    .filter(([, list]) => list.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, list]) => {
      const all = list.slice().sort((a, b) => compareTenants(a, b, fits));
      const shown = fits ? all.filter((brand) => fits.get(brand.id)?.bucket === "optimal") : all;
      return { category, count: all.length, shown, all };
    });
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
