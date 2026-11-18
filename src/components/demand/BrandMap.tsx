"use client";

import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Eye, EyeOff, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { MAPBOX_TOKEN, PHX_CENTER } from "@/lib/admin-constants";
import { Button, Input, Select, cn, FOCUS_RING, useToast } from "@/components/ui";
import { BUCKET_LABEL } from "@/lib/demand/types";
import { circlePolygon, DEMAND_LISTING_RADIUS_MILES, withinListingRadius } from "@/lib/demand/geo";
import { SHOW_ALL_TOOLTIP, showAllAllowed } from "@/lib/demand/board";
import { LOCATION_STATUSES, LOCATION_STATUS_LABEL, locationStatus, ringDash, type LocationStatus } from "@/lib/demand/location-status";
import { brandColor, googleMapsUrl, pinImageId, pinPlaceLabel, pinStrokeDash, PIN_MAX_DIAMETER, PIN_MIN_ZOOM, PIN_STREET_ZOOM, PIN_STROKE } from "@/lib/demand/pins";
import { partitionTenants, tenantMatchesQuery } from "@/lib/demand/active-tenants";

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
const FLIP_MS = 420;
const FLIP_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const MAX_FLY = 12;

type RowSnap = { rect: DOMRect; zone: string };

function stageRowFlip(
  nodes: Map<string, HTMLDivElement>,
  prev: Map<string, RowSnap>,
  activeScroller: HTMLElement | null,
  clones: HTMLElement[]
): { play: () => void; cancel: () => void } {
  const noop = { play() {}, cancel() {} };
  for (const clone of [...clones]) clone.remove();
  clones.length = 0;
  for (const el of Array.from(nodes.values())) {
    if (!el.isConnected) continue;
    el.style.transition = "none";
    el.style.transform = "";
    el.style.visibility = "";
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return noop;

  for (const [id, el] of Array.from(nodes.entries())) {
    if (!el.isConnected) nodes.delete(id);
  }

  const moves: { el: HTMLDivElement; before: RowSnap; zoneChanged: boolean }[] = [];
  for (const [id, el] of Array.from(nodes.entries())) {
    const before = prev.get(id);
    if (!before) continue;
    moves.push({ el, before, zoneChanged: before.zone !== (el.dataset.zone || "") });
  }
  const zoneChanges = moves.filter((move) => move.zoneChanged).length;
  if (zoneChanges > MAX_FLY) return noop;

  const firstActive = activeScroller?.querySelector("[data-zone='active']");
  let pinToTop = false;
  let revealed = false;
  for (const move of moves) {
    if (!move.zoneChanged) continue;
    if (move.el.dataset.zone === "active" && move.el === firstActive) pinToTop = true;
    if (!revealed && move.el.dataset.zone === "list" && move.before.zone === "active") {
      revealRow(move.el);
      revealed = true;
    }
  }
  if (pinToTop && activeScroller) activeScroller.scrollTop = 0;

  const plays: Array<() => void> = [];
  const cancels: Array<() => void> = [];

  for (const move of moves) {
    const to = move.el.getBoundingClientRect();
    const dx = move.before.rect.left - to.left;
    const dy = move.before.rect.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    if (move.zoneChanged) {
      const clone = move.el.cloneNode(true) as HTMLDivElement;
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");
      clone.style.position = "fixed";
      clone.style.margin = "0";
      clone.style.left = `${move.before.rect.left}px`;
      clone.style.top = `${move.before.rect.top}px`;
      clone.style.width = `${move.before.rect.width}px`;
      clone.style.height = `${move.before.rect.height}px`;
      clone.style.zIndex = "40";
      clone.style.pointerEvents = "none";
      clone.style.transition = "none";
      clone.style.transform = "translate(0px, 0px)";
      clone.style.boxSizing = "border-box";
      const bg = getComputedStyle(move.el).backgroundColor;
      clone.style.backgroundColor = bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)" ? bg : "#ffffff";
      clone.classList.add("shadow-popover");
      document.body.appendChild(clone);
      clones.push(clone);
      move.el.style.visibility = "hidden";
      const el = move.el;
      const targetX = to.left - move.before.rect.left;
      const targetY = to.top - move.before.rect.top;
      plays.push(() => {
        clone.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASE}, width ${FLIP_MS}ms ${FLIP_EASE}, height ${FLIP_MS}ms ${FLIP_EASE}`;
        clone.style.transform = `translate(${targetX}px, ${targetY}px)`;
        clone.style.width = `${to.width}px`;
        clone.style.height = `${to.height}px`;
        const timer = window.setTimeout(finish, FLIP_MS + 60);
        function finish() {
          window.clearTimeout(timer);
          if (!clone.isConnected) return;
          clone.remove();
          const index = clones.indexOf(clone);
          if (index >= 0) clones.splice(index, 1);
          if (el.isConnected) el.style.visibility = "";
        }
      });
      cancels.push(() => {
        clone.remove();
        const index = clones.indexOf(clone);
        if (index >= 0) clones.splice(index, 1);
        if (el.isConnected) el.style.visibility = "";
      });
    } else {
      const el = move.el;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      plays.push(() => {
        el.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASE}`;
        el.style.transform = "";
        el.addEventListener(
          "transitionend",
          () => {
            el.style.transition = "";
          },
          { once: true }
        );
      });
      cancels.push(() => {
        el.style.transition = "";
        el.style.transform = "";
      });
    }
  }

  return {
    play() {
      if (plays.length) document.body.getBoundingClientRect();
      for (const run of plays) run();
    },
    cancel() {
      for (const run of cancels) run();
    },
  };
}

function revealRow(el: HTMLElement) {
  const scroller = el.closest("[data-brand-scroll]");
  if (!(scroller instanceof HTMLElement)) return;
  const row = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (row.top < box.top) scroller.scrollTop -= box.top - row.top;
  else if (row.bottom > box.bottom) scroller.scrollTop += row.bottom - box.bottom;
}

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
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [selection, setSelection] = useState<{ id: string; x: number; y: number } | null>(null);
  const storesRef = useRef(stores);
  const addingRef = useRef(addingId);
  const pendingRef = useRef(pending);
  const rowNodes = useRef(new Map<string, HTMLDivElement>());
  const flipPrev = useRef<Map<string, RowSnap> | null>(null);
  const flipClones = useRef<HTMLElement[]>([]);
  const activeScroll = useRef<HTMLDivElement>(null);
  storesRef.current = stores;
  addingRef.current = addingId;
  pendingRef.current = pending;

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
        if (!addingRef.current) setFitRequest((value) => value + 1);
      })
      .catch(() => {
        if (!cancelled) setFocus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  // Pin placement is tied to the current map click. The active set stays,
  // so switching listings does not take tenants off the map.
  useEffect(() => {
    addingRef.current = null;
    setAddingId(null);
    setPending(null);
    setShowAll(false);
    setSelection(null);
    setLastPin(null);
  }, [listingId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingRef.current) {
        setPending(null);
        return;
      }
      if (addingRef.current) {
        addingRef.current = null;
        setAddingId(null);
        return;
      }
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useLayoutEffect(() => {
    const prev = flipPrev.current;
    if (!prev) return;
    const staged = stageRowFlip(rowNodes.current, prev, activeScroll.current, flipClones.current);
    let played = false;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        played = true;
        flipPrev.current = null;
        staged.play();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (!played) staged.cancel();
    };
  });

  useEffect(() => {
    const clones = flipClones.current;
    return () => {
      for (const clone of clones) clone.remove();
      clones.length = 0;
    };
  }, []);

  const { active: activeBrands, list: filtered } = partitionTenants(brands, active, query);
  const fitById = new Map(fits.map((fit) => [fit.id, fit]));
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

  const origin = focus?.lat != null && focus.lng != null ? { lat: focus.lat, lng: focus.lng } : null;
  const shown = active
    .flatMap((id) => stores[id] || [])
    .filter((store) => withinListingRadius(origin, store.lat, store.lng));
  const spacing = new Map(brands.map((brand) => [brand.id, brand.spacingMiles]));
  const colors = new Map(brands.map((brand) => [brand.id, brandColor(brand.brandName)]));
  const boardIds = listingId
    ? fits.map((fit) => fit.id)
    : brands.filter((brand) => tenantMatchesQuery(brand, query)).map((brand) => brand.id);
  const showing = active.length > 0;
  const showBlocked = !showing && !showAllAllowed(boardIds.length);
  const selected = selection ? shown.find((store) => store.id === selection.id) || null : null;

  function locationHint(brand: Brand): string | null {
    const loaded = stores[brand.id];
    const knownEmpty = loaded ? loaded.length === 0 : brand.locationCount === 0;
    if (knownEmpty) return "No locations";
    if (!active.includes(brand.id) || !loaded || !listingId || !origin) return null;
    const near = loaded.filter((store) => withinListingRadius(origin, store.lat, store.lng));
    return near.length === 0 ? "None within 10 mi" : null;
  }

  function bindRow(id: string, node: HTMLDivElement | null) {
    if (node) {
      rowNodes.current.set(id, node);
      return;
    }
    const current = rowNodes.current.get(id);
    if (current && !current.isConnected) rowNodes.current.delete(id);
  }

  function armFlip() {
    const snap = new Map<string, RowSnap>();
    for (const [id, el] of Array.from(rowNodes.current.entries())) {
      if (!el.isConnected) continue;
      snap.set(id, { rect: el.getBoundingClientRect(), zone: el.dataset.zone || "" });
    }
    flipPrev.current = snap;
  }

  function addActive(ids: string[], place: "start" | "end"): boolean {
    const have = new Set(active);
    const fresh = ids.filter((id) => !have.has(id));
    if (!fresh.length) return false;
    armFlip();
    setActive(place === "start" ? [...fresh, ...active] : [...active, ...fresh]);
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

  async function reveal(ids: string[], fit: boolean) {
    addActive(ids, "end");
    await loadStores(ids);
    if (fit && !addingRef.current) setFitRequest((value) => value + 1);
  }

  function deactivate(id: string) {
    if (!active.includes(id)) return;
    if (addingRef.current === id) {
      addingRef.current = null;
      setAddingId(null);
      setPending(null);
    }
    armFlip();
    setActive(active.filter((item) => item !== id));
    setSelection((current) => {
      if (!current) return null;
      const owns = (storesRef.current[id] || []).some((store) => store.id === current.id);
      return owns ? null : current;
    });
    if (!addingRef.current) setFitRequest((value) => value + 1);
  }

  async function activate(id: string) {
    if (!addActive([id], "start")) return;
    await loadStores([id]);
    if (!addingRef.current) setFitRequest((value) => value + 1);
  }

  function selectForAdd(id: string) {
    addingRef.current = id;
    setAddingId(id);
    setPending(null);
    setSelection(null);
    if (!active.includes(id)) {
      addActive([id], "start");
      void loadStores([id]);
    }
  }

  function clearBoard() {
    if (active.length) armFlip();
    addingRef.current = null;
    setAddingId(null);
    setPending(null);
    setActive([]);
    setSelection(null);
    setFitRequest((value) => value + 1);
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
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setStores((current) => ({
        ...current,
        [store.tenantId]: [...(current[store.tenantId] || []).filter((item) => item.id !== store.id), store],
      }));
      toast.error(body?.error || "Could not delete");
    }
  }

  function renderBrand(brand: Brand, zone: "active" | "list", rank?: number) {
    const pinned = zone === "active";
    return (
      <BrandRow
        key={brand.id}
        ref={(node) => bindRow(brand.id, node)}
        zone={zone}
        brand={brand}
        rank={pinned ? undefined : rank}
        color={pinned ? colors.get(brand.id) || brandColor(brand.brandName) : undefined}
        on={pinned}
        adding={addingId === brand.id}
        dim={addingId != null && addingId !== brand.id}
        hint={locationHint(brand)}
        onToggle={() => {
          if (pinned) {
            deactivate(brand.id);
            return;
          }
          if (addingId) selectForAdd(brand.id);
          else void activate(brand.id);
        }}
        onAdd={() => selectForAdd(brand.id)}
        onRemove={pinned ? () => deactivate(brand.id) : undefined}
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
          <div className="flex justify-end">
            <div className="relative group">
              <button
                type="button"
                aria-label={showing ? "Hide" : "Show all"}
                aria-disabled={showBlocked}
                title={showBlocked ? SHOW_ALL_TOOLTIP : undefined}
                onClick={() => {
                  if (showing) clearBoard();
                  else if (!showBlocked) void reveal(boardIds, true);
                }}
                className={cn(
                  "relative w-7 h-7 inline-flex items-center justify-center",
                  showBlocked ? "text-text-3 cursor-not-allowed" : "text-text-2 hover:text-text",
                  FOCUS_RING
                )}
              >
                <Eye size={16} strokeWidth={1.75} className={cn("absolute transition-opacity duration-200 ease-in-out", showing ? "opacity-100" : "opacity-0")} />
                <EyeOff size={16} strokeWidth={1.75} className={cn("absolute transition-opacity duration-200 ease-in-out", showing ? "opacity-0" : "opacity-100")} />
              </button>
              {showBlocked && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {SHOW_ALL_TOOLTIP}
                </span>
              )}
            </div>
          </div>
          <Select small aria-label="Listing" value={listingId} onChange={(e) => onListingId(e.target.value)}>
            <option value="">All listings</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>{listing.name}</option>
            ))}
          </Select>
          <Input small aria-label="Search" placeholder="Search" value={query} onChange={(e) => onQuery(e.target.value)} />
          {addingId && (
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 text-xs text-text truncate">{brands.find((brand) => brand.id === addingId)?.brandName}</p>
              {lastPin && (
                <Button variant="ghost" size="sm" onClick={undo}>Undo</Button>
              )}
            </div>
          )}
        </div>
        {activeBrands.length > 0 && (
          <section
            aria-label="Active tenants"
            ref={activeScroll}
            className="shrink-0 max-h-48 overflow-y-auto overscroll-contain border-b border-border bg-surface"
          >
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface px-3 py-1">
              <span className="text-xs text-text-3">Active</span>
              <span className="text-xs tabular-nums text-text-3">{activeBrands.length}</span>
              <span className="flex-1 border-t border-border" />
              <button
                type="button"
                onClick={clearBoard}
                className={cn("shrink-0 text-xs text-text-2 hover:text-text", FOCUS_RING)}
              >
                Clear all
              </button>
            </div>
            <div role="list" className="pb-1">
              {activeBrands.map((brand) => renderBrand(brand, "active"))}
            </div>
          </section>
        )}
        <div data-brand-scroll="" className="min-h-0 flex-1 overflow-y-auto py-2">
          {listingId ? (
            <>
              {(["optimal", "possible"] as const).map((bucket) => {
                const list = fitting.filter((brand) => fitById.get(brand.id)?.bucket === bucket);
                if (!list.length) return null;
                return (
                  <div key={bucket} className="mb-2">
                    <div className="flex items-center gap-2 px-3 py-1">
                      <span className="text-xs text-text-3">{BUCKET_LABEL[bucket]}</span>
                      <span className="flex-1 border-t border-border" />
                    </div>
                    <div role="list">
                      {list.map((brand, index) => renderBrand(brand, "list", index + 1))}
                    </div>
                  </div>
                );
              })}
              <div className="px-3 py-2">
                <button type="button" className="text-sm text-text-2 hover:text-text" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Hide" : "Show all"}
                </button>
              </div>
              <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-in-out", showAll ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <Collapsed inert={!showAll}>
                  <div role="list">
                    {rest.map((brand) => renderBrand(brand, "list"))}
                  </div>
                </Collapsed>
              </div>
            </>
          ) : (
            categories.map(([category, list]) => (
              <div key={category} className="px-2 mb-2">
                <p className="px-2 py-1 text-xs text-text-3">{category}</p>
                <div role="list">
                  {list.map((brand) => renderBrand(brand, "list"))}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function Collapsed({ inert, children }: { inert: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (inert) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }, [inert]);
  return (
    <div ref={ref} className={cn("overflow-hidden", inert && "pointer-events-none")}>
      {children}
    </div>
  );
}

const BrandRow = forwardRef<HTMLDivElement, {
  brand: Brand;
  zone: "active" | "list";
  rank?: number;
  color?: string;
  on: boolean;
  adding: boolean;
  dim: boolean;
  hint: string | null;
  onToggle: () => void;
  onAdd: () => void;
  onRemove?: () => void;
}>(function BrandRow({ brand, zone, rank, color, on, adding, dim, hint, onToggle, onAdd, onRemove }, ref) {
  return (
    <div
      ref={ref}
      data-zone={zone}
      role="listitem"
      className={cn("flex items-center rounded-control mx-1", (on || adding) && !dim && "bg-surface-2")}
    >
      {rank != null && <span className="w-5 text-right text-xs text-text-3 tabular-nums">{rank}</span>}
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
        className={cn("flex-1 min-w-0 text-left px-2 py-1.5 text-sm", dim ? "text-text-3" : "text-text", on && !dim && "font-medium", FOCUS_RING)}
      >
        <span className="block truncate">{brand.brandName}</span>
        {hint && <span className="block text-xs text-text-3 font-normal">{hint}</span>}
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
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${brand.brandName} from the map`}
          onClick={onRemove}
          className={cn("shrink-0 px-1.5 py-1 text-text-3 hover:text-text", FOCUS_RING)}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
});

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
  onPlace: (lat: number, lng: number, x: number, y: number) => void;
  onSelect: (store: Store | null, x: number, y: number) => void;
  /** Optional camera. The demand page leaves this unset and fits when tenants toggle. */
  view?: { lng: number; lat: number; zoom: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const glRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const ready = useRef(false);
  const appliedBase = useRef<BaseMap | null>(null);
  const wantedBase = useRef(base);
  const snap = useRef({ stores, spacing, colors, focus, onPlace, onSelect, adding, fitRequest, view });
  const lastFit = useRef(0);
  wantedBase.current = base;
  snap.current = { stores, spacing, colors, focus, onPlace, onSelect, adding, fitRequest, view };

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
  for (const value of LOCATION_STATUSES) {
    const dash = ringDash(value);
    map.addLayer({
      id: `ring-${value}`,
      type: "line",
      source: "rings",
      filter: ["==", ["get", "status"], value],
      paint: {
        "line-color": RING,
        "line-width": 2,
        // Location ids are UUIDs. Mapbox feature-state only accepts ids that
        // cast to integers, so a feature-state opacity defaulting to 0 left
        // every ring (and every pin) invisible. Paint is a plain number.
        "line-opacity": 1,
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
        properties: { status: kind },
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
