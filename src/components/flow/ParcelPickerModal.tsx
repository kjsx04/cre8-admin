"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ──

/** Data returned when the user confirms their parcel selection */
export interface ParcelSelection {
  property_address: string;
  parcel_number: string;
  seller_entity: string;
  acreage: string;
  /** The raw parcel objects so the parent can store them for re-opening */
  selectedParcels: SelectedParcel[];
}

/** A single selected parcel with raw properties — exported so parents can store them */
export interface SelectedParcel {
  /** Unique key: `${source}:${id}` */
  key: string;
  /** County source: maricopa | pinal | gila */
  source: string;
  /** APN or PARCELID */
  id: string;
  /** Address extracted from county-specific field */
  address: string;
  /** Owner name extracted from county-specific field */
  owner: string;
  /** Acreage (already converted) */
  acreage: string;
  /** GeoJSON feature for map highlighting */
  feature: GeoJSON.Feature;
}

// ── ArcGIS endpoint config (same as cre8-map) ──

interface DynamicSource {
  id: string;
  baseUrl: string;
  fields: string;
  where: string;
  idField: string;
}

const DYNAMIC_SOURCES: DynamicSource[] = [
  {
    id: "maricopa",
    baseUrl:
      "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0",
    fields:
      "APN,PHYSICAL_ADDRESS,OWNER_NAME,MAIL_ADDRESS,PUC,SALE_PRICE,DEED_DATE,CITY_ZONING,LAND_SIZE,CONST_YEAR,FCV_CUR,FCV_PREV,LPV_CUR,LPV_PREV",
    where: "PUC NOT LIKE '01%' OR LAND_SIZE >= 43560",
    idField: "APN",
  },
  {
    id: "pinal",
    baseUrl:
      "https://gis.pinal.gov/mapping/rest/services/TaxParcels/FeatureServer/3",
    fields:
      "PARCELID,SITEADDRESS,OWNERNME1,OWNERNME2,PSTLADDRESS,PSTLCITY,PSTLSTATE,PSTLZIP5,USECD,USEDSCRP,SALEPRICE,SALEDATE,GROSSSF,GROSSAC,RESYRBLT,CNTASSDVAL,PRVASSDVAL,LNDVALUE,CLASSDSCRP,BLDGAREA,CNVYNAME",
    where: "(USECD NOT LIKE '01%' AND USECD NOT LIKE '02%') OR GROSSSF >= 43560",
    idField: "PARCELID",
  },
  {
    id: "gila",
    baseUrl:
      "https://services1.arcgis.com/PEZ16KoOWXoETFQ5/arcgis/rest/services/Parcels_View3/FeatureServer/0",
    fields: "APN,LAPN,Owner_Name,Acres,Account_Num,TaxAreaID",
    where: "1=1",
    idField: "APN",
  },
];

// ── Field mapping helpers per county ──

function extractAddress(props: Record<string, unknown>, source: string): string {
  if (source === "maricopa") return (props.PHYSICAL_ADDRESS as string) || "";
  if (source === "pinal") return (props.SITEADDRESS as string) || "";
  // Gila has no address field
  return "";
}

function extractOwner(props: Record<string, unknown>, source: string): string {
  if (source === "maricopa") return (props.OWNER_NAME as string) || "";
  if (source === "pinal") return (props.OWNERNME1 as string) || "";
  if (source === "gila") return (props.Owner_Name as string) || "";
  return "";
}

function extractAcreage(props: Record<string, unknown>, source: string): string {
  if (source === "maricopa") {
    // LAND_SIZE is in square feet — convert to acres
    const sqft = Number(props.LAND_SIZE);
    if (sqft && !isNaN(sqft)) return (sqft / 43560).toFixed(2);
    return "";
  }
  if (source === "pinal") {
    // GROSSAC is already in acres
    const ac = Number(props.GROSSAC);
    if (ac && !isNaN(ac)) return ac.toFixed(2);
    return "";
  }
  if (source === "gila") {
    const ac = Number(props.Acres);
    if (ac && !isNaN(ac)) return ac.toFixed(2);
    return "";
  }
  return "";
}

function extractId(props: Record<string, unknown>, source: string): string {
  if (source === "maricopa") return (props.APN as string) || "";
  if (source === "pinal") return (props.PARCELID as string) || "";
  if (source === "gila") return (props.APN as string) || "";
  return "";
}

// ── Component ──

/** Compute a LngLatBounds from an array of selected parcels */
function computeBounds(parcels: SelectedParcel[]): [[number, number], [number, number]] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let hasCoords = false;

  for (const p of parcels) {
    const geom = p.feature.geometry;
    if (!geom) continue;

    const coords: number[][][] =
      geom.type === "MultiPolygon"
        ? (geom as GeoJSON.MultiPolygon).coordinates.flat()
        : geom.type === "Polygon"
        ? (geom as GeoJSON.Polygon).coordinates
        : [];

    for (const ring of coords) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        hasCoords = true;
      }
    }
  }

  if (!hasCoords) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

export default function ParcelPickerModal({
  onConfirm,
  onClose,
  mapboxToken,
  initialParcels,
}: {
  /** Called when user clicks Done — returns selected parcel data */
  onConfirm: (selection: ParcelSelection) => void;
  /** Called when user clicks Cancel or X */
  onClose: () => void;
  /** Mapbox public access token */
  mapboxToken: string;
  /** Previously selected parcels — restores selection and zooms to them on open */
  initialParcels?: SelectedParcel[];
}) {
  // Map container ref
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // mapbox-gl Map instance ref (loaded dynamically to avoid SSR issues)
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Current zoom level (for "zoom in" overlay)
  const [currentZoom, setCurrentZoom] = useState(10);
  // Loading state for parcel fetch
  const [loadingParcels, setLoadingParcels] = useState(false);
  // Selected parcels (accumulator) — initialized from prop if provided
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>(initialParcels ?? []);

  // AbortControllers for in-flight ArcGIS requests (one per source)
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  // Debounce timer for moveend
  const moveEndTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Accumulated features from all sources
  const featuresRef = useRef<Map<string, GeoJSON.Feature>>(new Map());
  // Track selected parcel keys for highlight filter
  const selectedKeysRef = useRef<Set<string>>(new Set());

  // ── Initialize Mapbox map ──
  useEffect(() => {
    if (!mapboxToken) {
      console.error("[ParcelPicker] No Mapbox token provided");
      return;
    }

    // Dynamic import to avoid SSR (mapbox-gl accesses `window`)
    let map: mapboxgl.Map | null = null;

    import("mapbox-gl").then((mapboxgl) => {
      if (!mapContainerRef.current) return;

      mapboxgl.default.accessToken = mapboxToken;

      // Build custom satellite + dark overlay style (same as cre8-map)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const style: any = {
        version: 8 as const,
        name: "CRE8 Satellite",
        sources: {
          "mapbox-satellite": {
            type: "raster",
            tiles: [
              `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${mapboxToken}`,
            ],
            tileSize: 256,
            maxzoom: 19,
          },
          "mapbox-streets": {
            type: "raster",
            tiles: [
              `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
            ],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: "satellite-tiles",
            type: "raster",
            source: "mapbox-satellite",
            paint: {
              "raster-opacity": 1,
              "raster-saturation": -0.1,
              "raster-brightness-max": 0.85,
            },
          },
          {
            id: "dark-overlay",
            type: "raster",
            source: "mapbox-streets",
            paint: {
              "raster-opacity": 0.4,
            },
          },
        ],
        glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
      };

      map = new mapboxgl.default.Map({
        container: mapContainerRef.current,
        style,
        center: [-111.789, 33.306], // SE Valley AZ
        zoom: 10,
      });

      // Add nav controls (zoom buttons)
      map.addControl(new mapboxgl.default.NavigationControl(), "top-right");

      map.on("load", () => {
        if (!map) return;
        mapRef.current = map;

        // ── Add empty parcel GeoJSON source ──
        map.addSource("parcels", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        // ── Parcel fill (white, very faint) ──
        map.addLayer({
          id: "parcels-fill",
          type: "fill",
          source: "parcels",
          paint: {
            "fill-color": "#ffffff",
            "fill-opacity": 0.05,
          },
        });

        // ── Parcel outline (white stroke) ──
        map.addLayer({
          id: "parcels-line",
          type: "line",
          source: "parcels",
          paint: {
            "line-color": "#ffffff",
            "line-width": 1,
            "line-opacity": 0.4,
          },
        });

        // ── Owner name labels (appear at z14.5+) ──
        map.addLayer({
          id: "parcels-label",
          type: "symbol",
          source: "parcels",
          layout: {
            "text-field": [
              "coalesce",
              ["get", "OWNER_NAME"],
              ["get", "OWNERNME1"],
              ["get", "Owner_Name"],
              "",
            ],
            "text-size": ["interpolate", ["linear"], ["zoom"], 14.5, 9, 18, 12],
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
            "text-max-width": 8,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            "text-variable-anchor": ["center", "top", "bottom", "left", "right"],
            "text-radial-offset": 0.3,
            "text-justify": "auto",
          },
          paint: {
            "text-color": "#c9d1d9",
            "text-halo-color": "rgba(0, 0, 0, 0.85)",
            "text-halo-width": 1.5,
            "text-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14.3, 0,
              14.7, 0.85,
            ],
          },
        });

        // ── Selected parcel layers (green highlight) ──
        map.addSource("selected-parcels", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "selected-fill",
          type: "fill",
          source: "selected-parcels",
          paint: {
            "fill-color": "#7ab800",
            "fill-opacity": 0.3,
          },
        });

        map.addLayer({
          id: "selected-line",
          type: "line",
          source: "selected-parcels",
          paint: {
            "line-color": "#7ab800",
            "line-width": 1.5,
            "line-opacity": 1,
          },
        });

        setCurrentZoom(map.getZoom());

        // Force Mapbox to recalculate container dimensions
        setTimeout(() => map?.resize(), 0);

        // ── Restore initial parcels if provided ──
        if (initialParcels && initialParcels.length > 0) {
          for (const p of initialParcels) {
            selectedKeysRef.current.add(p.key);
            featuresRef.current.set(p.key, p.feature);
          }
          const parcelsSrc = map.getSource("parcels") as mapboxgl.GeoJSONSource | undefined;
          if (parcelsSrc) {
            parcelsSrc.setData({
              type: "FeatureCollection",
              features: Array.from(featuresRef.current.values()),
            });
          }
          updateSelectedSource(map, initialParcels);
          const bounds = computeBounds(initialParcels);
          if (bounds) {
            map.fitBounds(bounds, { padding: 80, maxZoom: 17 });
          }
        }

        // ── Load parcels for current viewport ──
        loadParcels(map);
      });

      // ── Track zoom for overlay message ──
      map.on("zoomend", () => {
        if (map) setCurrentZoom(map.getZoom());
      });

      // ── Reload parcels on pan/zoom with debounce ──
      map.on("moveend", () => {
        if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
        moveEndTimerRef.current = setTimeout(() => {
          if (map) loadParcels(map);
        }, 300);
      });

      // ── Click handler — select/deselect parcels ──
      map.on("click", "parcels-fill", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties || {};
        const source = (props._source as string) || "maricopa";
        const id = extractId(props, source);
        if (!id) return;

        const key = `${source}:${id}`;

        setSelectedParcels((prev) => {
          const exists = prev.find((p) => p.key === key);
          if (exists) {
            // Deselect — toggle off
            const updated = prev.filter((p) => p.key !== key);
            selectedKeysRef.current.delete(key);
            updateSelectedSource(map!, updated);
            return updated;
          } else {
            // Select — add to list
            const newParcel: SelectedParcel = {
              key,
              source,
              id,
              address: extractAddress(props, source),
              owner: extractOwner(props, source),
              acreage: extractAcreage(props, source),
              feature: feature as unknown as GeoJSON.Feature,
            };
            const updated = [...prev, newParcel];
            selectedKeysRef.current.add(key);
            updateSelectedSource(map!, updated);
            return updated;
          }
        });
      });

      // Pointer cursor on parcel hover
      map.on("mouseenter", "parcels-fill", () => {
        if (map) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "parcels-fill", () => {
        if (map) map.getCanvas().style.cursor = "";
      });
    });

    // ── Cleanup on unmount ──
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((ctrl) => ctrl.abort());
      controllers.clear();
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
      if (map) {
        map.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update the selected-parcels source on the map ──
  function updateSelectedSource(map: mapboxgl.Map, parcels: SelectedParcel[]) {
    const source = map.getSource("selected-parcels") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: parcels.map((p) => p.feature),
    });
  }

  // ── Load parcels from all 3 ArcGIS endpoints for the current viewport ──
  const loadParcels = useCallback((map: mapboxgl.Map) => {
    const zoom = map.getZoom();
    if (zoom < 14) return; // Don't fetch below parcel zoom

    const bounds = map.getBounds();
    if (!bounds) return;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const envelope = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

    setLoadingParcels(true);

    // Query all 3 county endpoints in parallel
    const promises = DYNAMIC_SOURCES.map(async (ds) => {
      // Cancel previous request for this source
      const prevController = controllersRef.current.get(ds.id);
      if (prevController) prevController.abort();

      const controller = new AbortController();
      controllersRef.current.set(ds.id, controller);

      const whereClause = encodeURIComponent(ds.where);
      const url =
        `${ds.baseUrl}/query?where=${whereClause}` +
        `&outFields=${ds.fields}` +
        `&f=geojson` +
        `&resultRecordCount=1000` +
        `&outSR=4326` +
        `&geometry=${encodeURIComponent(envelope)}` +
        `&geometryType=esriGeometryEnvelope` +
        `&spatialRel=esriSpatialRelIntersects` +
        `&inSR=4326`;

      try {
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();

        if (data.features && data.features.length > 0) {
          // Tag each feature with _source for county-aware field mapping
          for (const f of data.features) {
            if (f.properties) f.properties._source = ds.id;
            const rawId =
              f.properties?.[ds.idField] ||
              JSON.stringify(f.geometry?.coordinates?.[0]?.[0]);
            const dedupKey = `${ds.id}:${rawId}`;
            featuresRef.current.set(dedupKey, f);
          }
        }
      } catch (err: unknown) {
        // Abort errors are expected when user pans quickly
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn(`[${ds.id}] parcel fetch failed:`, err);
      }
    });

    // After all sources resolve, update the map source
    Promise.allSettled(promises).then(() => {
      if (!mapRef.current) return;
      const source = mapRef.current.getSource("parcels") as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;

      source.setData({
        type: "FeatureCollection",
        features: Array.from(featuresRef.current.values()),
      });

      setLoadingParcels(false);
    });
  }, []);

  // ── Remove a parcel from selection (chip X button) ──
  function handleRemoveParcel(key: string) {
    setSelectedParcels((prev) => {
      const updated = prev.filter((p) => p.key !== key);
      selectedKeysRef.current.delete(key);
      if (mapRef.current) updateSelectedSource(mapRef.current, updated);
      return updated;
    });
  }

  // ── Confirm selection — build ParcelSelection from accumulated parcels ──
  function handleDone() {
    if (selectedParcels.length === 0) {
      onClose();
      return;
    }

    // First parcel provides address and owner; all APNs are joined
    const first = selectedParcels[0];
    const selection: ParcelSelection = {
      property_address: first.address,
      parcel_number: selectedParcels.map((p) => p.id).join(", "),
      seller_entity: first.owner,
      acreage: first.acreage,
      selectedParcels,
    };

    onConfirm(selection);
  }

  // ── Derived state for the selection bar ──
  const firstParcel = selectedParcels[0] || null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Dark backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative max-w-4xl w-full mx-4 h-[80vh] bg-charcoal border border-border-gray rounded-card flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-gray flex-shrink-0">
          <h2 className="font-bebas text-xl tracking-wide text-white">
            SELECT <span className="text-green">PARCEL</span>
          </h2>
          <button
            onClick={onClose}
            className="text-medium-gray hover:text-white transition-colors p-1"
            title="Close"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Map container ── */}
        <div className="flex-1 min-h-0 relative">
          <div ref={mapContainerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }} />

          {/* "Zoom in" overlay — fades out as you approach z14 */}
          <div
            className="absolute inset-0 flex items-start justify-center pointer-events-none z-10 pt-16 transition-opacity duration-500"
            style={{ opacity: currentZoom < 13.5 ? 1 : 0 }}
          >
            <div className="bg-black/70 text-medium-gray text-sm px-4 py-2 rounded-card border border-border-gray">
              Zoom in to see parcels
            </div>
          </div>

          {/* Loading indicator */}
          {loadingParcels && currentZoom >= 14 && (
            <div className="absolute top-3 left-3 z-10">
              <div className="flex items-center gap-2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-card border border-border-gray">
                <div className="w-3 h-3 border-2 border-green border-t-transparent rounded-full animate-spin" />
                Loading parcels...
              </div>
            </div>
          )}
        </div>

        {/* ── Selection bar — shows selected parcel chips + summary ── */}
        {selectedParcels.length > 0 && (
          <div className="border-t border-border-gray px-5 py-3 flex-shrink-0 bg-dark-gray">
            {/* APN chips */}
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedParcels.map((p) => (
                <span
                  key={p.key}
                  className="inline-flex items-center gap-1.5 bg-charcoal border border-green/40 text-white text-xs px-2.5 py-1 rounded"
                >
                  {p.id}
                  <button
                    onClick={() => handleRemoveParcel(p.key)}
                    className="text-medium-gray hover:text-white transition-colors"
                    title="Remove"
                    type="button"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>

            {/* Summary from first parcel */}
            {firstParcel && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-medium-gray">
                {firstParcel.address && (
                  <span>
                    <span className="text-border-gray">Address:</span>{" "}
                    <span className="text-white">{firstParcel.address}</span>
                  </span>
                )}
                {firstParcel.owner && (
                  <span>
                    <span className="text-border-gray">Owner:</span>{" "}
                    <span className="text-white">{firstParcel.owner}</span>
                  </span>
                )}
                {firstParcel.acreage && (
                  <span>
                    <span className="text-border-gray">Acreage:</span>{" "}
                    <span className="text-white">{firstParcel.acreage} ac</span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Footer — Done + Cancel ── */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border-gray flex-shrink-0">
          <button
            onClick={onClose}
            type="button"
            className="bg-dark-gray border border-border-gray text-white font-semibold text-sm px-5 py-2 rounded-btn
                       hover:border-green transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleDone}
            type="button"
            disabled={selectedParcels.length === 0}
            className="bg-green text-black font-semibold text-sm px-5 py-2 rounded-btn
                       hover:brightness-110 transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Done{selectedParcels.length > 0 ? ` (${selectedParcels.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
