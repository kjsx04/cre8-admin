/**
 * Parcel outline at a listing pin.
 * Uses the same county ArcGIS services as the parcel picker. A miss is normal —
 * the map then drops a pin and says there is no outline on file.
 */

export interface ParcelHit {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: { source: string; apn: string | null };
}

const SOURCES = [
  {
    id: "maricopa",
    baseUrl: "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0",
    idField: "APN",
  },
  {
    id: "pinal",
    baseUrl: "https://gis.pinal.gov/mapping/rest/services/TaxParcels/FeatureServer/3",
    idField: "PARCELID",
  },
  {
    id: "gila",
    baseUrl: "https://services1.arcgis.com/PEZ16KoOWXoETFQ5/arcgis/rest/services/Parcels_View3/FeatureServer/0",
    idField: "APN",
  },
];

export async function parcelAtPoint(lng: number, lat: number): Promise<ParcelHit | null> {
  const geometry = `${lng},${lat}`;
  for (const source of SOURCES) {
    const url =
      `${source.baseUrl}/query?where=1%3D1` +
      `&outFields=${source.idField}&f=geojson&returnGeometry=true&resultRecordCount=1` +
      `&outSR=4326&inSR=4326&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects` +
      `&geometry=${encodeURIComponent(geometry)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { features?: { geometry?: ParcelHit["geometry"]; properties?: Record<string, unknown> }[] };
      const feature = data.features?.find((item) => item.geometry);
      if (!feature?.geometry) continue;
      const apn = feature.properties?.[source.idField];
      return {
        type: "Feature",
        geometry: feature.geometry,
        properties: { source: source.id, apn: apn == null ? null : String(apn) },
      };
    } catch {
      continue;
    }
  }
  return null;
}
