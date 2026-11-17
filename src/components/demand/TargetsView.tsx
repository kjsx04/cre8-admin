"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  Button,
  Card,
  EmptyState,
  Input,
  LoadingBlock,
  Select,
  cn,
  FOCUS_RING,
  useToast,
} from "@/components/ui";
import ContactPopover from "@/components/demand/ContactPopover";
import DemandMap from "@/components/demand/DemandMap";
import type { GroupView, ListingSummary, MatchResponse, SpaceView, TenantMatchView } from "@/lib/demand/view";
import type { Deal, SpaceType } from "@/lib/demand/types";

const INTEREST: { value: string; label: string }[] = [
  { value: "", label: "No status" },
  { value: "submitted", label: "Submitted" },
  { value: "interested", label: "Interested" },
  { value: "touring", label: "Touring" },
  { value: "LOI", label: "LOI" },
  { value: "passed", label: "Passed" },
];

export default function TargetsView({
  listingId,
  onListingId,
}: {
  listingId: string | null;
  onListingId: (id: string) => void;
}) {
  const toast = useToast();
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All");
  const [hideSold, setHideSold] = useState(true);
  const [match, setMatch] = useState<MatchResponse | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await apiFetch("/api/demand/listings");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load listings");
      setListings(body as ListingSummary[]);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load listings");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMatch = useCallback(async (id: string) => {
    setLoadingMatch(true);
    setMatchError(null);
    try {
      const res = await apiFetch(`/api/demand/match?listingId=${id}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not match tenants");
      setMatch(body as MatchResponse);
    } catch (err) {
      setMatch(null);
      setMatchError(err instanceof Error ? err.message : "Could not match tenants");
    } finally {
      setLoadingMatch(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (listingId) loadMatch(listingId);
  }, [listingId, loadMatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (hideSold && (listing.sold || listing.status === "sold")) return false;
      if (kind !== "All" && kindOf(listing) !== kind) return false;
      if (!q) return true;
      return `${listing.name} ${listing.city || ""} ${listing.address}`.toLowerCase().includes(q);
    });
  }, [listings, query, kind, hideSold]);

  async function copyContacts() {
    if (!match) return;
    const lines: string[] = [];
    for (const group of match.groups) {
      for (const tenant of group.optimal) {
        lines.push(tenant.brandName);
        for (const contact of tenant.contacts) {
          const who = contact.contactType === "broker" ? "Broker" : "In-house";
          lines.push([who, contact.name, contact.firmName, contact.email, contact.phone].filter(Boolean).join(", "));
        }
      }
    }
    if (!lines.length) {
      toast.info("No optimal contacts to copy");
      return;
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied contacts");
  }

  async function downloadCsv() {
    if (!listingId) return;
    const res = await apiFetch(`/api/demand/export?listingId=${listingId}`);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || "Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "demand.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Input small value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search listings" aria-label="Search listings" />
        </div>
        {["All", "Land", "Pads", "Shop"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setKind(item)}
            className={cn(
              "h-8 px-3 rounded-control text-sm font-medium",
              kind === item ? "bg-ink text-white" : "bg-surface border border-border text-text-2 hover:text-text",
              FOCUS_RING
            )}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setHideSold((value) => !value)}
          className={cn(
            "h-8 px-3 rounded-control text-sm font-medium border border-border",
            hideSold ? "bg-surface-2 text-text" : "bg-surface text-text-2",
            FOCUS_RING
          )}
        >
          {hideSold ? "Hiding sold" : "Showing sold"}
        </button>
      </div>

      {loadingList && <LoadingBlock message="Loading listings" />}
      {listError && (
        <Card>
          <p className="text-sm text-danger-fg">{listError}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={loadList}>Try again</Button>
        </Card>
      )}

      {!loadingList && !listError && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
          <Card padding="none" className="max-h-[70vh] overflow-y-auto">
            {filtered.length === 0 && <EmptyState compact title="No listings" description="Try another search." />}
            {filtered.map((listing) => (
              <button
                key={listing.id}
                type="button"
                onClick={() => onListingId(listing.id)}
                className={cn(
                  "w-full text-left px-4 py-2.5 border-b border-border last:border-b-0",
                  listingId === listing.id ? "bg-surface-2" : "hover:bg-surface-2/60",
                  FOCUS_RING
                )}
              >
                <p className="text-sm font-medium text-text truncate">{listing.name}</p>
                <p className="text-xs text-text-3 truncate">
                  {[kindOf(listing), listing.city, sizeChip(listing), listing.listingType].filter(Boolean).join(" · ")}
                </p>
              </button>
            ))}
          </Card>

          <div className="min-w-0 space-y-4">
            {!listingId && <EmptyState title="Pick a listing" description="Demand scores tenants against each pad or suite." />}
            {listingId && loadingMatch && <LoadingBlock message="Matching tenants" />}
            {matchError && (
              <Card>
                <p className="text-sm text-danger-fg">{matchError}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => listingId && loadMatch(listingId)}>Try again</Button>
              </Card>
            )}
            {match && listingId && !loadingMatch && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-md font-semibold text-text">{match.listing.name}</h2>
                    <p className="text-sm text-text-2">
                      {[match.listing.propertyType, match.listing.city, match.listing.listingType].filter(Boolean).join(" · ")}
                    </p>
                    {match.spacesSeeded && (
                      <p className="text-xs text-text-3 mt-1">Spaces started from the listing’s pad and suite table.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setMapOpen(true)}>Map</Button>
                    <Button variant="secondary" size="sm" onClick={copyContacts}>Copy contacts</Button>
                    <Button variant="secondary" size="sm" onClick={downloadCsv}>Export</Button>
                  </div>
                </div>
                <SpaceEditor
                  key={listingId}
                  listingId={listingId}
                  spaces={uniqueSpaces(match.groups)}
                  onSaved={() => loadMatch(listingId)}
                />
                {match.groups.map((group) => (
                  <GroupCard key={group.key} group={group} listingId={listingId} onChanged={() => loadMatch(listingId)} />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {mapOpen && listingId && <DemandMap listingId={listingId} onClose={() => setMapOpen(false)} />}
    </div>
  );
}

function uniqueSpaces(groups: GroupView[]): SpaceView[] {
  const map = new Map<string, SpaceView>();
  for (const group of groups) for (const space of group.spaces) map.set(space.id, space);
  return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function kindOf(listing: ListingSummary): string {
  const type = listing.propertyType.toLowerCase();
  if (type.includes("retail pads")) return "Pads";
  if (type.includes("land") || type.includes("development")) return "Land";
  if (type.includes("retail")) return "Shop";
  return "Other";
}

function sizeChip(listing: ListingSummary): string {
  if (listing.acres) return `${listing.acres} ac`;
  if (listing.buildingSf) return `${listing.buildingSf.toLocaleString("en-US")} SF`;
  return "";
}

function GroupCard({ group, listingId, onChanged }: { group: GroupView; listingId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const rest = group.possible.length + group.excluded.length;
  return (
    <Card padding="none">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-md font-semibold text-text">{group.title}</h3>
        <p className="text-sm text-text-2">{group.optimal.length} optimal</p>
      </div>
      <div className="px-4">
        {group.optimal.length === 0 && <p className="py-4 text-sm text-text-2">No optimal tenants.</p>}
        {group.optimal.map((tenant) => (
          <TenantRow key={tenant.tenantId} tenant={tenant} spaces={group.spaces} listingId={listingId} onChanged={onChanged} />
        ))}
      </div>
      {rest > 0 && (
        <div className="px-4 py-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? "Hide possible and excluded" : `Show ${group.possible.length} possible and ${group.excluded.length} excluded`}
          </Button>
          {open && (
            <div>
              {group.possible.length > 0 && <p className="text-sm font-medium text-text mt-3">Possible</p>}
              {group.possible.map((tenant) => (
                <TenantRow key={tenant.tenantId} tenant={tenant} spaces={group.spaces} listingId={listingId} onChanged={onChanged} />
              ))}
              {group.excluded.length > 0 && <p className="text-sm font-medium text-text mt-3">Excluded</p>}
              {group.excluded.map((tenant) => (
                <TenantRow key={tenant.tenantId} tenant={tenant} spaces={group.spaces} listingId={listingId} onChanged={onChanged} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TenantRow({
  tenant,
  spaces,
  listingId,
  onChanged,
}: {
  tenant: TenantMatchView;
  spaces: SpaceView[];
  listingId: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState(tenant.overrides[0]?.reason || "");
  const [decision, setDecision] = useState(sharedDecision(tenant, spaces));
  const [perSpace, setPerSpace] = useState(false);
  const interest = sharedInterest(tenant, spaces);

  async function saveInterest(spaceIds: string[], status: string) {
    const res = await apiFetch("/api/demand/interest", {
      method: "POST",
      body: JSON.stringify({ listingId, tenantId: tenant.tenantId, spaceIds, status: status || null, notes: null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || "Could not save interest");
      return;
    }
    onChanged();
  }

  async function saveOverride(spaceIds: string[]) {
    const clear = decision === "";
    if (!clear && !reason.trim()) {
      toast.error("Add a reason");
      return;
    }
    const res = await apiFetch("/api/demand/overrides", {
      method: "POST",
      body: JSON.stringify({
        listingId,
        tenantId: tenant.tenantId,
        spaceIds,
        clear,
        decision: decision || undefined,
        reason,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || "Could not save the override");
      return;
    }
    onChanged();
  }

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-medium text-text">{tenant.brandName}</p>
          <p className="text-sm text-text-2 mt-0.5">
            {[tenant.category, tenant.requirement].filter(Boolean).join(" · ")}
          </p>
          <p className="text-sm text-text-2 mt-1">{tenant.reasons.join(" · ")}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ContactPopover contacts={tenant.contacts} tenantName={tenant.brandName} />
          <div className="w-32">
            <Select
              small
              aria-label={`Interest for ${tenant.brandName}`}
              value={interest}
              onChange={(e) => saveInterest(spaces.map((space) => space.id), e.target.value)}
            >
              {interest === "mixed" && <option value="mixed">Mixed</option>}
              {INTEREST.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="w-36">
          <Select small aria-label={`Override for ${tenant.brandName}`} value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="">Model</option>
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </Select>
        </div>
        {decision !== "" && (
          <Input small className="w-56" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Override reason" />
        )}
        {(decision !== "" || tenant.overrides.length > 0) && (
          <Button variant="secondary" size="sm" onClick={() => saveOverride(spaces.map((space) => space.id))}>
            {decision === "" ? "Clear override" : "Save override"}
          </Button>
        )}
        {spaces.length > 1 && (
          <Button variant="ghost" size="sm" onClick={() => setPerSpace((value) => !value)}>Per space</Button>
        )}
      </div>
      {perSpace && (
        <div className="mt-2 space-y-1">
          {spaces.map((space) => {
            const row = tenant.interests.find((item) => item.spaceId === space.id);
            return (
              <div key={space.id} className="flex items-center gap-2">
                <span className="text-sm text-text-2 w-24 truncate">{space.label}</span>
                <div className="w-32">
                  <Select
                    small
                    aria-label={`Interest on ${space.label}`}
                    value={row?.status || ""}
                    onChange={(e) => saveInterest([space.id], e.target.value)}
                  >
                    {INTEREST.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tenant.alsoPitch.length > 0 && (
        <p className="text-sm text-text-2 mt-2">
          Also pitch {tenant.alsoPitch.map((item) => `${item.brandName} (${item.why.toLowerCase()})`).join(", ")}.
        </p>
      )}
    </div>
  );
}

function sharedInterest(tenant: TenantMatchView, spaces: SpaceView[]): string {
  const values = spaces.map((space) => tenant.interests.find((item) => item.spaceId === space.id)?.status || "");
  return values.every((value) => value === values[0]) ? values[0] || "" : "mixed";
}

function sharedDecision(tenant: TenantMatchView, spaces: SpaceView[]): string {
  const values = spaces.map((space) => tenant.overrides.find((item) => item.spaceId === space.id)?.decision || "");
  return values.every((value) => value === values[0]) ? values[0] || "" : "";
}

function SpaceEditor({ listingId, spaces, onSaved }: { listingId: string; spaces: SpaceView[]; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(spaces);
  const [saving, setSaving] = useState(false);

  function update(index: number, patch: Partial<SpaceView>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/demand/spaces", {
        method: "PUT",
        body: JSON.stringify({
          listingId,
          spaces: rows.map((row) => ({
            id: row.id.startsWith("new-") ? undefined : row.id,
            label: row.label,
            spaceType: row.spaceType,
            acres: row.acres,
            sf: row.sf,
            driveThru: row.driveThru,
            deal: row.deal,
            priceRate: row.priceRate,
            status: row.status,
            notes: row.notes,
          })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not save spaces");
      toast.success("Spaces saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save spaces");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn("w-full text-left px-4 py-3 text-sm font-medium text-text", FOCUS_RING)}
      >
        Spaces ({rows.length})
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border">
          {rows.map((row, index) => (
            <div key={row.id} className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3">
              <Input small aria-label="Label" value={row.label} onChange={(e) => update(index, { label: e.target.value })} />
              <Select small aria-label="Space type" value={row.spaceType} onChange={(e) => update(index, { spaceType: e.target.value as SpaceType })}>
                <option value="pad">Pad</option>
                <option value="inline">Inline</option>
                <option value="endcap">Endcap</option>
                <option value="land parcel">Land parcel</option>
              </Select>
              <Input small aria-label="Acres" type="number" step="0.01" placeholder="Acres" value={row.acres ?? ""} onChange={(e) => update(index, { acres: e.target.value === "" ? null : Number(e.target.value) })} />
              <Input small aria-label="SF" type="number" placeholder="SF" value={row.sf ?? ""} onChange={(e) => update(index, { sf: e.target.value === "" ? null : Number(e.target.value) })} />
              <Select small aria-label="Deal" value={row.deal} onChange={(e) => update(index, { deal: e.target.value as Deal })}>
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
                <option value="both">Sale / lease</option>
              </Select>
              <Select small aria-label="Drive-thru" value={row.driveThru == null ? "" : row.driveThru ? "yes" : "no"} onChange={(e) => update(index, { driveThru: e.target.value === "" ? null : e.target.value === "yes" })}>
                <option value="">Drive-thru unknown</option>
                <option value="yes">Drive-thru</option>
                <option value="no">No drive-thru</option>
              </Select>
              <Input small aria-label="Price or rate" placeholder="Price / rate" value={row.priceRate || ""} onChange={(e) => update(index, { priceRate: e.target.value || null })} />
              <div className="flex items-center gap-2">
                <Input small aria-label="Status" placeholder="Status" value={row.status || ""} onChange={(e) => update(index, { status: e.target.value || null })} />
                <Button variant="ghost" size="sm" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Remove</Button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { id: `new-${current.length}`, label: "Space", spaceType: "pad", acres: null, sf: null, driveThru: null, deal: "both", priceRate: null, status: "available", notes: null, sortOrder: current.length, hasGeometry: false },
                ])
              }
            >
              Add space
            </Button>
            <Button size="sm" loading={saving} onClick={save}>Save spaces</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
