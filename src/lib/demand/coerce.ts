export function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function asBoolean(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  return null;
}

export function asString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export class DemandError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function fromSupabase(error: { message: string }, what: string): DemandError {
  console.error(`[demand] ${what}:`, error.message);
  if (/relation .* does not exist|schema cache|Could not find the table/i.test(error.message)) {
    return new DemandError(
      "Demand tables are not in the database yet. Apply supabase/migrations/2026-11-17_demand.sql first.",
      503
    );
  }
  return new DemandError(error.message, 500);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
