"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { MAPBOX_TOKEN, PHX_CENTER } from "@/lib/admin-constants";
import { Button, Input, Select, cn, FOCUS_RING, useToast } from "@/components/ui";
import { circlePolygon, DEMAND_LISTING_RADIUS_MILES, withinListingRadius } from "@/lib/demand/geo";
import { LOCATION_STATUSES, LOCATION_STATUS_LABEL, locationStatus, ringDash, type LocationStatus } from "@/lib/demand/location-status";
import { brandColor, googleMapsUrl, pinImageId, pinPlaceLabel, pinStrokeDash, PIN_MAX_DIAMETER, PIN_MIN_ZOOM, PIN_STREET_ZOOM, PIN_STROKE } from "@/lib/demand/pins";
import { fitOnFirstShow, groupMapCategories, withMapLocations, type MapFit } from "@/lib/demand/active-tenants";

export type BaseMap = "light" | "dark" | "satellite";

interface Brand {
  id: string;
  brandName: string;
  category: string;
  spacingMiles: number | null;
  locationCount: number;
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

interface LastPin {
  id: string;
  tenantId: string;
  store: Store;
}

const GREEN = "#8CC644";
const RING = "#1F5F8B";
/** Spacing rings use the tenant pin color, lighter than the dot itself. */
const RING_FILL_OPACITY = 0.16;
const RING_LINE_OPACITY = 0.5;

export default function BrandMap({
  listings,
  listingId,
  onListingId,
  query,
  onQuery,
  base,
  fits,
  brandEpoch,
}: {
  listings: ListingOption[];
  listingId: string;
  onListingId: (id: string) => void;
  query: string;
  onQuery: (value: string) => void;
  base: BaseMap;
  fits: { id: string; bucket: "optimal" | "possible" | "excluded"; score: number }[];
  brandEpoch: number;
}) {
  const toast = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const [stores, setStores] = useState<Record<string, Store[]>>({});
  const [lastPin, setLastPin] = useState<LastPin | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<Focus | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [fitScope, setFitScope] = useState<"listing" | "tenant">("listing");
  const [selection, setSelection] = useState<{ id: string; x: number; y: number } | null>(null);
  const storesRef = useRef(stores);
  const addingRef = useRef(addingId);
  const pendingRef = useRef(pending);
  storesRef.current = stores;
  addingRef.current = addingId;
  pendingRef.current = pending;

  const requestFit = useCallback((scope: "listing" | "tenant") => {
    setFitScope(scope);
    setFitRequest((value) => value + 1);
  }, []);

  const stopAdding = useCallback(() => {
    addingRef.current = null;
    setAddingId(null);
    setPending(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/demand/brands")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Could not load");
        return body;
      })
      .then((body) => {
        if (!cancelled) setBrands(body as Brand[]);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load"));
    return () => {
      cancelled = true;
    };
  }, [toast, brandEpoch]);

  useEffect(() => {
    if (!listingId) {
      setFocus(null);
      return;
    }
    let cancelled = false;
    setFocus(null);
    apiFetch(`/api/demand/focus?listingId=${listingId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Could not load");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setFocus(body as Focus);
        if (!addingRef.current) requestFit("listing");
      })
      .catch(() => {
        if (!cancelled) setFocus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, requestFit]);

  // Pin placement is tied to the current map click. Tenants stay on the map
  // when the listing changes. Category disclosure starts over.
  useEffect(() => {
    addingRef.current = null;
    setAddingId(null);
    setPending(null);
    setOpened({});
    setSelection(null);
    setLastPin(null);
  }, [listingId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (addingRef.current || pendingRef.current) {
        stopAdding();
        return;
      }
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stopAdding]);

  const fitById = useMemo(() => {
    const map = new Map<string, MapFit>();
    for (const fit of fits) map.set(fit.id, { bucket: fit.bucket, score: fit.score });
    return map;
  }, [fits]);
  const groups = useMemo(
    () => groupMapCategories(withMapLocations(brands), query, listingId ? fitById : null),
    [brands, query, listingId, fitById]
  );

  const origin = focus?.lat != null && focus.lng != null ? { lat: focus.lat, lng: focus.lng } : null;
  const shown = active
    .flatMap((id) => stores[id] || [])
    .filter((store) => withinListingRadius(origin, store.lat, store.lng));
  const spacing = new Map(brands.map((brand) => [brand.id, brand.spacingMiles]));
  const colors = new Map(brands.map((brand) => [brand.id, brandColor(brand.brandName)]));
  const selected = selection ? shown.find((store) => store.id === selection.id) || null : null;
  const searching = query.trim().length > 0;

  function locationHint(brand: Brand): string | null {
    const loaded = stores[brand.id];
    const knownEmpty = loaded ? loaded.length === 0 : brand.locationCount === 0;
    if (knownEmpty) return "No locations";
    if (!active.includes(brand.id) || !loaded || !listingId || !origin) return null;
    const near = loaded.filter((store) => withinListingRadius(origin, store.lat, store.lng));
    return near.length === 0 ? "None within 10 mi" : null;
  }

  function categoryOpen(category: string): boolean {
    if (searching) return true;
    if (category in opened) return opened[category];
    return !listingId;
  }

  function toggleCategory(category: string) {
    if (searching) return;
    const open = categoryOpen(category);
    setOpened((current) => ({ ...current, [category]: !open }));
  }

  function addToMap(ids: string[]): boolean {
    const have = new Set(active);
    const fresh = ids.filter((id) => !have.has(id));
    if (!fresh.length) return false;
    setActive((current) => [...current, ...fresh]);
    return true;
  }

  async function loadStores(ids: string[]) {
    const missing = ids.filter((id) => !storesRef.current[id]);
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

  function deactivate(id: string) {
    if (!active.includes(id)) return;
    if (addingRef.current === id) stopAdding();
    setActive(active.filter((item) => item !== id));
    setSelection((current) => {
      if (!current) return null;
      const owns = (storesRef.current[id] || []).some((store) => store.id === current.id);
      return owns ? null : current;
    });
  }

  async function activate(id: string) {
    const shownBefore = active.length;
    if (!addToMap([id])) return;
    await loadStores([id]);
    if (fitOnFirstShow(shownBefore) && !addingRef.current) requestFit("tenant");
  }

  function selectForAdd(id: string) {
    addingRef.current = id;
    setAddingId(id);
    setPending(null);
    setSelection(null);
    if (!active.includes(id)) {
      addToMap([id]);
      void loadStores([id]);
    }
  }

  function clearMap() {
    stopAdding();
    setActive([]);
    setSelection(null);
  }

  function armPlace(lat: number, lng: number, x: number, y: number) {
    if (!addingRef.current) return;
    setPending({ lat, lng, x, y });
  }

  async function commitPlace(status: LocationStatus) {
    const tenantId = addingRef.current;
    const point = pendingRef.current;
    if (!tenantId || !point) return;
    const res = await apiFetch("/api/demand/locations", {
      method: "POST",
      body: JSON.stringify({ tenantId, lat: point.lat, lng: point.lng, status }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error || "Could not save");
      return;
    }
    const store = { ...(body as Store), status: locationStatus((body as Store).status) };
    setStores((current) => ({ ...current, [tenantId]: [...(current[tenantId] || []), store] }));
    bumpLocations(tenantId, 1);
    setLastPin({ id: store.id, tenantId, store });
    setPending(null);
  }

  async function undo() {
    const pin = lastPin;
    if (!pin) return;
    setLastPin(null);
    setStores((current) => ({
      ...current,
      [pin.tenantId]: (current[pin.tenantId] || []).filter((store) => store.id !== pin.id),
    }));
    const res = await apiFetch(`/api/demand/locations/${pin.id}`, { method: "DELETE" });
    if (res.ok) bumpLocations(pin.tenantId, -1);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setStores((current) => ({
        ...current,
        [pin.tenantId]: [...(current[pin.tenantId] || []).filter((store) => store.id !== pin.id), pin.store],
      }));
      setLastPin(pin);
      toast.error(body?.error || "Could not remove the pin");
    }
  }

  async function setPinStatus(store: Store, next: LocationStatus) {
    const previous = store.status;
    patchStore(store.tenantId, store.id, { status: next });
    const res = await apiFetch(`/api/demand/locations/${store.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      patchStore(store.tenantId, store.id, { status: previous });
      toast.error(body?.error || "Could not save");
    }
  }

  function bumpLocations(tenantId: string, delta: number) {
    setBrands((current) =>
      current.map((brand) =>
        brand.id === tenantId ? { ...brand, locationCount: Math.max(0, brand.locationCount + delta) } : brand
      )
    );
  }

  function patchStore(tenantId: string, id: string, patch: Partial<Store>) {
    setStores((current) => ({
      ...current,
      [tenantId]: (current[tenantId] || []).map((store) => (store.id === id ? { ...store, ...patch } : store)),
    }));
  }

  async function deletePin(store: Store) {
    setSelection(null);
    setStores((current) => ({
      ...current,
      [store.tenantId]: (current[store.tenantId] || []).filter((item) => item.id !== store.id),
    }));
    const res = await apiFetch(`/api/demand/locations/${store.id}`, { method: "DELETE" });
    if (res.ok) bumpLocations(store.tenantId, -1);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setStores((current) => ({
        ...current,
        [store.tenantId]: [...(current[store.tenantId] || []).filter((item) => item.id !== store.id), store],
      }));
      toast.error(body?.error || "Could not delete");
    }
  }

  function renderBrand(brand: Brand) {
    const onMap = active.includes(brand.id);
    const top = Boolean(listingId && fitById.get(brand.id)?.bucket === "optimal");
    return (
      <BrandRow
        key={brand.id}
        brand={brand}
        color={onMap ? colors.get(brand.id) || brandColor(brand.brandName) : undefined}
        on={onMap}
        top={top}
        adding={addingId === brand.id}
        dim={addingId != null && addingId !== brand.id}
        hint={locationHint(brand)}
        onToggle={() => {
          if (onMap) deactivate(brand.id);
          else void activate(brand.id);
        }}
        onAdd={() => selectForAdd(brand.id)}
        onDone={stopAdding}
      />
    );
  }

  return (
    <div className="absolute inset-0">
      <MapCanvas
        base={base}
        stores={shown}
        spacing={spacing}
        colors={colors}
        focus={focus}
        adding={!!addingId}
        fitRequest={fitRequest}
        fitScope={fitScope}
        onPlace={armPlace}
        onSelect={(store, x, y) => setSelection(store ? { id: store.id, x, y } : null)}
      />
      {selected && selection && (
        <PinCard
          store={selected}
          color={colors.get(selected.tenantId) || brandColor(selected.tenantId)}
          x={selection.x}
          y={selection.y}
          onStatus={(next) => setPinStatus(selected, next)}
          onDelete={() => deletePin(selected)}
          onClose={() => setSelection(null)}
        />
      )}
      {pending && addingId && (
        <StatusPopover
          x={pending.x}
          y={pending.y}
          brandName={brands.find((brand) => brand.id === addingId)?.brandName || "Location"}
          onPick={(status) => void commitPlace(status)}
        />
      )}
      <aside className="absolute top-[5px] left-[5px] bottom-[5px] w-1/4 min-w-[220px] bg-surface border border-border rounded-card shadow-popover flex flex-col min-h-0 z-10">
        <div className="p-2 space-y-2 border-b border-border">
          <Select small aria-label="Listing" value={listingId} onChange={(e) => onListingId(e.target.value)}>
            <option value="">All listings</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>{listing.name}</option>
            ))}
          </Select>
          <Input small aria-label="Search" placeholder="Search" value={query} onChange={(e) => onQuery(e.target.value)} />
          {active.length > 0 && (
            <div className="flex justify-end">
              <button type="button" aria-label="Clear map" onClick={clearMap} className={cn("text-xs text-text-2 hover:text-text", FOCUS_RING)}>
                Clear map
              </button>
            </div>
          )}
          {addingId && (
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 text-xs text-text truncate">{brands.find((brand) => brand.id === addingId)?.brandName}</p>
              {lastPin && (
                <Button variant="ghost" size="sm" onClick={undo}>Undo</Button>
              )}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {groups.map((group) => {
            const open = categoryOpen(group.category);
            const rows = open ? group.all : listingId ? group.shown : [];
            return (
              <section key={group.category} className="mt-1 first:mt-0" aria-label={group.category}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${group.category}, ${group.count}`}
                  onClick={() => toggleCategory(group.category)}
                  className={cn("flex w-full items-center gap-1.5 border-y border-border px-3 py-1.5 text-left", FOCUS_RING)}
                >
                  <span className="min-w-0 truncate text-base font-semibold text-text">{group.category}</span>
                  <span className="shrink-0 text-xs tabular-nums text-text-3">{group.count}</span>
                  <span className="ml-auto inline-flex shrink-0 text-text-3">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </button>
                {rows.length > 0 && <div role="list">{rows.map((brand) => renderBrand(brand))}</div>}
              </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function BrandRow({
  brand,
  color,
  on,
  top,
  adding,
  dim,
  hint,
  onToggle,
  onAdd,
  onDone,
}: {
  brand: Brand;
  color?: string;
  on: boolean;
  top: boolean;
  adding: boolean;
  dim: boolean;
  hint: string | null;
  onToggle: () => void;
  onAdd: () => void;
  onDone: () => void;
}) {
  return (
    <div
      role="listitem"
      className={cn(
        "group flex w-full items-center pl-4",
        top && "bg-warning-bg",
        on && "ring-2 ring-inset ring-black",
        adding && !dim && !on && !top && "bg-surface-2"
      )}
    >
      {color && (
        <span className="flex w-5 shrink-0 justify-center" aria-hidden>
          <span
            className={cn("h-2.5 w-2.5 rounded-full border-2 border-white ring-1 ring-border", dim && "opacity-40")}
            style={{ background: color }}
          />
        </span>
      )}
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cn(
          "flex-1 min-w-0 text-left px-2 py-1.5 text-sm",
          dim ? "text-text-3" : "text-text",
          top && !dim && "font-medium",
          FOCUS_RING
        )}
      >
        <span className="block truncate">{brand.brandName}</span>
        {hint && <span className="block text-xs font-normal text-text-3">{hint}</span>}
      </button>
      {adding ? (
        <button type="button" onClick={onDone} className={cn("shrink-0 px-2 py-1 text-sm text-text", FOCUS_RING)}>Done</button>
      ) : (
        <button
          type="button"
          aria-label={`Add a location for ${brand.brandName}`}
          onClick={onAdd}
          className={cn(
            "shrink-0 px-2 py-1 text-text-3 transition-opacity duration-150",
            dim ? "opacity-25 group-hover:opacity-70" : "opacity-40 group-hover:text-text-2 group-hover:opacity-90",
            FOCUS_RING
          )}
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

function StatusPopover({
  x,
  y,
  brandName,
  onPick,
}: {
  x: number;
  y: number;
  brandName: string;
  onPick: (status: LocationStatus) => void;
}) {
  const left = Math.max(x + 12, 16);
  const top = Math.max(8, y - 8);
  return (
    <div
      role="dialog"
      aria-label="Location status"
      className="absolute z-30 w-44 bg-surface border border-border rounded-card shadow-popover p-2"
      style={{ left: `min(${left}px, calc(100% - 12rem))`, top: `min(${top}px, calc(100% - 10rem))` }}
    >
      <p className="px-1 pb-1 text-xs text-text-3 truncate">{brandName}</p>
      <div className="flex flex-col gap-1">
        {LOCATION_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            className={cn("h-7 px-2 text-left rounded-control text-xs font-medium border border-border text-text-2 hover:bg-surface-2 hover:text-text", FOCUS_RING)}
          >
            {LOCATION_STATUS_LABEL[value]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PinCard({
  store,
  color,
  x,
  y,
  onStatus,
  onDelete,
  onClose,
}: {
  store: Store;
  color: string;
  x: number;
  y: number;
  onStatus: (status: LocationStatus) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const label = pinPlaceLabel(store.address, store.lat, store.lng);
  const left = Math.max(x + 12, 16);
  const top = Math.max(8, y - 8);

  async function copy() {
    try {
      await navigator.clipboard.writeText(label);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div
      className="absolute z-30 w-64 bg-surface border border-border rounded-card shadow-popover p-3"
      style={{ left: `min(${left}px, calc(100% - 17rem))`, top: `min(${top}px, calc(100% - 14rem))` }}
      role="dialog"
      aria-label="Location"
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 border-2 border-white" style={{ background: color }} />
        <p className="flex-1 min-w-0 text-sm text-text">{label}</p>
        <button type="button" aria-label="Copy address" onClick={copy} className={cn("shrink-0 text-text-2 hover:text-text", FOCUS_RING)}>
          <Copy size={14} strokeWidth={1.75} />
        </button>
      </div>
      <a
        className="mt-2 inline-block text-sm text-text-2 underline hover:text-text"
        href={googleMapsUrl(store.lat, store.lng)}
        target="_blank"
        rel="noreferrer"
      >
        Open in Google Maps
      </a>
      <div className="flex flex-wrap gap-1 mt-3">
        {LOCATION_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={store.status === value}
            onClick={() => onStatus(value)}
            className={cn(
              "h-7 px-2 rounded-control text-xs font-medium border border-border",
              store.status === value ? "bg-surface-2 text-text" : "text-text-2",
              FOCUS_RING
            )}
          >
            {LOCATION_STATUS_LABEL[value]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        {confirming ? (
          <>
            <span className="text-sm text-text-2">Delete this pin?</span>
            <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function MapCanvas({
  base,
  stores,
  spacing,
  colors,
  focus,
  adding,
  fitRequest,
  fitScope,
  onPlace,
  onSelect,
  view,
}: {
  base: BaseMap;
  stores: Store[];
  spacing: Map<string, number | null>;
  colors: Map<string, string>;
  focus: Focus | null;
  adding: boolean;
  fitRequest: number;
  /** "listing" keeps the listing fit. "tenant" frames only the locations just shown. */
  fitScope: "listing" | "tenant";
  onPlace: (lat: number, lng: number, x: number, y: number) => void;
  onSelect: (store: Store | null, x: number, y: number) => void;
  /** Optional camera. The demand page leaves this unset. */
  view?: { lng: number; lat: number; zoom: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const glRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const ready = useRef(false);
  const appliedBase = useRef<BaseMap | null>(null);
  const wantedBase = useRef(base);
  const snap = useRef({ stores, spacing, colors, focus, onPlace, onSelect, adding, fitRequest, fitScope, view });
  const lastFit = useRef(0);
  wantedBase.current = base;
  snap.current = { stores, spacing, colors, focus, onPlace, onSelect, adding, fitRequest, fitScope, view };

  const dataSig = [
    stores.map((store) => `${store.id}:${store.status}:${store.lat}:${store.lng}:${store.tenantId}`).join(","),
    Array.from(spacing.entries()).map(([id, miles]) => `${id}:${miles ?? ""}`).join(","),
    Array.from(colors.entries()).map(([id, color]) => `${id}:${color}`).join(","),
    focus ? `${focus.lat ?? ""}:${focus.lng ?? ""}:${focus.parcel ? "parcel" : "dot"}` : "",
  ].join("|");

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    let observer: ResizeObserver | null = null;
    import("mapbox-gl").then((mod) => {
      if (cancelled || !ref.current) return;
      const mapboxgl = mod.default;
      glRef.current = mapboxgl;
      if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;
      const initial = wantedBase.current;
      map = new mapboxgl.Map({
        container: ref.current,
        style: styleFor(initial),
        center: PHX_CENTER,
        zoom: 9,
        testMode: !MAPBOX_TOKEN,
        transformRequest: (url) => (!MAPBOX_TOKEN && /mapbox\.(com|cn)/.test(url) ? { url: "about:blank" } : { url }),
      });
      appliedBase.current = initial;
      map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
      observer = new ResizeObserver(() => map?.resize());
      if (ref.current) observer.observe(ref.current);
      map.on("click", (event) => {
        const current = snap.current;
        if (current.adding) {
          current.onPlace(event.lngLat.lat, event.lngLat.lng, event.point.x, event.point.y);
          return;
        }
        const mapNow = mapRef.current;
        if (!mapNow || !mapNow.getLayer("pins")) {
          current.onSelect(null, 0, 0);
          return;
        }
        const hits = mapNow.queryRenderedFeatures(event.point, { layers: ["pins"] });
        const hit = hits[0];
        if (!hit) {
          current.onSelect(null, event.point.x, event.point.y);
          return;
        }
        const id = String(hit.properties?.id ?? hit.id ?? "");
        const store = current.stores.find((item) => item.id === id) || null;
        current.onSelect(store, event.point.x, event.point.y);
      });
      map.on("load", () => {
        if (!map) return;
        ready.current = true;
        if (wantedBase.current !== appliedBase.current) {
          switchStyle(map, wantedBase.current);
          return;
        }
        mount(map);
        map.resize();
        reconcile(map);
        const camera = snap.current.view;
        if (camera) map.jumpTo({ center: [camera.lng, camera.lat], zoom: camera.zoom });
        maybeFit();
        syncCursor(map);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      ready.current = false;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once. switchStyle is called from the load handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || appliedBase.current === base) return;
    switchStyle(map, base);
    // switchStyle closes over the latest snap ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    reconcile(map);
    // reconcile reads snap.current, which dataSig already describes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSig]);

  useEffect(() => {
    maybeFit();
    // maybeFit reads the map ref and the latest snap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest, adding]);

  const viewLng = view?.lng;
  const viewLat = view?.lat;
  const viewZoom = view?.zoom;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || viewLng == null || viewLat == null || viewZoom == null) return;
    map.jumpTo({ center: [viewLng, viewLat], zoom: viewZoom });
  }, [viewLng, viewLat, viewZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) syncCursor(map);
  }, [adding]);

  function switchStyle(map: import("mapbox-gl").Map, next: BaseMap) {
    const camera = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    appliedBase.current = next;
    map.once("style.load", () => {
      map.jumpTo(camera);
      mount(map);
      reconcile(map);
      syncCursor(map);
    });
    map.setStyle(styleFor(next));
  }

  function syncCursor(map: import("mapbox-gl").Map) {
    map.getCanvas().style.cursor = snap.current.adding ? "crosshair" : "";
    if (snap.current.adding) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }

  function maybeFit() {
    const map = mapRef.current;
    const mapboxgl = glRef.current;
    if (!map || !mapboxgl || !ready.current) return;
    if (snap.current.adding) return;
    if (lastFit.current === snap.current.fitRequest) return;
    lastFit.current = snap.current.fitRequest;
    if (!snap.current.fitRequest) return;
    const bounds = new mapboxgl.LngLatBounds();
    let count = 0;
    for (const store of snap.current.stores) {
      bounds.extend([store.lng, store.lat]);
      count += 1;
    }
    // The first tenant on an empty map is framed on its locations.
    // Listing selection still includes the listing, as before.
    if (snap.current.fitScope !== "tenant") {
      const currentFocus = snap.current.focus;
      if (currentFocus?.lat != null && currentFocus.lng != null) {
        for (const pair of circlePolygon(currentFocus.lng, currentFocus.lat, DEMAND_LISTING_RADIUS_MILES, 16)) {
          bounds.extend(pair as [number, number]);
          count += 1;
        }
      } else if (currentFocus?.parcel) {
        for (const pair of flatten(currentFocus.parcel.coordinates)) {
          if (pair.length >= 2) {
            bounds.extend([pair[0], pair[1]]);
            count += 1;
          }
        }
      }
    }
    if (!count || bounds.isEmpty()) return;
    const width = map.getContainer().clientWidth;
    const left = Math.max(240, Math.round(width * 0.25) + 24);
    map.fitBounds(bounds, { padding: { top: 56, right: 56, bottom: 72, left }, maxZoom: 15, duration: 350 });
  }

  function reconcile(map: import("mapbox-gl").Map) {
    if (!map.getSource("pins")) return;
    const current = snap.current;
    ensureIcons(map, current.stores, current.colors);
    writeSources(map, current.stores, current);
  }

  return (
    <div className="absolute inset-0">
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}

function mount(map: import("mapbox-gl").Map) {
  if (map.getSource("parcel")) return;
  map.addSource("parcel", { type: "geojson", data: empty() });
  map.addSource("rings", { type: "geojson", data: empty() });
  map.addSource("listing-dot", { type: "geojson", data: empty() });
  map.addSource("pins", { type: "geojson", data: empty() });
  map.addSource("radius", { type: "geojson", data: empty() });
  map.addLayer({ id: "parcel-fill", type: "fill", source: "parcel", paint: { "fill-color": GREEN, "fill-opacity": 0.15 } });
  map.addLayer({ id: "parcel-line", type: "line", source: "parcel", paint: { "line-color": GREEN, "line-width": 2 } });
  map.addLayer({ id: "listing-radius", type: "line", source: "radius", paint: { "line-color": RING, "line-width": 1.5, "line-opacity": 0.35 } });
  map.addLayer({
    id: "ring-fill",
    type: "fill",
    source: "rings",
    paint: { "fill-color": ["get", "color"], "fill-opacity": RING_FILL_OPACITY },
  });
  for (const value of LOCATION_STATUSES) {
    const dash = ringDash(value);
    map.addLayer({
      id: `ring-${value}`,
      type: "line",
      source: "rings",
      filter: ["==", ["get", "status"], value],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2,
        // Location ids are UUIDs. Mapbox feature-state only accepts ids that
        // cast to integers, so a feature-state opacity defaulting to 0 left
        // every ring (and every pin) invisible. Paint is a plain number.
        "line-opacity": RING_LINE_OPACITY,
        ...(dash ? { "line-dasharray": dash } : {}),
      },
    });
  }
  map.addLayer({
    id: "listing-dot",
    type: "circle",
    source: "listing-dot",
    paint: {
      "circle-radius": 6,
      "circle-color": GREEN,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: "pins",
    type: "symbol",
    source: "pins",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], PIN_MIN_ZOOM, 6 / PIN_MAX_DIAMETER, PIN_STREET_ZOOM, 1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-anchor": "center",
    },
    paint: {
      "icon-opacity": 1,
    },
  });
}

function writeSources(
  map: import("mapbox-gl").Map,
  stores: Store[],
  current: { spacing: Map<string, number | null>; colors: Map<string, string>; focus: Focus | null }
) {
  const parcel = map.getSource("parcel") as import("mapbox-gl").GeoJSONSource | undefined;
  const rings = map.getSource("rings") as import("mapbox-gl").GeoJSONSource | undefined;
  const dot = map.getSource("listing-dot") as import("mapbox-gl").GeoJSONSource | undefined;
  const pins = map.getSource("pins") as import("mapbox-gl").GeoJSONSource | undefined;
  const radius = map.getSource("radius") as import("mapbox-gl").GeoJSONSource | undefined;
  if (!parcel || !rings || !dot || !pins || !radius) return;
  const geometry = current.focus?.parcel;
  parcel.setData(geometry ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: geometry as GeoJSON.Geometry, properties: {} }] } : empty());
  const point = current.focus?.lat != null && current.focus.lng != null && !geometry
    ? {
        type: "FeatureCollection" as const,
        features: [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [current.focus.lng, current.focus.lat] }, properties: {} }],
      }
    : empty();
  dot.setData(point);
  const focusPoint = current.focus?.lat != null && current.focus.lng != null;
  radius.setData(
    focusPoint
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [circlePolygon(current.focus!.lng as number, current.focus!.lat as number, DEMAND_LISTING_RADIUS_MILES)] },
              properties: {},
            },
          ],
        }
      : empty()
  );
  const ringFeatures: GeoJSON.Feature[] = [];
  const pinFeatures: GeoJSON.Feature[] = [];
  for (const store of stores) {
    const miles = current.spacing.get(store.tenantId);
    const kind = locationStatus(store.status);
    const color = current.colors.get(store.tenantId) || brandColor(store.tenantId);
    if (miles && miles > 0) {
      ringFeatures.push({
        type: "Feature",
        id: store.id,
        geometry: { type: "Polygon", coordinates: [circlePolygon(store.lng, store.lat, miles)] },
        properties: { status: kind, color },
      });
    }
    pinFeatures.push({
      type: "Feature",
      id: store.id,
      geometry: { type: "Point", coordinates: [store.lng, store.lat] },
      properties: { id: store.id, status: kind, icon: pinImageId(color, kind) },
    });
  }
    rings.setData({ type: "FeatureCollection", features: ringFeatures });
    pins.setData({ type: "FeatureCollection", features: pinFeatures });
}

function ensureIcons(map: import("mapbox-gl").Map, stores: Store[], colors: Map<string, string>) {
  for (const store of stores) {
    const color = colors.get(store.tenantId) || brandColor(store.tenantId);
    const kind = locationStatus(store.status);
    const id = pinImageId(color, kind);
    if (map.hasImage(id)) continue;
    const image = drawPin(color, kind);
    if (image) map.addImage(id, image, { pixelRatio: 2 });
  }
}

function drawPin(color: string, status: LocationStatus): ImageData | null {
  const pixelRatio = 2;
  const diameter = PIN_MAX_DIAMETER;
  const pad = 2;
  const logical = diameter + PIN_STROKE + pad * 2;
  const size = logical * pixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const center = size / 2;
  ctx.beginPath();
  ctx.arc(center, center, (diameter / 2) * pixelRatio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = PIN_STROKE * pixelRatio;
  ctx.strokeStyle = "#ffffff";
  const dash = pinStrokeDash(status);
  ctx.setLineDash(dash ? dash.map((part) => part * pixelRatio) : []);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
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
