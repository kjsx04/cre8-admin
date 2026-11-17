/** Eye "show all" loads every store for the tenants it turns on. Above this it is disabled. */
export const SHOW_ALL_LIMIT = 50;

export const SHOW_ALL_TOOLTIP = "Only available under 50 tenants";

export function showAllAllowed(tenantCount: number): boolean {
  return tenantCount <= SHOW_ALL_LIMIT;
}
