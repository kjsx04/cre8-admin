"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { IconButton } from "@/components/ui";
import PersonHover from "@/components/demand/PersonHover";
import TenantEditModal from "@/components/demand/TenantEditModal";
import { yesDealLabels } from "@/lib/demand/deals";
import { rangeText } from "@/lib/demand/format";
import { BUCKET_LABEL, type Bucket, type DealFlags } from "@/lib/demand/types";
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
  | { kind: "tier"; id: string; label: string }
  | { kind: "row"; id: string; row: Row; rank: number | null };

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
}: {
  query: string;
  listingId: string;
  match: MatchResponse | null;
}) {
  const [catalog, setCatalog] = useState<DemandListTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    setShowAll(false);
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

  const items = useMemo(() => buildItems(catalog || [], match, listingId, q, showAll), [catalog, match, listingId, q, showAll]);
  const editing = catalog?.find((tenant) => tenant.id === editingId) || null;
  const openEdit = useCallback((id: string) => setEditingId(id), []);

  if (error) return <p className="px-4 py-6 text-sm text-danger-fg">{error}</p>;

  const fit = Boolean(listingId && match);

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
          <VirtualRows items={items} scrollRef={scroller} render={(item) => (item.kind === "tier" ? <TierLine label={item.label} /> : <DataRow item={item} onEdit={openEdit} />)} />
        </div>
        {fit && (
          <div className="px-6 py-3">
            <button type="button" className="text-sm text-text-2 hover:text-text" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Hide" : "Show all"}
            </button>
          </div>
        )}
      </div>
      <TenantEditModal tenant={editing} onClose={() => setEditingId(null)} onSaved={() => refresh().catch(() => undefined)} />
    </>
  );
}

function buildItems(catalog: DemandListTenant[], match: MatchResponse | null, listingId: string, query: string, showAll: boolean): Item[] {
  const all = catalog
    .filter((tenant) => !query || `${tenant.brandName} ${tenant.category}`.toLowerCase().includes(query))
    .map((tenant) => ({ tenant, bucket: null as Bucket | null, score: 0, space: "", reason: "", storeCount: null as number | null }))
    .sort((a, b) => a.tenant.brandName.localeCompare(b.tenant.brandName));
  if (!listingId || !match) {
    return all.map((row) => ({ kind: "row", id: row.tenant.id, row, rank: null }));
  }
  const byId = new Map(all.map((row) => [row.tenant.id, row]));
  const best = new Map<string, Row>();
  for (const group of match.groups) {
    for (const tenant of [...group.optimal, ...group.possible, ...group.excluded]) {
      const base = byId.get(tenant.tenantId);
      if (!base) continue;
      const row: Row = { ...base, ...fromMatch(tenant, group.title) };
      const prev = best.get(row.tenant.id);
      if (!prev || RANK[row.bucket || "excluded"] < RANK[prev.bucket || "excluded"] || (row.bucket === prev.bucket && row.score > prev.score)) {
        best.set(row.tenant.id, row);
      }
    }
  }
  const tiers: { id: string; label: string; bucket: Bucket }[] = [
    { id: "tier-optimal", label: BUCKET_LABEL.optimal, bucket: "optimal" },
    { id: "tier-possible", label: BUCKET_LABEL.possible, bucket: "possible" },
  ];
  const items: Item[] = [];
  const used = new Set<string>();
  for (const tier of tiers) {
    const rows = Array.from(best.values())
      .filter((row) => row.bucket === tier.bucket)
      .sort((a, b) => b.score - a.score || a.tenant.brandName.localeCompare(b.tenant.brandName));
    if (!rows.length) continue;
    items.push({ kind: "tier", id: tier.id, label: tier.label });
    rows.forEach((row, index) => {
      used.add(row.tenant.id);
      items.push({ kind: "row", id: row.tenant.id, row, rank: index + 1 });
    });
  }
  if (showAll) {
    for (const row of all) {
      if (used.has(row.tenant.id)) continue;
      items.push({ kind: "row", id: row.tenant.id, row: best.get(row.tenant.id) || row, rank: null });
    }
  }
  return items;
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

function TierLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 h-8">
      <span className="text-xs text-text-3">{label}</span>
      <span className="flex-1 border-t border-border" />
    </div>
  );
}

const DataRow = memo(function DataRow({ item, onEdit }: { item: Extract<Item, { kind: "row" }>; onEdit: (id: string) => void }) {
  const { row, rank } = item;
  const deals = yesDealLabels(flagsOf(row.tenant)).join(", ");
  const noLocations = row.storeCount === 0 || row.reason === "No locations";
  return (
    <div className={`grid ${COLS} items-center border-b border-border min-h-11`}>
      <div className="px-3 text-xs text-text-3 tabular-nums">{rank ?? ""}</div>
      <div className="px-3 py-2 font-medium text-sm text-text">
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
      const fallback = item.kind === "tier" ? 32 : 48;
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
