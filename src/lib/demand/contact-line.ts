/** How a Demand table cell spells a contact. */
export interface ContactLine {
  name: string;
  /** Set only when the column should show the brokerage. Empty means the cell is just the name. */
  company: string;
}

/**
 * Broker cells read "Name, Company". In-house cells are the person's name,
 * because that person works for the tenant. A missing half is left off.
 */
export function contactLine(
  name: string | null | undefined,
  company: string | null | undefined,
  showCompany: boolean
): ContactLine | null {
  const person = (name || "").trim();
  const firm = showCompany ? (company || "").trim() : "";
  if (!person && !firm) return null;
  return { name: person, company: firm };
}
