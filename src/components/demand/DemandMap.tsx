"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { MAPBOX_TOKEN, PHX_CENTER } from "@/lib/admin-constants";
import { IconButton, cn, FOCUS_RING, useLayerBehavior } from "@/components/ui";
import { nearestLocations, spacingCue, circlePolygon } from "@/lib/demand/geo";
import type { MapResponse, MapTenant } from "@/lib/demand/view";

const PIN_COLORS = ["#1F5F8B", "#8A5A00", "#B42323", "#111113", "#3F6E13", "#2A2A2E", "#5C5C63", "#6B9A33"];
const LISTING_GREEN = "#8CC644";

/**
 * Full-screen map for one listing. Closing it (X or Esc) only hides this layer;
 * the Demand page underneath keeps the same listing.
 */
export default function DemandMap({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  useLayerBehavior(true, onClose);
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/demand/map?listingId=${listingId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Could not load the map");
        if (!cancelled) setData(body as MapResponse);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the map");
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const categories = useMemo(() => {
    const groups = new Map<string, MapTenant[]>();
    for (const tenant of data?.tenants || []) {
      const list = groups.get(tenant.category) || [];
      list.push(tenant);
      groups.set(tenant.category, list);
    }
    return Array.from(groups.entries());
  }, [data]);

  const byId = useMemo(() => new Map((data?.tenants || []).map((tenant) => [tenant.id, tenant])), [data]);
  const colorOf = (id: string) => PIN_COLORS[pinned.indexOf(id) % PIN_COLORS.length];

  function togglePin(id: string) {
    setPinned((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleCategory(ids: string[]) {
    setPinned((current) => {
      const all = ids.every((id) => current.includes(id));
      if (all) return current.filter((id) => !ids.includes(id));
      return [...current, ...ids.filter((id) => !current.includes(id))];
    });
  }

  const shown = [
    ...pinned.map((id) => byId.get(id)).filter((tenant): tenant is MapTenant => !!tenant),
    ...(previewId && !pinned.includes(previewId) && byId.get(previewId) ? [byId.get(previewId) as MapTenant] : []),
  ];
  const cue = spacingCue(
    data?.listing.lat != null && data.listing.lng != null ? { lat: data.listing.lat, lng: data.listing.lng } : null,
    shown.map((tenant) => ({
      brandName: tenant.brandName,
      spacingMiles: tenant.spacingMiles,
      locations: nearestStops(data, tenant).map((stop) => ({
        name: stop.location.name,
        lat: stop.location.lat as number,
        lng: stop.location.lng as number,
      })),
    }))
  );

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col" role="dialog" aria-modal="true" aria-label="Demand map">
      <header className="h-[52px] shrink-0 bg-surface border-b border-border px-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-text truncate">{data?.listing.name || "Map"}</h2>
          {data?.note && <p className="text-xs text-text-3 truncate">{data.note}</p>}
        </div>
        <IconButton label="Close map" icon={<X size={18} strokeWidth={1.75} />} onClick={onClose} />
      </header>
      <div className="flex-1 min-h-0 flex">
        <aside className="w-72 shrink-0 bg-surface border-r border-border flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto py-2">
            {error && <p className="px-4 py-2 text-sm text-danger-fg">{error}</p>}
            {!error && categories.length === 0 && data && (
              <p className="px-4 py-6 text-sm text-text-2">No optimal or possible tenants for this listing.</p>
            )}
            {categories.map(([category, tenants]) => {
              const closed = collapsed[category];
              return (
                <div key={category} className="px-2">
                  <div className="flex items-center">
                    <button
                      type="button"
                      aria-label={closed ? `Expand ${category}` : `Collapse ${category}`}
                      onClick={() => setCollapsed((current) => ({ ...current, [category]: !current[category] }))}
                      className={cn("w-7 h-8 inline-flex items-center justify-center text-text-3 rounded-control", FOCUS_RING)}
                    >
                      {closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCategory(tenants.map((tenant) => tenant.id))}
                      className={cn("flex-1 h-8 text-left text-sm font-medium text-text rounded-control px-1", FOCUS_RING)}
                    >
                      {category}
                    </button>
                  </div>
                  {!closed &&
                    tenants.map((tenant) => {
                      const active = pinned.includes(tenant.id) || previewId === tenant.id;
                      return (
                        <button
                          key={tenant.id}
                          type="button"
                          onMouseEnter={() => setPreviewId(tenant.id)}
                          onMouseLeave={() => setPreviewId((current) => (current === tenant.id ? null : current))}
                          onClick={() => togglePin(tenant.id)}
                          className={cn(
                            "w-full text-left rounded-control px-3 py-1.5 ml-5",
                            active && "bg-surface-2",
                            FOCUS_RING
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm text-text">
                            {pinned.includes(tenant.id) && (
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(tenant.id) }} />
                            )}
                            <span className="truncate">{tenant.brandName}</span>
                          </span>
                          {active && tenant.locations.length === 0 && (
                            <span className="block text-xs text-text-3 mt-0.5">No locations loaded yet</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
          <p className={cn("border-t border-border px-4 py-3 text-sm", cue.tone === "close" ? "text-danger-fg" : "text-text-2")}>
            {cue.text}
          </p>
        </aside>
        <MapCanvas data={data} shown={shown} pinned={pinned} colorOf={colorOf} />
      </div>
    </div>
  );
}

function nearestStops(data: MapResponse | null, tenant: MapTenant) {
  if (!data || data.listing.lat == null || data.listing.lng == null) {
    return tenant.locations.slice(0, 12).map((location) => ({ location, miles: 0 }));
  }
  return nearestLocations(
    { lat: data.listing.lat, lng: data.listing.lng },
    tenant.locations.map((location) => ({
      id: location.id,
      tenantId: tenant.id,
      name: location.name,
      address: null,
      lat: location.lat,
      lng: location.lng,
      status: "open",
    }))
  );
}

function MapCanvas({
  data,
  shown,
  pinned,
  colorOf,
}: {
  data: MapResponse | null;
  shown: MapTenant[];
  pinned: string[];
  colorOf: (id: string) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markerRef = useRef<import("mapbox-gl").Marker | null>(null);
  const ready = useRef(false);
  const snapshot = useRef({ data, shown, pinned, colorOf });
  snapshot.current = { data, shown, pinned, colorOf };

  useEffect(() => {
    if (!ref.current || !MAPBOX_TOKEN || !data) return;
    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    import("mapbox-gl").then((mod) => {
      if (cancelled || !ref.current) return;
      const mapboxgl = mod.default;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const hasPoint = data.listing.lat != null && data.listing.lng != null;
      map = new mapboxgl.Map({
        container: ref.current,
        style: satelliteStyle(MAPBOX_TOKEN),
        center: hasPoint ? [data.listing.lng as number, data.listing.lat as number] : PHX_CENTER,
        zoom: hasPoint ? 14 : 9.5,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("load", () => {
        if (!map) return;
        ready.current = true;
        map.addSource("listing", { type: "geojson", data: emptyCollection() });
        map.addSource("rings", { type: "geojson", data: emptyCollection() });
        map.addLayer({ id: "listing-fill", type: "fill", source: "listing", paint: { "fill-color": LISTING_GREEN, "fill-opacity": 0.12 } });
        map.addLayer({ id: "listing-line", type: "line", source: "listing", paint: { "line-color": LISTING_GREEN, "line-width": 2 } });
        map.addLayer({ id: "ring-fill", type: "fill", source: "rings", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 } });
        map.addLayer({ id: "ring-line", type: "line", source: "rings", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": ["get", "color"], "line-width": 1.5 } });
        map.addLayer({
          id: "ring-points",
          type: "circle",
          source: "rings",
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-radius": 5, "circle-color": ["get", "color"], "circle-stroke-width": 1, "circle-stroke-color": "#ffffff" },
        });
        map.resize();
        draw(map, mapboxgl);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      ready.current = false;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // Recreate the map when the listing payload arrives. Hover updates call draw().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.listing.id]);

  const drawKey = `${shown.map((tenant) => tenant.id).join(",")}|${pinned.join(",")}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    import("mapbox-gl").then((mod) => {
      if (mapRef.current) draw(mapRef.current, mod.default);
    });
    // draw() reads snapshot.current, which already has the latest hover and pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, data]);

  function draw(map: import("mapbox-gl").Map, mapboxgl: typeof import("mapbox-gl").default) {
    const current = snapshot.current;
    const listingSource = map.getSource("listing") as import("mapbox-gl").GeoJSONSource | undefined;
    const ringSource = map.getSource("rings") as import("mapbox-gl").GeoJSONSource | undefined;
    if (!listingSource || !ringSource || !current.data) return;
    const features: GeoJSON.Feature[] = [];
    if (current.data.parcel) features.push({ type: "Feature", geometry: current.data.parcel.geometry as GeoJSON.Geometry, properties: {} });
    for (const space of current.data.spaceOutlines) {
      const geometry = space.geometry as GeoJSON.Geometry | null;
      if (geometry && typeof geometry === "object" && "type" in geometry) {
        features.push({ type: "Feature", geometry, properties: { label: space.label } });
      }
    }
    listingSource.setData({ type: "FeatureCollection", features });
    const lat = current.data.listing.lat;
    const lng = current.data.listing.lng;
    if (!features.length && lat != null && lng != null) {
      if (!markerRef.current) markerRef.current = new mapboxgl.Marker({ color: LISTING_GREEN }).setLngLat([lng, lat]).addTo(map);
      else markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current?.remove();
      markerRef.current = null;
    }

    const ringFeatures: GeoJSON.Feature[] = [];
    for (const tenant of current.shown) {
      const color = current.pinned.includes(tenant.id) ? current.colorOf(tenant.id) : "#5C5C63";
      for (const stop of nearestStops(current.data, tenant)) {
        const stopLat = stop.location.lat as number;
        const stopLng = stop.location.lng as number;
        ringFeatures.push({ type: "Feature", geometry: { type: "Point", coordinates: [stopLng, stopLat] }, properties: { color } });
        if (tenant.spacingMiles && tenant.spacingMiles > 0) {
          ringFeatures.push({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [circlePolygon(stopLng, stopLat, tenant.spacingMiles)] },
            properties: { color },
          });
        }
      }
    }
    ringSource.setData({ type: "FeatureCollection", features: ringFeatures });
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-sm text-text-2 text-center max-w-sm">
          Set NEXT_PUBLIC_MAPBOX_TOKEN to open the map. The rest of Demand works without it.
        </p>
      </div>
    );
  }
  return <div ref={ref} className="flex-1 min-w-0" />;
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function satelliteStyle(token: string): import("mapbox-gl").StyleSpecification {
  return {
    version: 8,
    name: "CRE8 Satellite",
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    sources: {
      "mapbox-satellite": {
        type: "raster",
        tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${token}`],
        tileSize: 256,
      },
      "mapbox-streets-v": { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" },
    },
    layers: [
      { id: "satellite-tiles", type: "raster", source: "mapbox-satellite" },
      {
        id: "road-labels",
        type: "symbol",
        source: "mapbox-streets-v",
        "source-layer": "road",
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
        },
        paint: { "text-color": "rgba(255,255,255,0.7)", "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-width": 1 },
      },
      {
        id: "place-labels",
        type: "symbol",
        source: "mapbox-streets-v",
        "source-layer": "place_label",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 13,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        },
        paint: { "text-color": "rgba(255,255,255,0.85)", "text-halo-color": "rgba(0,0,0,0.85)", "text-halo-width": 1.2 },
      },
    ],
  };
}
