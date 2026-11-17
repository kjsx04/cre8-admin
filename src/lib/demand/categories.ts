/**
 * The 20 categories tenants are filed under.
 * Older rows may still carry a legacy label; the editor keeps that label
 * available until someone picks one of these.
 */
export const CANONICAL_CATEGORIES = [
  "Auto Service",
  "Bank/Credit Union",
  "Big Box",
  "C-Store/Fuel",
  "Car Wash",
  "Casual Dining",
  "Childcare",
  "Coffee",
  "Entertainment",
  "Fast Casual",
  "Fitness",
  "Grocery",
  "Hotel",
  "Medical/Dental",
  "Pet",
  "Pharmacy",
  "QSR",
  "Self-Storage",
  "Services",
  "Specialty Retail",
] as const;

export function isCanonicalCategory(value: string): boolean {
  return (CANONICAL_CATEGORIES as readonly string[]).includes(value);
}
