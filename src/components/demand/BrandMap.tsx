"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { MAPBOX_TOKEN, PHX_CENTER } from "@/lib/admin-constants";
import { Button, Input, Select, cn, FOCUS_RING, useToast } from "@/components/ui";
import { circlePolygon } from "@/lib/demand/geo";
import { LOCATION_STATUSES, LOCATION_STATUS_LABEL, locationStatus, ringDash, type LocationStatus } from "@/lib/demand/location-status";

export type BaseMap = "light" | "dark" | "satellite";

interface Brand {
  id: string;
  brandName: string;
  category: string;
  spacingMiles: number | null;
}

interface Store {
  id: string;
  tenantId: string;
  lat: number;
  lng: number;
  status: LocationStatus;
  address: string | null;
}

interface ListingOption {
  id: string;
  name: string;
}

interface Focus {
  lat: number | null;
  lng: number | null;
  parcel: { type: string; coordinates: unknown } | null;
}

const GREEN = "#8CC644";
const RING = "#1F5F8B";
const MARKER_MILES = 0.04;

export default function BrandMap({
  listings,
  listingId,
  onListingId,
  query,
  onQuery,
  base,
  fits,
}: {
  listings: ListingOption[];
  listingId: string;
  onListingId: (id: string) => void;
  query: string;
  onQuery: (value: string) => void;
  base: BaseMap;
  fits: { id: string; bucket: "optimal" | "possible" | "excluded"; score: number }[];
}) {
  const toast = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [status, setStatus] = useState<LocationStatus>("open");
  const [stores, setStores] = useState<Record<string, Store[]>>({});
  const [lastId, setLastId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = apiFetch("/api/demand/brands").then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load");
      return body;
    });
    load
      .then((body) => {
        if (!cancelled) setBrands(body as Brand[]);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load"));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!listingId) {
      setFocus(null);
      return;
    }
    let cancelled = false;
    const load = apiFetch(`/api/demand/focus?listingId=${listingId}`).then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load");
      return body;
    });
    load.then((body) => {
      if (!cancelled) setFocus(body as Focus);
    }).catch(() => {
      if (!cancelled) setFocus(null);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    setShowAll(false);
    setActive([]);
    setCleared(false);
    setAddingId(null);
  }, [listingId]);

  const q = query.trim().toLowerCase();
  const fitById = new Map(fits.map((fit) => [fit.id, fit]));
  const filtered = brands.filter((brand) => !q || `${brand.brandName} ${brand.category}`.toLowerCase().includes(q));
  const fitting = listingId
    ? filtered
        .filter((brand) => fitById.has(brand.id))
        .sort((a, b) => (fitById.get(a.id)!.bucket === fitById.get(b.id)!.bucket
          ? fitById.get(b.id)!.score - fitById.get(a.id)!.score
          : fitById.get(a.id)!.bucket === "optimal" ? -1 : 1) || a.brandName.localeCompare(b.brandName))
    : [];
  const rest = listingId ? filtered.filter((brand) => !fitById.has(brand.id)) : [];
  const categories = (() => {
    const map = new Map<string, Brand[]>();
    for (const brand of filtered.slice().sort((a, b) => a.brandName.localeCompare(b.brandName))) {
      const list = map.get(brand.category) || [];
      list.push(brand);
      map.set(brand.category, list);
    }
    return Array.from(map.entries());
  })();

  const shown = active.flatMap((id) => stores[id] || []);
  const spacing = new Map(brands.map((brand) => [brand.id, brand.spacingMiles]));

  async function loadStores(ids: string[]) {
    const missing = ids.filter((id) => !stores[id]);
    if (!missing.length) return;
    const res = await apiFetch("/api/demand/locations", { method: "PUT", body: JSON.stringify({ tenantIds: missing }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error || "Could not load");
      return;
    }
    const grouped: Record<string, Store[]> = {};
    for (const id of missing) grouped[id] = [];
    for (const store of body as Store[]) {
      const row = { ...store, status: locationStatus(store.status) };
      (grouped[row.tenantId] || (grouped[row.tenantId] = [])).push(row);
    }
    setStores((current) => ({ ...current, ...grouped }));
  }

  async function toggle(id: string) {
    setCleared(false);
    if (addingId && addingId !== id) setAddingId(null);
    if (active.includes(id)) {
      setActive((current) => current.filter((item) => item !== id));
      return;
    }
    setActive((current) => [...current, id]);
    await loadStores([id]);
  }

  function clearBoard() {
    setActive([]);
    setAddingId(null);
    setCleared(true);
  }

  async function showBoard() {
    const ids = listingId ? fits.map((fit) => fit.id) : filtered.map((brand) => brand.id);
    setCleared(false);
    setActive(ids);
    await loadStores(ids);
  }

  function toggleAdd(id: string) {
    setStatus("open");
    setAddingId((current) => (current === id ? null : id));
    if (!active.includes(id)) toggle(id);
  }

  async function place(lat: number, lng: number) {
    if (!addingId) return;
    const res = await apiFetch("/api/demand/locations", {
      method: "POST",
      body: JSON.stringify({ tenantId: addingId, lat, lng, status }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error || "Could not save");
      return;
    }
    const store = { ...(body as Store), status: locationStatus((body as Store).status) };
    setStores((current) => ({ ...current, [addingId]: [...(current[addingId] || []), store] }));
    setLastId(store.id);
  }

  async function undo() {
    if (!lastId || !addingId) return;
    const id = lastId;
    setLastId(null);
    setStores((current) => ({ ...current, [addingId]: (current[addingId] || []).filter((store) => store.id !== id) }));
    await apiFetch(`/api/demand/locations/${id}`, { method: "DELETE" });
  }

  return (
    <div className="absolute inset-0">
      {MAPBOX_TOKEN ? (
        <MapCanvas base={base} stores={shown} spacing={spacing} focus={focus} adding={!!addingId} onPlace={place} />
      ) : (
        <CanvasMap stores={shown} spacing={spacing} focus={focus} adding={!!addingId} onPlace={place} />
      )}
      <aside className="absolute top-[5px] left-[5px] bottom-[5px] w-1/4 min-w-[220px] bg-surface border border-border rounded-card shadow-popover flex flex-col min-h-0 z-10">
        <div className="p-2 space-y-2 border-b border-border">
          <div className="flex justify-end">
            <button
              type="button"
              aria-label={cleared ? "Show" : "Hide"}
              onClick={() => (cleared ? showBoard() : clearBoard())}
              className={cn("relative w-7 h-7 inline-flex items-center justify-center text-text-2 hover:text-text", FOCUS_RING)}
            >
              <Eye size={16} strokeWidth={1.75} className={cn("absolute transition-opacity duration-200 ease-in-out", cleared ? "opacity-0" : "opacity-100")} />
              <EyeOff size={16} strokeWidth={1.75} className={cn("absolute transition-opacity duration-200 ease-in-out", cleared ? "opacity-100" : "opacity-0")} />
            </button>
          </div>
          <Select small aria-label="Listing" value={listingId} onChange={(e) => onListingId(e.target.value)}>
            <option value="">All tenants</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>{listing.name}</option>
            ))}
          </Select>
          <Input small aria-label="Search" placeholder="Search" value={query} onChange={(e) => onQuery(e.target.value)} />
          {addingId && (
            <div className="flex flex-wrap gap-1">
              {LOCATION_STATUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                  className={cn(
                    "h-7 px-2 rounded-control text-xs font-medium border border-border",
                    status === value ? "bg-surface-2 text-text" : "text-text-2",
                    FOCUS_RING
                  )}
                >
                  {LOCATION_STATUS_LABEL[value]}
                </button>
              ))}
              {lastId && (
                <Button variant="ghost" size="sm" onClick={undo}>Undo</Button>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {listingId ? (
            <>
              {(["optimal", "possible"] as const).map((bucket) => {
                const list = fitting.filter((brand) => fitById.get(brand.id)?.bucket === bucket);
                if (!list.length) return null;
                return (
                  <div key={bucket} className="mb-2">
                    <div className="flex items-center gap-2 px-3 py-1">
                      <span className="text-xs text-text-3">{bucket === "optimal" ? "Optimal" : "Possible"}</span>
                      <span className="flex-1 border-t border-border" />
                    </div>
                    {list.map((brand, index) => (
                      <BrandRow key={brand.id} brand={brand} rank={index + 1} on={active.includes(brand.id)} adding={addingId === brand.id} dim={addingId != null && addingId !== brand.id} onToggle={() => toggle(brand.id)} onAdd={() => toggleAdd(brand.id)} />
                    ))}
                  </div>
                );
              })}
              <div className="px-3 py-2">
                <button type="button" className="text-sm text-text-2 hover:text-text" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Hide" : "Show all"}
                </button>
              </div>
              <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-in-out", showAll ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none")}>
                <div className="overflow-hidden">
                  {rest.map((brand) => (
                    <BrandRow key={brand.id} brand={brand} on={active.includes(brand.id)} adding={addingId === brand.id} dim={addingId != null && addingId !== brand.id} onToggle={() => toggle(brand.id)} onAdd={() => toggleAdd(brand.id)} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            categories.map(([category, list]) => (
              <div key={category} className="px-2 mb-2">
                <p className="px-2 py-1 text-xs text-text-3">{category}</p>
                {list.map((brand) => (
                  <BrandRow key={brand.id} brand={brand} on={active.includes(brand.id)} adding={addingId === brand.id} dim={addingId != null && addingId !== brand.id} onToggle={() => toggle(brand.id)} onAdd={() => toggleAdd(brand.id)} />
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function BrandRow({
  brand,
  rank,
  on,
  adding,
  dim,
  onToggle,
  onAdd,
}: {
  brand: Brand;
  rank?: number;
  on: boolean;
  adding: boolean;
  dim: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  return (
    <div className={cn("flex items-center rounded-control mx-1", (on || adding) && "bg-surface-2")}>
      {rank != null && <span className="w-5 text-right text-xs text-text-3 tabular-nums">{rank}</span>}
      <button
        type="button"
        onClick={onToggle}
        className={cn("flex-1 min-w-0 text-left px-2 py-1.5 text-sm truncate", dim ? "text-text-3" : "text-text", on && !dim && "font-medium", FOCUS_RING)}
      >
        {brand.brandName}
      </button>
      <button
        type="button"
        aria-label={`Add a location for ${brand.brandName}`}
        aria-pressed={adding}
        onClick={onAdd}
        className={cn("shrink-0 px-2 py-1 text-text-2 hover:text-text", dim && "text-text-3", FOCUS_RING)}
      >
        <Plus size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function CanvasMap({
  stores,
  spacing,
  focus,
  adding,
  onPlace,
}: {
  stores: Store[];
  spacing: Map<string, number | null>;
  focus: Focus | null;
  adding: boolean;
  onPlace: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useRef<{ minLng: number; maxLng: number; minLat: number; maxLat: number; width: number; height: number; pad: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const paint = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 20 || height < 20) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = "#F7F7F8";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#E6E6E8";
      ctx.lineWidth = 1;
      for (let x = 40; x < width; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 40; y < height; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      const pad = 72;
      const pts: { lng: number; lat: number }[] = stores.map((store) => ({ lng: store.lng, lat: store.lat }));
      if (focus?.lng != null && focus.lat != null) pts.push({ lng: focus.lng, lat: focus.lat });
      if (!pts.length) pts.push({ lng: PHX_CENTER[0], lat: PHX_CENTER[1] });
      let minLng = Math.min(...pts.map((point) => point.lng));
      let maxLng = Math.max(...pts.map((point) => point.lng));
      let minLat = Math.min(...pts.map((point) => point.lat));
      let maxLat = Math.max(...pts.map((point) => point.lat));
      const reach = Math.max(1, ...stores.map((store) => spacing.get(store.tenantId) || 0));
      const mid = (minLat + maxLat) / 2;
      minLat -= reach / 69 + 0.04;
      maxLat += reach / 69 + 0.04;
      const lngReach = reach / Math.max(0.2, 69 * Math.cos((mid * Math.PI) / 180)) + 0.04;
      minLng -= lngReach;
      maxLng += lngReach;
      frame.current = { minLng, maxLng, minLat, maxLat, width, height, pad };
      const project = (lng: number, lat: number) => [
        pad + ((lng - minLng) / (maxLng - minLng)) * (width - pad * 2),
        pad + ((maxLat - lat) / (maxLat - minLat)) * (height - pad * 2),
      ] as const;
      const radius = (lat: number, miles: number) => {
        const [x1] = project(0, lat);
        const [x2] = project(miles / Math.max(0.2, 69 * Math.cos((lat * Math.PI) / 180)), lat);
        return Math.max(6, Math.abs(x2 - x1));
      };
      if (focus?.parcel) {
        const ring = flatten(focus.parcel.coordinates);
        if (ring.length) {
          ctx.beginPath();
          ring.forEach((pair, index) => {
            const [x, y] = project(pair[0], pair[1]);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.fillStyle = "rgba(140,198,68,0.18)";
          ctx.fill();
          ctx.strokeStyle = "#8CC644";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.stroke();
        }
      }
      for (const store of stores) {
        const [x, y] = project(store.lng, store.lat);
        const kind = locationStatus(store.status);
        ctx.strokeStyle = "#1F5F8B";
        ctx.lineWidth = 2;
        ctx.setLineDash(kind === "open" ? [] : kind === "under_construction" ? [10, 7] : [2, 10]);
        const miles = spacing.get(store.tenantId);
        if (miles && miles > 0) {
          ctx.beginPath();
          ctx.arc(x, y, radius(store.lat, miles), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(31,95,139,0.2)";
        ctx.fill();
        ctx.stroke();
      }
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [stores, spacing, focus]);

  return (
    <canvas
      ref={ref}
      className={cn("absolute inset-0 w-full h-full bg-canvas", adding ? "cursor-crosshair" : "")}
      onClick={(event) => {
        const box = frame.current;
        const canvas = ref.current;
        if (!adding || !box || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const lng = box.minLng + ((x - box.pad) / (box.width - box.pad * 2)) * (box.maxLng - box.minLng);
        const lat = box.maxLat - ((y - box.pad) / (box.height - box.pad * 2)) * (box.maxLat - box.minLat);
        if (Number.isFinite(lat) && Number.isFinite(lng)) onPlace(lat, lng);
      }}
    />
  );
}

function MapCanvas({
  base,
  stores,
  spacing,
  focus,
  adding,
  onPlace,
}: {
  base: BaseMap;
  stores: Store[];
  spacing: Map<string, number | null>;
  focus: Focus | null;
  adding: boolean;
  onPlace: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const ready = useRef(false);
  const snap = useRef({ stores, spacing, focus, onPlace, adding });
  snap.current = { stores, spacing, focus, onPlace, adding };
  const fitted = useRef("");

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    import("mapbox-gl").then((mod) => {
      if (cancelled || !ref.current) return;
      const mapboxgl = mod.default;
      if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: ref.current,
        style: styleFor(base),
        center: PHX_CENTER,
        zoom: 9,
        testMode: !MAPBOX_TOKEN,
        transformRequest: (url) => (!MAPBOX_TOKEN && /mapbox\.(com|cn)/.test(url) ? { url: "about:blank" } : { url }),
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("load", () => {
        if (!map) return;
        ready.current = true;
        fitted.current = "";
        map.addSource("parcel", { type: "geojson", data: empty() });
        map.addSource("rings", { type: "geojson", data: empty() });
        map.addLayer({ id: "parcel-fill", type: "fill", source: "parcel", paint: { "fill-color": GREEN, "fill-opacity": 0.15 } });
        map.addLayer({ id: "parcel-line", type: "line", source: "parcel", paint: { "line-color": GREEN, "line-width": 2 } });
        for (const value of LOCATION_STATUSES) {
          const dash = ringDash(value);
          map.addLayer({
            id: `ring-${value}`,
            type: "line",
            source: "rings",
            filter: ["==", ["get", "status"], value],
            paint: { "line-color": RING, "line-width": 2, "line-opacity": ["get", "opacity"], ...(dash ? { "line-dasharray": dash } : {}) },
          });
        }
        map.on("click", (event) => {
          if (!snap.current.adding) return;
          snap.current.onPlace(event.lngLat.lat, event.lngLat.lng);
        });
        paint(map, mapboxgl);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      ready.current = false;
      map?.remove();
      mapRef.current = null;
    };
    // Rebuild only when the base style changes. paint reads the latest snap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const fade = useRef(new Map<string, number>());
  const ghosts = useRef<Store[]>([]);

  const key = `${stores.map((store) => store.id + store.status).join()}|${focus?.lat ?? ""}|${focus?.lng ?? ""}`;
  useEffect(() => {
    const ids = new Set(stores.map((store) => store.id));
    const from = new Map(fade.current);
    for (const store of stores) if (!from.has(store.id)) from.set(store.id, 0);
    const leaving = ghosts.current.filter((store) => !ids.has(store.id));
    ghosts.current = [...stores, ...leaving];
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 320);
      const ease = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      const next = new Map<string, number>();
      for (const store of stores) {
        const begin = from.get(store.id) ?? 0;
        next.set(store.id, begin + (1 - begin) * ease);
      }
      for (const store of leaving) {
        const begin = from.get(store.id) ?? 1;
        next.set(store.id, begin * (1 - ease));
      }
      fade.current = next;
      const map = mapRef.current;
      if (map && ready.current) {
        import("mapbox-gl").then((mod) => {
          if (mapRef.current) paint(mapRef.current, mod.default);
        });
      }
      if (t < 1) raf = requestAnimationFrame(step);
      else ghosts.current = stores;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // `key` already changes when the store list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    mapRef.current?.getCanvas().style.setProperty("cursor", adding ? "crosshair" : "");
  }, [adding]);

  function paint(map: import("mapbox-gl").Map, mapboxgl: typeof import("mapbox-gl").default) {
    const current = snap.current;
    const parcel = map.getSource("parcel") as import("mapbox-gl").GeoJSONSource | undefined;
    const rings = map.getSource("rings") as import("mapbox-gl").GeoJSONSource | undefined;
    if (!parcel || !rings) return;
    const geometry = current.focus?.parcel;
    parcel.setData(geometry ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: geometry as GeoJSON.Geometry, properties: {} }] } : empty());
    const visible = ghosts.current.filter((store) => (fade.current.get(store.id) ?? 0) > 0.01);
    const features: GeoJSON.Feature[] = [];
    for (const store of visible) {
      const miles = current.spacing.get(store.tenantId);
      const opacity = fade.current.get(store.id) ?? 0;
      features.push(ringFeature(store, MARKER_MILES, opacity));
      if (miles && miles > 0) features.push(ringFeature(store, miles, opacity));
    }
    rings.setData({ type: "FeatureCollection", features });
    fitCamera(map, mapboxgl);
  }

  function fitCamera(map: import("mapbox-gl").Map, mapboxgl: typeof import("mapbox-gl").default) {
    const current = snap.current;
    const listing = current.focus?.lat != null && current.focus.lng != null;
    const sig = listing
      ? `listing:${current.focus?.lat},${current.focus?.lng}:${current.focus?.parcel ? "parcel" : "point"}`
      : `stores:${current.stores.map((store) => store.id).sort().join(",")}`;
    if (fitted.current === sig) return;
    fitted.current = sig;
    const geometry = current.focus?.parcel;
    if (geometry) {
      const bounds = new mapboxgl.LngLatBounds();
      flatten(geometry.coordinates).forEach((pair) => bounds.extend(pair as [number, number]));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 350 });
      return;
    }
    if (listing && current.focus?.lat != null && current.focus.lng != null) {
      map.easeTo({ center: [current.focus.lng, current.focus.lat], zoom: 15, duration: 350 });
      return;
    }
    if (!current.stores.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    current.stores.forEach((store) => bounds.extend([store.lng, store.lat]));
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 350 });
  }

  return <div ref={ref} className="absolute inset-0" />;
}

function ringFeature(store: Store, miles: number, opacity: number): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [circlePolygon(store.lng, store.lat, miles)] },
    properties: { status: locationStatus(store.status), opacity },
  };
}

function flatten(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number") return [value as number[]];
  return (value as unknown[]).flatMap(flatten);
}

function empty(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function styleFor(base: BaseMap): string | import("mapbox-gl").StyleSpecification {
  if (MAPBOX_TOKEN) {
    const name = base === "dark" ? "dark-v11" : base === "satellite" ? "satellite-streets-v12" : "light-v11";
    return `mapbox://styles/mapbox/${name}`;
  }
  const tiles =
    base === "dark"
      ? ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"]
      : base === "satellite"
        ? ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"]
        : ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"];
  return {
    version: 8,
    sources: { base: { type: "raster", tiles, tileSize: 256 } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}
