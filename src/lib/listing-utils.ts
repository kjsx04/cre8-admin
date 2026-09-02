/**
 * Shared listing helpers.
 */

/**
 * Build the SharePoint folder name for a listing, matching the
 * existing folder convention:
 *
 * - Cross-street listing (name starts with a direction like "NEC"):
 *   "NEC Cornman & Curry" → "Cornman & Curry — NEC"
 * - Physical address: "458 S Gilbert" + "Mesa, Maricopa" → "458 S Gilbert — Mesa"
 *
 * Used by the publish flow (SharePoint sync + sold workflow) and the
 * listing agreement upload — keep all three consistent.
 */
export function buildSpFolderName(
  listingName: string,
  cityCounty: string
): string {
  // Order matters: 3-letter corners (NEC) must match before 2-letter (NE)
  const directionPrefixes = ["NEC", "NWC", "SEC", "SWC", "NE", "NW", "SE", "SW"];
  const trimmedName = listingName.trim();

  const matchedPrefix = directionPrefixes.find((p) =>
    trimmedName.startsWith(p + " ")
  );
  if (matchedPrefix) {
    // Cross-street listing — move direction to after em dash
    const crossStreets = trimmedName.slice(matchedPrefix.length).trim();
    return `${crossStreets} — ${matchedPrefix}`;
  }

  // Physical address — append city
  const cityShort = String(cityCounty || "").split(",")[0].trim();
  return cityShort ? `${trimmedName} — ${cityShort}` : trimmedName;
}
