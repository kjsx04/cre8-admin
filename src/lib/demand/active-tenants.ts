/**
 * The map's left column keeps activated tenants in a pinned group.
 * Search narrows the list under that group and leaves the pinned group alone.
 */

export interface TenantListItem {
  id: string;
  brandName: string;
  category: string;
}

export function tenantMatchesQuery(brand: Pick<TenantListItem, "brandName" | "category">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${brand.brandName} ${brand.category}`.toLowerCase().includes(q);
}

/**
 * `activeIds` is the pinned order (newest first when a row was just chosen).
 * Ids missing from `brands` are dropped. The list keeps `brands` order.
 */
export function partitionTenants<T extends TenantListItem>(
  brands: T[],
  activeIds: string[],
  query: string
): { active: T[]; list: T[] } {
  const byId = new Map(brands.map((brand) => [brand.id, brand]));
  const active: T[] = [];
  const seen = new Set<string>();
  for (const id of activeIds) {
    const brand = byId.get(id);
    if (!brand || seen.has(brand.id)) continue;
    seen.add(brand.id);
    active.push(brand);
  }
  const list = brands.filter((brand) => !seen.has(brand.id) && tenantMatchesQuery(brand, query));
  return { active, list };
}
