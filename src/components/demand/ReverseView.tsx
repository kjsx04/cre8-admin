"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button, Card, EmptyState, Input, LoadingBlock, cn, FOCUS_RING } from "@/components/ui";
import { BUCKET_LABEL } from "@/lib/demand/types";
import type { CatalogResponse, ReverseResponse } from "@/lib/demand/view";

export default function ReverseView({ onOpenListing }: { onOpenListing: (listingId: string) => void }) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [result, setResult] = useState<ReverseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch("/api/demand/catalog")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Could not load tenants");
        setCatalog(body as CatalogResponse);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load tenants"));
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/demand/reverse?tenantId=${tenantId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Could not rank listings");
        if (!cancelled) setResult(body as ReverseResponse);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not rank listings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const tenants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog?.tenants || []).filter((tenant) => !q || `${tenant.brandName} ${tenant.category}`.toLowerCase().includes(q));
  }, [catalog, query]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
      <div>
        <Input small value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tenants" aria-label="Search tenants" />
        <Card padding="none" className="mt-3 max-h-[70vh] overflow-y-auto">
          {!catalog && !error && <LoadingBlock message="Loading tenants" />}
          {error && <p className="p-4 text-sm text-danger-fg">{error}</p>}
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onClick={() => setTenantId(tenant.id)}
              className={cn(
                "w-full text-left px-4 py-2.5 border-b border-border last:border-b-0",
                tenantId === tenant.id ? "bg-surface-2" : "hover:bg-surface-2/60",
                FOCUS_RING
              )}
            >
              <p className="text-sm font-medium text-text">{tenant.brandName}</p>
              <p className="text-xs text-text-3">{tenant.category}</p>
            </button>
          ))}
        </Card>
      </div>
      <div>
        {!tenantId && <EmptyState title="Pick a tenant" description="Listings are ranked by how well each space fits." />}
        {loading && <LoadingBlock message="Ranking listings" />}
        {result && !loading && (
          <Card padding="none">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-md font-semibold text-text">{result.tenant.brandName}</h2>
              <p className="text-sm text-text-2">{result.tenant.requirement}</p>
            </div>
            <HitList title={BUCKET_LABEL.optimal} hits={result.optimal} onOpen={onOpenListing} />
            {(result.possible.length > 0 || result.excluded.length > 0) && (
              <div className="px-4 py-2 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
                  {open
                    ? `Hide ${BUCKET_LABEL.possible} and ${BUCKET_LABEL.excluded}`
                    : `Show ${result.possible.length} ${BUCKET_LABEL.possible} and ${result.excluded.length} ${BUCKET_LABEL.excluded}`}
                </Button>
                {open && (
                  <>
                    <HitList title={BUCKET_LABEL.possible} hits={result.possible} onOpen={onOpenListing} />
                    <HitList title={BUCKET_LABEL.excluded} hits={result.excluded} onOpen={onOpenListing} />
                  </>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function HitList({
  title,
  hits,
  onOpen,
}: {
  title: string;
  hits: ReverseResponse["optimal"];
  onOpen: (id: string) => void;
}) {
  if (!hits.length) return null;
  return (
    <div className="px-4 py-2">
      <p className="text-sm font-medium text-text py-2">{title}</p>
      {hits.map((hit, index) => (
        <button
          key={`${hit.listingId}-${hit.title}-${index}`}
          type="button"
          onClick={() => onOpen(hit.listingId)}
          className={cn("w-full text-left py-2 border-b border-border last:border-b-0", FOCUS_RING)}
        >
          <p className="text-sm font-medium text-text">{hit.listingName}</p>
          <p className="text-sm text-text-2">{[hit.city, hit.title].filter(Boolean).join(" · ")}</p>
          <p className="text-sm text-text-2">{hit.reasons.join(" · ")}</p>
        </button>
      ))}
    </div>
  );
}
