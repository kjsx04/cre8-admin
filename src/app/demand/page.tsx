"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Input, Select, Tabs, cn, FOCUS_RING } from "@/components/ui";
import TenantTable from "@/components/demand/TenantTable";
import BrandMap, { type BaseMap } from "@/components/demand/BrandMap";
import type { ListingSummary, MatchResponse } from "@/lib/demand/view";
import type { Bucket } from "@/lib/demand/types";

type DemandView = "list" | "map";
export type Fit = { id: string; bucket: Bucket; score: number };

export default function DemandPage() {
  const [view, setView] = useState<DemandView>("list");
  const [listingId, setListingId] = useState("");
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [base, setBase] = useState<BaseMap>("light");
  const [gear, setGear] = useState(false);
  const [fits, setFits] = useState<Fit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = apiFetch("/api/demand/listings").then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load");
      return body;
    });
    load.then((body) => {
      if (!cancelled) setListings(body as ListingSummary[]);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!listingId) {
      setFits([]);
      return;
    }
    let cancelled = false;
    const load = apiFetch(`/api/demand/match?listingId=${listingId}`).then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not match");
      return body;
    });
    load.then((body) => {
      if (cancelled || !body) return;
      const best = new Map<string, Fit>();
      const rank = { optimal: 0, possible: 1, excluded: 2 };
      for (const group of (body as MatchResponse).groups || []) {
        for (const tenant of [...group.optimal, ...group.possible]) {
          const next: Fit = { id: tenant.tenantId, bucket: tenant.bucket, score: tenant.score };
          const prev = best.get(next.id);
          if (!prev || rank[next.bucket] < rank[prev.bucket] || (next.bucket === prev.bucket && next.score > prev.score)) {
            best.set(next.id, next);
          }
        }
      }
      setFits(Array.from(best.values()));
    }).catch(() => {
      if (!cancelled) setFits([]);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const controls = (
    <>
      <div className="w-64">
        <Select small aria-label="Listing" value={listingId} onChange={(e) => setListingId(e.target.value)}>
          <option value="">All tenants</option>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>{listing.name}</option>
          ))}
        </Select>
      </div>
      <div className="w-56">
        <Input small aria-label="Search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
    </>
  );

  return (
    <>
      <div className="md:hidden min-h-[70vh] flex items-center justify-center px-6">
        <p className="text-base text-text text-center">Demand is only available on desktop.</p>
      </div>
      <div className="hidden md:flex h-[calc(100vh-52px)] flex-col min-h-0">
        {view === "list" && (
          <div className="h-12 shrink-0 border-b border-border px-3 flex items-center gap-2">
            {controls}
            <div className="ml-auto">
              <Tabs
                size="sm"
                items={[{ value: "list", label: "List" }, { value: "map", label: "Map" }]}
                value={view}
                onChange={setView}
              />
            </div>
          </div>
        )}
        <div className="relative flex-1 min-h-0">
          {view === "list" && <TenantTable query={query} listingId={listingId} />}
          {view === "map" && (
            <>
              <BrandMap
                listings={listings}
                listingId={listingId}
                onListingId={setListingId}
                query={query}
                onQuery={setQuery}
                base={base}
                fits={fits}
              />
              <div className="absolute top-[5px] right-[5px] z-20 flex items-center gap-1">
                <Tabs
                  size="sm"
                  items={[{ value: "list", label: "List" }, { value: "map", label: "Map" }]}
                  value={view}
                  onChange={setView}
                />
                <button
                  type="button"
                  aria-label="Settings"
                  aria-expanded={gear}
                  onClick={() => setGear((value) => !value)}
                  className={cn("w-8 h-8 inline-flex items-center justify-center text-text-2 hover:text-text", FOCUS_RING)}
                >
                  <Settings size={16} strokeWidth={1.75} />
                </button>
                {gear && (
                  <div className="absolute right-0 top-9 w-44 bg-surface border border-border rounded-card shadow-popover p-2">
                    <p className="px-1 pb-1 text-xs text-text-3">Base map</p>
                    {(["light", "dark", "satellite"] as BaseMap[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setBase(value);
                          setGear(false);
                        }}
                        className={cn(
                          "block w-full text-left px-2 py-1.5 text-sm rounded-control",
                          base === value ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2",
                          FOCUS_RING
                        )}
                      >
                        {value === "light" ? "Light" : value === "dark" ? "Dark" : "Satellite"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
