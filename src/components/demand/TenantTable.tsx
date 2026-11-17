"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/components/ui";
import DealMarks from "@/components/demand/DealMarks";
import ContactPopover from "@/components/demand/ContactPopover";
import { rangeText } from "@/lib/demand/format";
import type { Bucket, DealFlags } from "@/lib/demand/types";
import type { CatalogResponse, ContactView, MatchResponse, TenantAdminView, TenantMatchView } from "@/lib/demand/view";

type Row = {
  tenantId: string;
  brandName: string;
  category: string;
  sfMin: number | null;
  sfMax: number | null;
  acresMin: number | null;
  acresMax: number | null;
  flags: DealFlags;
  contacts: ContactView[];
  bucket: Bucket | null;
  score: number;
  space: string;
  reason: string;
};

type Item =
  | { kind: "tier"; id: string; label: string; hidden: boolean }
  | { kind: "row"; id: string; row: Row; rank: number | null; hidden: boolean };

function flagsOf(source: {
  dealLease: boolean | null;
  dealBuy: boolean | null;
  dealGroundLease: boolean | null;
  dealBts: boolean | null;
  freestanding: boolean | null;
  inline: boolean | null;
  dealTypesSource: string | null;
  dealTypesConfidence: "High" | "Medium" | "Low" | null;
}): DealFlags {
  return {
    dealLease: source.dealLease,
    dealBuy: source.dealBuy,
    dealGroundLease: source.dealGroundLease,
    dealBts: source.dealBts,
    freestanding: source.freestanding,
    inline: source.inline,
    dealTypesSource: source.dealTypesSource,
    dealTypesConfidence: source.dealTypesConfidence,
  };
}

function fromAdmin(tenant: TenantAdminView): Row {
  return {
    tenantId: tenant.id,
    brandName: tenant.brandName,
    category: tenant.category,
    sfMin: tenant.sfMin,
    sfMax: tenant.sfMax,
    acresMin: tenant.acresMin,
    acresMax: tenant.acresMax,
    flags: flagsOf(tenant),
    contacts: tenant.contacts,
    bucket: null,
    score: 0,
    space: "",
    reason: "",
  };
}

function sizeOf(row: Row): string {
  return [rangeText(row.sfMin, row.sfMax, "sf"), rangeText(row.acresMin, row.acresMax, "ac")].filter(Boolean).join(" · ") || "—";
}

function person(contacts: ContactView[], type: "in_house" | "broker"): string {
  const list = contacts.filter((contact) => contact.contactType === type);
  return (list.find((contact) => contact.isPrimary) || list[0])?.name || "—";
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
  const toast = useToast();
  const [catalog, setCatalog] = useState<TenantAdminView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    setShowAll(false);
  }, [listingId]);

  const refreshCatalog = useCallback(async () => {
    const res = await apiFetch("/api/demand/catalog");
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "Could not load tenants");
    setCatalog(((body as CatalogResponse).tenants || []) as TenantAdminView[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshCatalog().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load tenants");
    });
    return () => {
      cancelled = true;
    };
  }, [refreshCatalog]);

  const items = useMemo(() => buildItems(catalog || [], match, listingId, q, showAll), [catalog, match, listingId, q, showAll]);

  async function saveFlags(row: Row, next: DealFlags): Promise<boolean> {
    const res = await apiFetch(`/api/demand/tenants/${row.tenantId}/research`, { method: "POST", body: JSON.stringify(next) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || "Could not save");
      return false;
    }
    setCatalog((current) =>
      current?.map((tenant) => (tenant.id === row.tenantId ? { ...tenant, ...next } : tenant)) ?? current
    );
    return true;
  }

  function saveContact(tenantId: string, contact: ContactView) {
    setCatalog((current) =>
      current?.map((tenant) => {
        if (tenant.id !== tenantId) return tenant;
        const exists = tenant.contacts.some((item) => item.id === contact.id);
        const contacts = exists
          ? tenant.contacts.map((item) => (item.id === contact.id ? contact : item))
          : [...tenant.contacts, contact];
        return { ...tenant, contacts };
      }) ?? current
    );
  }

  function removeContact(tenantId: string, contactId: string) {
    setCatalog((current) =>
      current?.map((tenant) =>
        tenant.id === tenantId ? { ...tenant, contacts: tenant.contacts.filter((item) => item.id !== contactId) } : tenant
      ) ?? current
    );
  }

  if (error) return <p className="px-4 py-6 text-sm text-danger-fg">{error}</p>;

  const fit = Boolean(listingId && match);

  return (
    <div ref={scroller} className="h-full overflow-auto">
      <div className="grid grid-cols-[40px_minmax(140px,1.4fr)_minmax(100px,1fr)_minmax(140px,1.2fr)_minmax(220px,2.2fr)_minmax(100px,1fr)_minmax(100px,1fr)_40px] border-b border-border bg-surface-2 sticky top-0 z-10">
        {["", "Brand", "Category", "Size", "Deals", "In-house", "Broker", ""].map((label) => (
          <div key={label || "gap"} className="h-10 px-3 flex items-center text-label uppercase font-semibold text-text-3 whitespace-nowrap">
            {label}
          </div>
        ))}
      </div>
      {items.map((item) =>
        item.kind === "tier" ? (
          <TierLine key={item.id} id={item.id} label={item.label} hidden={item.hidden} />
        ) : (
          <DataRow
            key={item.id}
            item={item}
            onFlags={(next) => saveFlags(item.row, next)}
            onContact={(contact) => saveContact(item.row.tenantId, contact)}
            onContactDeleted={(contactId) => removeContact(item.row.tenantId, contactId)}
          />
        )
      )}
      {fit && (
        <div className="px-3 py-3">
          <button type="button" className="text-sm text-text-2 hover:text-text" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Hide" : "Show all"}
          </button>
        </div>
      )}
    </div>
  );
}

function buildItems(catalog: TenantAdminView[], match: MatchResponse | null, listingId: string, query: string, showAll: boolean): Item[] {
  const all = catalog
    .map(fromAdmin)
    .filter((row) => !query || `${row.brandName} ${row.category}`.toLowerCase().includes(query))
    .sort((a, b) => a.brandName.localeCompare(b.brandName));
  if (!listingId || !match) {
    return all.map((row) => ({ kind: "row", id: row.tenantId, row, rank: null, hidden: false }));
  }
  const byId = new Map(all.map((row) => [row.tenantId, row]));
  const best = new Map<string, Row>();
  for (const group of match.groups) {
    for (const tenant of [...group.optimal, ...group.possible, ...group.excluded]) {
      const base = byId.get(tenant.tenantId);
      if (!base) continue;
      const row: Row = {
        ...base,
        ...fromMatch(tenant, group.title),
        contacts: base.contacts.length ? base.contacts : tenant.contacts,
        flags: base.flags,
      };
      const prev = best.get(row.tenantId);
      if (!prev || RANK[row.bucket || "excluded"] < RANK[prev.bucket || "excluded"] || (row.bucket === prev.bucket && row.score > prev.score)) {
        best.set(row.tenantId, row);
      }
    }
  }
  const tiers: { id: string; label: string; bucket: Bucket }[] = [
    { id: "tier-optimal", label: "Optimal", bucket: "optimal" },
    { id: "tier-possible", label: "Possible", bucket: "possible" },
  ];
  const items: Item[] = [];
  const used = new Set<string>();
  for (const tier of tiers) {
    const rows = Array.from(best.values())
      .filter((row) => row.bucket === tier.bucket)
      .sort((a, b) => b.score - a.score || a.brandName.localeCompare(b.brandName));
    if (!rows.length) continue;
    items.push({ kind: "tier", id: tier.id, label: tier.label, hidden: false });
    rows.forEach((row, index) => {
      used.add(row.tenantId);
      items.push({ kind: "row", id: row.tenantId, row, rank: index + 1, hidden: false });
    });
  }
  for (const row of all) {
    if (used.has(row.tenantId)) continue;
    const matched = best.get(row.tenantId) || row;
    items.push({ kind: "row", id: row.tenantId, row: matched, rank: null, hidden: !showAll });
  }
  return items;
}

function fromMatch(tenant: TenantMatchView, space: string): Row {
  return {
    tenantId: tenant.tenantId,
    brandName: tenant.brandName,
    category: tenant.category,
    sfMin: tenant.sfMin,
    sfMax: tenant.sfMax,
    acresMin: tenant.acresMin,
    acresMax: tenant.acresMax,
    flags: flagsOf(tenant),
    contacts: tenant.contacts,
    bucket: tenant.bucket,
    score: tenant.score,
    space,
    reason: tenant.reasons[0] || "",
  };
}

function TierLine({ id, label, hidden }: { id: string; label: string; hidden: boolean }) {
  const ref = useInert(hidden);
  return (
    <div ref={ref} data-flip={id} aria-hidden={hidden || undefined} className={shell(hidden)}>
      <div className="overflow-hidden min-h-0">
        <div className="flex items-center gap-3 px-3 h-8">
          <span className="text-xs text-text-3">{label}</span>
          <span className="flex-1 border-t border-border" />
        </div>
      </div>
    </div>
  );
}

function DataRow({
  item,
  onFlags,
  onContact,
  onContactDeleted,
}: {
  item: Extract<Item, { kind: "row" }>;
  onFlags: (next: DealFlags) => Promise<boolean>;
  onContact: (contact: ContactView) => void;
  onContactDeleted: (contactId: string) => void;
}) {
  const { row, rank, hidden } = item;
  const ref = useInert(hidden);
  const [flags, setFlags] = useState(row.flags);
  const ticket = useRef(0);
  const serial = JSON.stringify(row.flags);
  useEffect(() => {
    setFlags(row.flags);
    // serial is the value identity. row.flags is a new object whenever the parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial]);

  function change(next: DealFlags) {
    const mine = ++ticket.current;
    const saved = row.flags;
    setFlags(next);
    void onFlags(next).then((ok) => {
      if (ticket.current !== mine) return;
      if (!ok) setFlags(saved);
    });
  }

  return (
    <div ref={ref} data-flip={row.tenantId} aria-hidden={hidden || undefined} className={shell(hidden)}>
      <div className="overflow-hidden min-h-0">
      <div className="grid grid-cols-[40px_minmax(140px,1.4fr)_minmax(100px,1fr)_minmax(140px,1.2fr)_minmax(220px,2.2fr)_minmax(100px,1fr)_minmax(100px,1fr)_40px] items-center border-b border-border min-h-11">
        <div className="px-3 text-xs text-text-3 tabular-nums">{rank ?? ""}</div>
        <div className="px-3 py-2 font-medium text-sm text-text">
          {row.brandName}
          {row.space && <span className="ml-2 text-xs text-text-3 font-normal">{row.space}</span>}
          {rank == null && row.reason && <span className="ml-2 text-xs text-text-3 font-normal">{row.reason}</span>}
        </div>
        <div className="px-3 text-sm text-text">{row.category}</div>
        <div className="px-3 text-sm text-text whitespace-nowrap">{sizeOf(row)}</div>
        <div className="px-3 py-1.5">
          <DealMarks
            compact
            value={flags}
            onChange={change}
          />
        </div>
        <div className="px-3 text-sm text-text truncate">{person(row.contacts, "in_house")}</div>
        <div className="px-3 text-sm text-text truncate">{person(row.contacts, "broker")}</div>
        <div className="px-1">
          <ContactPopover
            contacts={row.contacts}
            tenantName={row.brandName}
            tenantId={row.tenantId}
            onSaved={onContact}
            onDeleted={onContactDeleted}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

function useInert(hidden: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (hidden) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }, [hidden]);
  return ref;
}

function shell(hidden: boolean): string {
  return [
    "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
    hidden ? "grid-rows-[0fr] opacity-0 pointer-events-none" : "grid-rows-[1fr] opacity-100",
  ].join(" ");
}
