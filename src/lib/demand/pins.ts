import type { LocationStatus } from "./location-status";

/** Pixel diameter of a store pin. Clamped: 6px at metro zoom, 14px from street zoom up. */
export const PIN_MIN_ZOOM = 9;
export const PIN_STREET_ZOOM = 16;
export const PIN_MIN_DIAMETER = 6;
export const PIN_MAX_DIAMETER = 14;
export const PIN_STROKE = 2;

export function pinDiameter(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= PIN_MIN_ZOOM) return PIN_MIN_DIAMETER;
  if (zoom >= PIN_STREET_ZOOM) return PIN_MAX_DIAMETER;
  const t = (zoom - PIN_MIN_ZOOM) / (PIN_STREET_ZOOM - PIN_MIN_ZOOM);
  return PIN_MIN_DIAMETER + t * (PIN_MAX_DIAMETER - PIN_MIN_DIAMETER);
}

/** icon-size for an image whose circle is PIN_MAX_DIAMETER css pixels. */
export function pinIconScale(zoom: number): number {
  return pinDiameter(zoom) / PIN_MAX_DIAMETER;
}

/**
 * Dash pattern in css pixels on the 14px pin icon.
 * Null is a solid white ring. Signed is a shorter dash with a wider gap.
 */
export function pinStrokeDash(status: LocationStatus): number[] | null {
  if (status === "under_construction") return [3.5, 2.5];
  if (status === "signed") return [1.2, 3.4];
  return null;
}

export function pinImageId(color: string, status: LocationStatus): string {
  const hex = color.replace("#", "").toLowerCase();
  return `pin-${hex}-${status}`;
}

export function pinPlaceLabel(address: string | null | undefined, lat: number, lng: number): string {
  const text = address?.trim();
  if (text) return text;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Stable fill so a tenant is the same color every time. There is no color column on tenants. */
export function brandColor(name: string): string {
  const key = name.trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hslToHex((hash >>> 0) % 360, 62, 36);
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lig - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
