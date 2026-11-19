"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { IconButton, cn, FOCUS_RING } from "@/components/ui";
import PersonHover from "@/components/demand/PersonHover";
import TenantEditModal from "@/components/demand/TenantEditModal";
import { categoryIsOpen, categoryRows, groupMapCategories, toggleCategoryDisclosure, type MapFit } from "@/lib/demand/active-tenants";
import { yesDealLabels } from "@/lib/demand/deals";
import { rangeText } from "@/lib/demand/format";
import type { Bucket, DealFlags } from "@/lib/demand/types";
import type { ContactView, DemandListTenant, MatchResponse, TenantMatchView } from "@/lib/demand/view";

const COLS =
  "grid-cols-[40px_minmax(140px,1.4fr)_minmax(100px,1fr)_minmax(140px,1.2fr)_minmax(220px,2.2fr)_minmax(100px,1fr)_minmax(100px,1fr)_40px]";
const HEADERS = ["", "Brand", "Category", "Size", "Deals", "In-house", "Broker", ""];
const HEADER_HEIGHT = 40;

type Row = {
  tenant: DemandListTenant;
  bucket: Bucket | null;
  score: number;
  space: string;
  reason: string;
  storeCount: number | null;
};

type Item =
  | { kind: "category"; id: string; label: string; count: number; open: boolean }
  | { kind: "row"; id: string; row: Row; rank: number | null; top: boolean };

function flagsOf(tenant: DemandListTenant): DealFlags {
  return {
    dealLease: tenant.dealLease,
    dealBuy: tenant.dealBuy,
    dealGroundLease: tenant.dealGroundLease,
    dealBts: tenant.dealBts,
    freestanding: tenant.freestanding,
    inline: tenant.inline,
    dealTypesSource: tenant.dealTypesSource,
    dealTypesConfidence: tenant.dealTypesConfidence,
  };
}

function sizeOf(tenant: DemandListTenant): string {
  return [rangeText(tenant.sfMin, tenant.sfMax, "sf"), rangeText(tenant.acresMin, tenant.acresMax, "ac")].filter(Boolean).join(" · ") || "—";
}

function personContact(contacts: ContactView[], type: "in_house" | "broker"): ContactView | null {
  const list = contacts.filter((contact) => contact.contactType === type);
  return list.find((contact) => contact.isPrimary) || list[0] || null;
}

const RANK: Record<Bucket, number> = { optimal: 0, possible: 1, excluded: 2 };

export default function TenantTable({
  query,
  listingId,
  match,
  onTenantSaved,
}: {
  query: string;
  listingId: string;
  match: MatchResponse | null;
  /** Called after the edit window saves, so the page can re-run the match for the chosen listing. */
  onTenantSaved?: () => void;
}) {
  const [catalog, setCatalog] = useState<DemandListTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  useEffect(() => {
    setOpened({});
  }, [listingId]);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/demand/rows");
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "Could not load tenants");
    setCatalog((body?.tenants || []) as DemandListTenant[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load tenants");
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const items = useMemo(() => buildItems(catalog || [], match, listingId, q, opened), [catalog, match, listingId, q, opened]);

  const listingSelected = Boolean(listingId && match);
  function toggleCategory(category: string) {
    const groups = groupMapCategories(catalog || [], q, listingSelected && match ? fitsFrom(match) : null);
    const topCount = groups.find((group) => group.category === category)?.shown.length ?? 0;
    setOpened((current) => toggleCategoryDisclosure(category, current, searching, listingSelected, topCount));
  }
  const editing = catalog?.find((tenant) => tenant.id === editingId) || null;
  const openEdit = useCallback((id: string) => setEditingId(id), []);

  if (error) return <p className="px-4 py-6 text-sm text-danger-fg">{error}</p>;

  return (
    <>
      <div ref={scroller} className="h-full overflow-auto">
        <div className="sticky top-0 z-10 border-b border-border bg-surface-2">
          <div className={`grid ${COLS} px-3`}>
            {HEADERS.map((label, index) => (
              <div key={`${label}-${index}`} className="h-10 px-3 flex items-center text-label uppercase font-semibold text-text-3 whitespace-nowrap">
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="px-3">
          <VirtualRows
            items={items}
            scrollRef={scroller}
            render={(item) =>
              item.kind === "category" ? (
                <CategoryHeader item={item} onToggle={() => toggleCategory(item.label)} />
              ) : (
                <DataRow item={item} onEdit={openEdit} />
              )
            }
          />
        </div>
      </div>
      <TenantEditModal tenant={editing} onClose={() => setEditingId(null)} onSaved={() => {
          // Reload the list, and let the page refresh the Top fits — an edit to
          // size or deal types changes who fits the chosen listing.
          refresh().catch(() => undefined);
          onTenantSaved?.();
        }}
      />
    </>
  );
}

function buildItems(
  catalog: DemandListTenant[],
  match: MatchResponse | null,
  listingId: string,
  query: string,
  opened: Record<string, boolean>
): Item[] {
  const searching = query.trim().length > 0;
  const listingSelected = Boolean(listingId && match);
  const fits = listingSelected && match ? fitsFrom(match) : null;
  const bases = new Map<string, Row>();
  for (const tenant of catalog) {
    bases.set(tenant.id, { tenant, bucket: null, score: 0, space: "", reason: "", storeCount: null });
  }
  const best = new Map<string, Row>();
  if (match && listingId) {
    for (const group of match.groups) {
      for (const tenant of [...group.optimal, ...group.possible, ...group.excluded]) {
        const base = bases.get(tenant.tenantId);
        if (!base) continue;
        const row: Row = { ...base, ...fromMatch(tenant, group.title) };
        const prev = best.get(row.tenant.id);
        if (!prev || RANK[row.bucket || "excluded"] < RANK[prev.bucket || "excluded"] || (row.bucket === prev.bucket && row.score > prev.score)) {
          best.set(row.tenant.id, row);
        }
      }
    }
  }
  const items: Item[] = [];
  for (const group of groupMapCategories(catalog, query, fits)) {
    const open = categoryIsOpen(group.category, opened, searching, listingSelected, group.shown.length);
    items.push({ kind: "category", id: `category:${group.category}`, label: group.category, count: group.count, open });
    categoryRows(group, opened, searching, listingSelected).forEach((tenant, index) => {
      const row = best.get(tenant.id) || bases.get(tenant.id);
      if (!row) return;
      items.push({
        kind: "row",
        id: tenant.id,
        row,
        rank: listingSelected ? index + 1 : null,
        top: Boolean(listingSelected && row.bucket === "optimal"),
      });
    });
  }
  return items;
}

function fitsFrom(match: MatchResponse): Map<string, MapFit> {
  const map = new Map<string, MapFit>();
  for (const group of match.groups) {
    for (const tenant of [...group.optimal, ...group.possible, ...group.excluded]) {
      const next: MapFit = { bucket: tenant.bucket, score: tenant.score };
      const prev = map.get(tenant.tenantId);
      if (!prev || RANK[next.bucket] < RANK[prev.bucket] || (next.bucket === prev.bucket && next.score > prev.score)) {
        map.set(tenant.tenantId, next);
      }
    }
  }
  return map;
}

function fromMatch(tenant: TenantMatchView, space: string): Pick<Row, "bucket" | "score" | "space" | "reason" | "storeCount"> {
  return {
    bucket: tenant.bucket,
    score: tenant.score,
    space,
    reason: tenant.reasons[0] || "",
    storeCount: tenant.storeCount,
  };
}

function CategoryHeader({ item, onToggle }: { item: Extract<Item, { kind: "category" }>; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={item.open}
      aria-label={`${item.open ? "Collapse" : "Expand"} ${item.label}, ${item.count}`}
      onClick={onToggle}
      className={cn("-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 border-y border-border bg-surface px-3 py-2 text-left", FOCUS_RING)}
    >
      <span className="text-base font-semibold text-text">{item.label}</span>
      <span className="text-xs font-normal tabular-nums text-text-3">{item.count}</span>
      <span className="ml-auto text-text-3" aria-hidden>
        {item.open ? <ChevronDown size={16} strokeWidth={1.75} /> : <ChevronRight size={16} strokeWidth={1.75} />}
      </span>
    </button>
  );
}

const DataRow = memo(function DataRow({ item, onEdit }: { item: Extract<Item, { kind: "row" }>; onEdit: (id: string) => void }) {
  const { row, rank, top } = item;
  const deals = yesDealLabels(flagsOf(row.tenant)).join(", ");
  const noLocations = row.storeCount === 0 || row.reason === "No locations";
  return (
    <div className={cn(`grid ${COLS} items-center border-b border-border min-h-11`, top && "bg-accent-soft")}>
      <div className="px-3 text-xs text-text-3 tabular-nums">{rank ?? ""}</div>
      <div className="py-2 pl-8 pr-3 font-medium text-sm text-text">
        {row.tenant.brandName}
        {row.space && <span className="ml-2 text-xs text-text-3 font-normal">{row.space}</span>}
        {noLocations && <span className="ml-2 text-xs text-text-3 font-normal">No locations</span>}
        {rank == null && row.reason && row.reason !== "No locations" && (
          <span className="ml-2 text-xs text-text-3 font-normal">{row.reason}</span>
        )}
      </div>
      <div className="px-3 text-sm text-text">{row.tenant.category}</div>
      <div className="px-3 text-sm text-text whitespace-nowrap">{sizeOf(row.tenant)}</div>
      <div className="px-3 min-w-0 text-sm text-text truncate" title={deals || undefined}>
        {deals}
      </div>
      <div className="px-3 min-w-0">
        <PersonHover contact={personContact(row.tenant.contacts, "in_house")} />
      </div>
      <div className="px-3 min-w-0">
        <PersonHover contact={personContact(row.tenant.contacts, "broker")} showCompany />
      </div>
      <div className="flex justify-end pr-1">
        <IconButton label={`Edit ${row.tenant.brandName}`} size="sm" icon={<Pencil size={16} strokeWidth={1.75} />} onClick={() => onEdit(row.tenant.id)} />
      </div>
    </div>
  );
});

function VirtualRows({
  items,
  scrollRef,
  render,
}: {
  items: Item[];
  scrollRef: RefObject<HTMLDivElement>;
  render: (item: Item) => ReactNode;
}) {
  const heights = useRef(new Map<string, number>());
  const [tick, setTick] = useState(0);
  const [range, setRange] = useState({ start: 0, end: 30 });

  const layout = useMemo(() => {
    const offsets = new Array<number>(items.length + 1);
    offsets[0] = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const fallback = item.kind === "category" ? 40 : 48;
      offsets[index + 1] = offsets[index] + (heights.current.get(item.id) || fallback);
    }
    return offsets;
    // `tick` republishes offsets after a row reports its real height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tick]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const top = Math.max(0, el.scrollTop - 480);
      const bottom = el.scrollTop + (el.clientHeight || 700) - HEADER_HEIGHT + 480;
      let start = 0;
      while (start < items.length && layout[start + 1] < top) start += 1;
      let end = start;
      while (end < items.length && layout[end] < bottom) end += 1;
      end = Math.min(items.length, Math.max(end, start + 1));
      setRange((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollRef, items.length, layout]);

  const measure = useCallback((id: string, height: number) => {
    const previous = heights.current.get(id) || 0;
    if (Math.abs(previous - height) < 1) return;
    heights.current.set(id, height);
    setTick((value) => value + 1);
  }, []);

  return (
    <div className="relative" style={{ height: layout[items.length] || 0 }}>
      {items.slice(range.start, range.end).map((item, offset) => {
        const index = range.start + offset;
        return (
          <Measured key={item.id} top={layout[index] || 0} onHeight={(height) => measure(item.id, height)}>
            {render(item)}
          </Measured>
        );
      })}
    </div>
  );
}

function Measured({ top, onHeight, children }: { top: number; onHeight: (height: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node) onHeight(node.getBoundingClientRect().height);
  });
  return (
    <div ref={ref} className="absolute left-0 right-0" style={{ top }}>
      {children}
    </div>
  );
}
