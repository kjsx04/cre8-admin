/**
 * Reads a number someone typed into a Demand form box.
 *
 * People type "2,500", "2,500 SF", "1.5 ac" or "3 mi". The old code handed
 * that straight to Number(), got "not a number", and saved the box as BLANK
 * while showing a "Saved" message — silently wiping the value.
 *
 * Now:
 *   - commas, spaces and a trailing unit (SF, sq ft, ac, acres, mi, miles) are accepted
 *   - an empty box is a real blank (value null, ok true)
 *   - anything else is an error (ok false), so the form can refuse to save
 */

export interface TypedNumber {
  /** The number, or null for an empty box. */
  value: number | null;
  /** False when something was typed that isn't a number. */
  ok: boolean;
}

export function readTypedNumber(raw: string | null | undefined): TypedNumber {
  const text = String(raw ?? "").trim();
  if (!text) return { value: null, ok: true };

  const cleaned = text
    .toLowerCase()
    .replace(/,/g, "")
    // a unit at the end: "sf", "sq ft", "sq. ft.", "ac", "acre(s)", "mi", "mile(s)"
    .replace(/\s*(sq\.?\s*ft\.?|sf|acres?|ac|miles?|mi)\.?$/, "")
    .trim();

  // digits with an optional decimal part — nothing else
  if (!/^\d*\.?\d+$/.test(cleaned) && !/^\d+\.$/.test(cleaned)) return { value: null, ok: false };

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return { value: null, ok: false };
  return { value, ok: true };
}
