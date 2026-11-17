import type { Confidence, ContactType } from "./types";
import { normalizeFormats } from "./match";

export const TENANT_CSV_HEADERS = [
  "brand_name",
  "category",
  "subcategory",
  "formats",
  "sf_min",
  "sf_max",
  "acres_min",
  "acres_max",
  "size_tiers",
  "drive_thru_required",
  "az_markets",
  "spacing_miles",
  "requirement_source",
  "requirement_date",
  "notes",
  "active",
] as const;

export const CONTACT_CSV_HEADERS = [
  "brand_name",
  "contact_type",
  "firm_name",
  "name",
  "title",
  "email",
  "phone",
  "is_primary",
  "source",
  "confidence",
  "last_verified",
] as const;

export interface CsvError {
  row: number;
  message: string;
}

export interface TenantCsvRow {
  brandName: string;
  category: string;
  subcategory: string | null;
  formats: string[];
  sfMin: number | null;
  sfMax: number | null;
  acresMin: number | null;
  acresMax: number | null;
  sizeTiers: string[];
  driveThruRequired: boolean | null;
  azMarkets: string[];
  spacingMiles: number | null;
  requirementSource: string | null;
  requirementDate: string | null;
  notes: string | null;
  active: boolean;
}

export interface ContactCsvRow {
  brandName: string;
  contactType: ContactType;
  firmName: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  source: string | null;
  confidence: Confidence | null;
  lastVerified: string | null;
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => map.set(h.trim().toLowerCase(), i));
  return map;
}

function cell(cols: string[], index: Map<string, number>, name: string): string {
  const at = index.get(name);
  if (at == null) return "";
  return (cols[at] ?? "").trim();
}

function list(value: string): string[] {
  return value.split(/[|;]/).map((p) => p.trim()).filter(Boolean);
}

function num(value: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(value: string): boolean | null {
  const v = value.toLowerCase();
  if (!v) return null;
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return null;
}

function date(value: string): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function parseTenantCsv(text: string): { rows: TenantCsvRow[]; errors: CsvError[] } {
  const table = parseCsv(text);
  const errors: CsvError[] = [];
  if (table.length === 0) return { rows: [], errors: [{ row: 1, message: "The file is empty." }] };
  const index = headerIndex(table[0]);
  if (!index.has("brand_name") || !index.has("category")) {
    return { rows: [], errors: [{ row: 1, message: `Tenant CSV needs headers: ${TENANT_CSV_HEADERS.join(", ")}` }] };
  }
  const rows: TenantCsvRow[] = [];
  table.slice(1).forEach((cols, i) => {
    const row = i + 2;
    const brandName = cell(cols, index, "brand_name");
    const category = cell(cols, index, "category");
    if (!brandName || !category) {
      errors.push({ row, message: "brand_name and category are required." });
      return;
    }
    const formats = list(cell(cols, index, "formats"));
    if (formats.length && normalizeFormats(formats).length !== formats.length) {
      errors.push({ row, message: `Unknown format in "${formats.join("|")}".` });
      return;
    }
    const drive = cell(cols, index, "drive_thru_required");
    if (drive && bool(drive) == null) {
      errors.push({ row, message: "drive_thru_required must be true, false, or blank." });
      return;
    }
    const activeRaw = cell(cols, index, "active");
    rows.push({
      brandName,
      category,
      subcategory: cell(cols, index, "subcategory") || null,
      formats,
      sfMin: num(cell(cols, index, "sf_min")),
      sfMax: num(cell(cols, index, "sf_max")),
      acresMin: num(cell(cols, index, "acres_min")),
      acresMax: num(cell(cols, index, "acres_max")),
      sizeTiers: list(cell(cols, index, "size_tiers")),
      driveThruRequired: bool(drive),
      azMarkets: list(cell(cols, index, "az_markets")),
      spacingMiles: num(cell(cols, index, "spacing_miles")),
      requirementSource: cell(cols, index, "requirement_source") || null,
      requirementDate: date(cell(cols, index, "requirement_date")),
      notes: cell(cols, index, "notes") || null,
      active: activeRaw ? bool(activeRaw) !== false : true,
    });
  });
  return { rows, errors };
}

export function parseContactCsv(text: string): { rows: ContactCsvRow[]; errors: CsvError[] } {
  const table = parseCsv(text);
  const errors: CsvError[] = [];
  if (table.length === 0) return { rows: [], errors: [{ row: 1, message: "The file is empty." }] };
  const index = headerIndex(table[0]);
  if (!index.has("brand_name") || !index.has("name") || !index.has("contact_type")) {
    return { rows: [], errors: [{ row: 1, message: `Contact CSV needs headers: ${CONTACT_CSV_HEADERS.join(", ")}` }] };
  }
  const rows: ContactCsvRow[] = [];
  table.slice(1).forEach((cols, i) => {
    const row = i + 2;
    const brandName = cell(cols, index, "brand_name");
    const name = cell(cols, index, "name");
    const contactType = cell(cols, index, "contact_type").toLowerCase();
    if (!brandName || !name) {
      errors.push({ row, message: "brand_name and name are required." });
      return;
    }
    if (contactType !== "in_house" && contactType !== "broker") {
      errors.push({ row, message: "contact_type must be in_house or broker." });
      return;
    }
    const confidenceRaw = cell(cols, index, "confidence");
    const confidence = confidenceRaw ? confidenceRaw[0].toUpperCase() + confidenceRaw.slice(1).toLowerCase() : "";
    if (confidence && confidence !== "High" && confidence !== "Medium" && confidence !== "Low") {
      errors.push({ row, message: "confidence must be High, Medium, Low, or blank." });
      return;
    }
    rows.push({
      brandName,
      contactType,
      firmName: cell(cols, index, "firm_name") || null,
      name,
      title: cell(cols, index, "title") || null,
      email: cell(cols, index, "email") || null,
      phone: cell(cols, index, "phone") || null,
      isPrimary: bool(cell(cols, index, "is_primary")) === true,
      source: cell(cols, index, "source") || null,
      confidence: (confidence || null) as ContactCsvRow["confidence"],
      lastVerified: date(cell(cols, index, "last_verified")),
    });
  });
  return { rows, errors };
}

export function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: readonly string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}
