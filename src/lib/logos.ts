/**
 * Brand logos — shared by the /logos page and the staff upload route.
 * Rows live in public.brand_logos. Files live in the public "logos" bucket.
 * Writes go through the service role on the server; this module never talks to Supabase.
 */

export const LOGO_CATEGORIES = [
  "QSR & Coffee",
  "Gas & Convenience",
  "Grocery & Big Box",
  "Banks & Credit Unions",
] as const;

export type LogoCategory = (typeof LOGO_CATEGORIES)[number];

/** Known variant keys, in the order pills should appear. Anything else sorts after these. */
export const VARIANT_ORDER = ["color", "white", "wordmark", "icon", "icon-white", "stacked"] as const;

export const PRIMARY_VARIANT = "color";

export interface LogoVariants {
  [key: string]: string | undefined;
}

export interface BrandLogo {
  id: string;
  name: string;
  slug: string;
  category: string;
  aliases: string[];
  variants: LogoVariants;
  source_url: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

const VARIANT_LABELS: Record<string, string> = {
  color: "Color",
  white: "White",
  wordmark: "Wordmark",
  icon: "Icon",
  "icon-white": "Icon white",
  stacked: "Stacked",
};

export function variantLabel(key: string): string {
  if (VARIANT_LABELS[key]) return VARIANT_LABELS[key];
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface LogoVariantOption {
  key: string;
  url: string;
}

/** Every non-empty URL in variants, color first, then the other known keys, then the rest. */
export function listVariants(variants: LogoVariants | null | undefined): LogoVariantOption[] {
  if (!variants) return [];
  return Object.entries(variants)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .sort((a, b) => {
      const order = VARIANT_ORDER as readonly string[];
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      const ar = ai === -1 ? VARIANT_ORDER.length : ai;
      const br = bi === -1 ? VARIANT_ORDER.length : bi;
      if (ar !== br) return ar - br;
      return a[0].localeCompare(b[0]);
    })
    .map(([key, url]) => ({ key, url }));
}

/**
 * Download name for the selected variant.
 * Prefer the file name already in the storage URL so extra keys (wordmark, icon, …) save as that PNG.
 */
export function logoFileName(slug: string, variant: string, url?: string | null): string {
  if (url) {
    const part = url.split("?")[0].split("#")[0].split("/").pop();
    if (part && /\.png$/i.test(part)) {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    }
  }
  if (variant === PRIMARY_VARIANT) return `${slug}.png`;
  const safe = variant.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe ? `${slug}-${safe}.png` : `${slug}.png`;
}

/** Chrome hands this to desktop apps (Photoshop, Finder) as a PNG file drop. */
export function logoDownloadUrl(url: string, filename: string): string {
  return `image/png:${filename}:${url}`;
}

export function isLogoCategory(value: string): value is LogoCategory {
  return (LOGO_CATEGORIES as readonly string[]).includes(value);
}

/** Case-insensitive match against the brand name and every alias. */
export function logoMatchesQuery(logo: { name: string; aliases?: string[] | null }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (logo.name.toLowerCase().includes(needle)) return true;
  return (logo.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
}

export function slugifyLogoName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const MAX_ALIAS_LENGTH = 80;
const MAX_ALIASES = 20;

export function parseAliases(raw: string): { ok: true; aliases: string[] } | { ok: false; error: string } {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of raw.split(",")) {
    const alias = part.trim().replace(/\s+/g, " ");
    if (!alias) continue;
    if (alias.length > MAX_ALIAS_LENGTH) {
      return { ok: false, error: `Aliases must be under ${MAX_ALIAS_LENGTH} characters` };
    }
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
    if (aliases.length > MAX_ALIASES) {
      return { ok: false, error: `Use at most ${MAX_ALIASES} aliases` };
    }
  }
  return { ok: true, aliases };
}

export const MAX_LOGO_BYTES = 8 * 1024 * 1024;

/** Read width/height from a PNG IHDR. Returns null unless the bytes are a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return null;
  }
  // IHDR
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0 || width > 20000 || height > 20000) return null;
  return { width, height };
}

export interface LogoUploadPlan {
  name: string;
  slug: string;
  category: LogoCategory;
  aliases: string[];
  width: number;
  height: number;
}

/** Validate a staff upload before it touches storage. */
export function planLogoUpload(input: {
  name: string;
  category: string;
  aliasesRaw: string;
  bytes: Uint8Array;
}): { ok: true; plan: LogoUploadPlan } | { ok: false; error: string } {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Name is required" };
  if (name.length > 120) return { ok: false, error: "Name is too long" };
  if (!isLogoCategory(input.category)) return { ok: false, error: "Pick a category" };

  const aliases = parseAliases(input.aliasesRaw);
  if (!aliases.ok) return aliases;

  if (input.bytes.byteLength === 0) return { ok: false, error: "PNG file is required" };
  if (input.bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, error: "PNG must be under 8 MB" };

  const size = pngSize(input.bytes);
  if (!size) return { ok: false, error: "File must be a PNG" };

  const slug = slugifyLogoName(name);
  if (!slug) return { ok: false, error: "Use a name with letters or numbers" };

  return {
    ok: true,
    plan: { name, slug, category: input.category, aliases: aliases.aliases, width: size.width, height: size.height },
  };
}
