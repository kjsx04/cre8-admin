import type { TenantLocation } from "./types";

const EARTH_MILES = 3958.7613;

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closed ring around a point, in [lng, lat] pairs. Good enough for a spacing preview. */
export function circlePolygon(lng: number, lat: number, miles: number, steps = 64): number[][] {
  const coords: number[][] = [];
  const milesPerDegLat = 69;
  const milesPerDegLng = Math.max(0.01, 69.172 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    coords.push([
      lng + (miles / milesPerDegLng) * Math.cos(t),
      lat + (miles / milesPerDegLat) * Math.sin(t),
    ]);
  }
  return coords;
}

const CLOSED = /closed|dead|former|relocated/i;

export function usableLocations(locations: TenantLocation[] | null | undefined): TenantLocation[] {
  return (locations || []).filter((loc) => loc != null && loc.lat != null && loc.lng != null && !CLOSED.test(loc.status || ""));
}

export interface NearestStop {
  location: TenantLocation;
  miles: number;
}

export function nearestLocations(
  origin: { lat: number; lng: number },
  locations: TenantLocation[],
  limit = 12
): NearestStop[] {
  return usableLocations(locations)
    .map((location) => ({
      location,
      miles: haversineMiles(origin.lat, origin.lng, location.lat as number, location.lng as number),
    }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit);
}

export interface ShownTenant {
  brandName: string;
  spacingMiles: number | null;
  locations: { name: string | null; lat: number; lng: number }[];
}

export interface SpacingCue {
  tone: "close" | "gap" | "none" | "no-locations";
  text: string;
}

/**
 * Whether the listing pin sits inside a spacing ring that is currently drawn.
 * Tenants with no locations don't count as a gap or a conflict.
 */
export function spacingCue(
  listing: { lat: number; lng: number } | null,
  shown: ShownTenant[]
): SpacingCue {
  if (shown.length === 0) {
    return { tone: "none", text: "Hover a tenant to preview spacing." };
  }
  const withLocations = shown.filter((t) => t.locations.length > 0);
  if (withLocations.length === 0) {
    return { tone: "no-locations", text: "No locations loaded yet." };
  }
  if (!listing) {
    return { tone: "none", text: "This listing has no map location yet." };
  }

  let closest: { brandName: string; miles: number; spacing: number } | null = null;
  for (const tenant of withLocations) {
    if (tenant.spacingMiles == null || tenant.spacingMiles <= 0) continue;
    for (const loc of tenant.locations) {
      const miles = haversineMiles(listing.lat, listing.lng, loc.lat, loc.lng);
      if (miles < tenant.spacingMiles && (!closest || miles < closest.miles)) {
        closest = { brandName: tenant.brandName, miles, spacing: tenant.spacingMiles };
      }
    }
  }
  if (closest) {
    const miles = formatMiles(closest.miles);
    const spacing = formatMiles(closest.spacing);
    return {
      tone: "close",
      text: `Too close — inside ${closest.brandName}'s ${spacing} mi ring (${miles} mi).`,
    };
  }
  return { tone: "gap", text: "In a gap — outside every spacing ring shown." };
}

export function formatMiles(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
