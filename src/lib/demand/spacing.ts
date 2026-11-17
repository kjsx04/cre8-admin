/**
 * Site spacing for a tenant is its own override when one is set.
 * Null means "use the category default". Zero is a real override (no ring).
 */
export function effectiveSpacing(
  override: number | null | undefined,
  categoryDefault: number | null | undefined
): number | null {
  if (override != null && Number.isFinite(override)) return override;
  if (categoryDefault != null && Number.isFinite(categoryDefault)) return categoryDefault;
  return null;
}
