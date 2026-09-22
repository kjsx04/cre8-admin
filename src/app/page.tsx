"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { Check, ChevronDown, ExternalLink, Plus, Search, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import NewListingsSection from "@/components/checklist/NewListingsSection";
import type { ListingChecklist } from "@/lib/checklist/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageContainer,
  PageHeader,
  Table,
  TableMessage,
  TableSkeleton,
  Tabs,
  TD,
  TH,
  THead,
  TR,
  cn,
  FOCUS_RING,
} from "@/components/ui";
import type { Tone } from "@/components/ui";
import {
  ListingItem,
  getListingStatus,
  formatDate,
  cityShort,
  LISTING_TYPES,
  PROPERTY_TYPES_SHORT,
  PROPERTY_TYPES,
  BROKERS,
  brokerIdForEmail,
} from "@/lib/admin-constants";

/* ============================================================
   STATUS TABS — filter by listing status
   ============================================================ */
const STATUS_TABS = ["All", "Draft", "Live", "Under Contract", "Sold"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/* Table columns — one entry per header cell */
const COLUMNS = ["Name", "Type", "Property", "City", "Price", "Acres", "Status", "Updated", ""];

/* ============================================================
   FILTER DROPDOWN — small popover with checkable options
   (used for Property type + Broker filters in the toolbar)
   ============================================================ */
function FilterDropdown({
  label,
  options,
  selected,
  open,
  onToggleOpen,
  onToggleOption,
  onClear,
  containerRef,
}: {
  label: string;
  options: string[];
  selected: string[];
  open: boolean;
  onToggleOpen: (e: React.MouseEvent) => void;
  onToggleOption: (name: string) => void;
  onClear: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const active = selected.length > 0;
  return (
    <div ref={containerRef} className="relative">
      {/* Trigger — near-black when a filter is applied (it's "active"), outlined otherwise */}
      <Button
        variant={active ? "primary" : "secondary"}
        size="sm"
        onClick={onToggleOpen}
        iconRight={<ChevronDown size={16} strokeWidth={1.75} />}
      >
        {label}
        {active ? ` (${selected.length})` : ""}
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-modal shadow-popover min-w-[220px] z-50 py-1.5 animate-scale-in">
          {options.map((name) => {
            const checked = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleOption(name);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors hover:bg-surface-2",
                  checked ? "text-accent-strong font-medium" : "text-text",
                  FOCUS_RING
                )}
              >
                {/* Checkbox — green = selected (status) */}
                <span
                  className={cn(
                    "w-4 h-4 rounded-sm border flex items-center justify-center shrink-0",
                    checked ? "bg-accent border-accent text-black" : "border-border-strong"
                  )}
                >
                  {checked && <Check size={12} strokeWidth={2.5} />}
                </span>
                {name}
              </button>
            );
          })}
          {active && (
            <div className="border-t border-border mt-1 pt-1 px-1.5">
              <Button
                variant="ghost"
                size="sm"
                block
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
              >
                Clear filter
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MAIN DASHBOARD COMPONENT
   ============================================================ */
export default function DashboardPage() {
  const router = useRouter();
  const { accounts } = useMsal();

  // Listings data
  const [items, setItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New-listing checklists (Supabase) — listings tagged New
  const [checklists, setChecklists] = useState<ListingChecklist[]>([]);

  // Filters
  const [activeStatus, setActiveStatus] = useState<StatusTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activePropertyTypes, setActivePropertyTypes] = useState<string[]>([]);
  const [activeBrokers, setActiveBrokers] = useState<string[]>([]);

  // Dropdown visibility
  const [ptDropdownOpen, setPtDropdownOpen] = useState(false);
  const [brDropdownOpen, setBrDropdownOpen] = useState(false);
  const ptRef = useRef<HTMLDivElement>(null);
  const brRef = useRef<HTMLDivElement>(null);

  // ---- Fetch listings + new-listing checklists on mount ----
  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, clRes] = await Promise.all([
        fetch("/api/listings"),
        fetch("/api/listings/checklists?new=true"),
      ]);
      if (!listRes.ok) throw new Error(`API ${listRes.status}`);
      const data = await listRes.json();
      setItems(data.items || []);

      // Checklists are non-critical — dashboard still works without them
      if (clRes.ok) {
        const clData = await clRes.json();
        setChecklists(clData.checklists || []);
      }
    } catch (err) {
      setError(`Failed to load: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // ---- Close dropdowns when clicking outside ----
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ptRef.current && !ptRef.current.contains(e.target as Node)) {
        setPtDropdownOpen(false);
      }
      if (brRef.current && !brRef.current.contains(e.target as Node)) {
        setBrDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // ---- New-listing lookups ----
  // Listings tagged New live in the pinned section, not the main table
  const newIds = new Set(checklists.map((c) => c.listing_id));
  const listingsById = new Map(items.map((i) => [i.id, i] as const));
  const tableItems = items.filter((i) => !newIds.has(i.id));

  // New Listing cards are broker-scoped: only shown when the signed-in
  // user is checked as a broker on the listing. Non-broker accounts
  // (e.g. admin) and listings with no brokers assigned show for everyone
  // so nothing goes invisible.
  const myBrokerId = brokerIdForEmail(accounts[0]?.username);
  const myChecklists = checklists.filter((c) => {
    if (!myBrokerId) return true;
    const listing = listingsById.get(c.listing_id);
    const brokerIds = listing?.fieldData?.["listing-brokers"] || [];
    if (brokerIds.length === 0) return true;
    return brokerIds.includes(myBrokerId);
  });

  // ---- Toggle a manual checklist item (optimistic) ----
  const handleChecklistToggle = useCallback(
    async (listingId: string, key: string, value: boolean) => {
      const prev = checklists;

      // Optimistic local update
      setChecklists((cur) =>
        cur.map((c) =>
          c.listing_id === listingId
            ? { ...c, items: { ...c.items, [key]: value } }
            : c
        )
      );

      try {
        const res = await fetch(`/api/listings/checklists/${listingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": accounts[0]?.username || "admin@cre8advisors.com",
          },
          body: JSON.stringify({ items: { [key]: value } }),
        });
        if (!res.ok) throw new Error(`PATCH ${res.status}`);
        const data = await res.json();

        // Server flips is_new=false when all 8 are checked — the card
        // disappears and the listing returns to the main table
        if (data.checklist && !data.checklist.is_new) {
          setChecklists((cur) =>
            cur.filter((c) => c.listing_id !== listingId)
          );
        } else if (data.checklist) {
          setChecklists((cur) =>
            cur.map((c) => (c.listing_id === listingId ? data.checklist : c))
          );
        }
      } catch (err) {
        console.error("[Dashboard] Checklist toggle failed:", err);
        setChecklists(prev); // revert
      }
    },
    [checklists, accounts]
  );

  // ---- Manually complete: move a listing out of New (optimistic) ----
  const handleCompleteListing = useCallback(
    async (listingId: string) => {
      const prev = checklists;

      // Optimistic — card disappears, listing reappears in the main table
      setChecklists((cur) => cur.filter((c) => c.listing_id !== listingId));

      try {
        const res = await fetch(`/api/listings/checklists/${listingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": accounts[0]?.username || "admin@cre8advisors.com",
          },
          body: JSON.stringify({ is_new: false }),
        });
        if (!res.ok) throw new Error(`PATCH ${res.status}`);
      } catch (err) {
        console.error("[Dashboard] Complete listing failed:", err);
        setChecklists(prev); // revert
      }
    },
    [checklists, accounts]
  );

  // ---- Filter + sort items ----
  const filteredItems = tableItems
    .filter((item) => {
      const fd = item.fieldData || {};
      const status = getListingStatus(item);

      // Status tab filter
      if (activeStatus !== "All" && status !== activeStatus) return false;

      // Search filter (name, city, address)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (fd.name || "").toLowerCase();
        const city = (fd["city-county"] || "").toLowerCase();
        const addr = (fd["full-address"] || "").toLowerCase();
        if (!name.includes(q) && !city.includes(q) && !addr.includes(q))
          return false;
      }

      // Property type filter
      if (activePropertyTypes.length > 0) {
        const ptName = PROPERTY_TYPES[fd["property-type"] || ""] || "";
        if (!activePropertyTypes.includes(ptName)) return false;
      }

      // Broker filter
      if (activeBrokers.length > 0) {
        const brokerIds = fd["listing-brokers"] || [];
        const match = brokerIds.some((id) =>
          activeBrokers.includes(BROKERS[id] || "")
        );
        if (!match) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort order: Draft → Live → Under Contract → Sold, then alphabetical by name
      const order = { Draft: 0, Live: 1, "Under Contract": 2, Sold: 3 };
      const sa = order[getListingStatus(a)] ?? 9;
      const sb = order[getListingStatus(b)] ?? 9;
      if (sa !== sb) return sa - sb;
      const na = (a.fieldData?.name || "").toLowerCase();
      const nb = (b.fieldData?.name || "").toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });

  // ---- Counts per status tab (shown inside the tabs) ----
  const statusCounts = tableItems.reduce<Record<string, number>>((acc, item) => {
    const s = getListingStatus(item);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const tabItems = STATUS_TABS.map((tab) => ({
    value: tab,
    label: tab,
    count: tab === "All" ? tableItems.length : statusCounts[tab] || 0,
  }));

  // ---- Unique property type names for dropdown ----
  const propertyTypeNames = Array.from(
    new Set(Object.values(PROPERTY_TYPES))
  ).sort();

  // ---- Broker names for dropdown ----
  const brokerNames = Array.from(
    new Set(Object.values(BROKERS))
  ).sort();

  // ---- Toggle helpers ----
  const togglePropertyType = (name: string) => {
    setActivePropertyTypes((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const toggleBroker = (name: string) => {
    setActiveBrokers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // ---- Status badge tone (green = live, amber = under contract, red = sold) ----
  const badgeTone = (status: string): Tone => {
    if (status === "Live") return "success";
    if (status === "Draft") return "neutral";
    if (status === "Under Contract") return "warning";
    return "danger"; // Sold
  };

  // ---- Row click — open listing edit form ----
  const handleRowClick = (item: ListingItem) => {
    router.push(`/listings/${item.id}/edit`);
  };

  return (
    <AppShell>
      <PageContainer width="wide">
        {/* ---- Page heading + primary action ---- */}
        <PageHeader
          title="Listings"
          actions={
            <Button icon={<Plus size={18} strokeWidth={1.75} />} onClick={() => router.push("/listings/new")}>
              New listing
            </Button>
          }
        />

        {/* ---- New Listings (pinned, with checklists — broker-scoped) ---- */}
        {!loading && myChecklists.length > 0 && (
          <NewListingsSection
            checklists={myChecklists}
            listingsById={listingsById}
            onToggleItem={handleChecklistToggle}
            onComplete={handleCompleteListing}
          />
        )}

        {/* ---- Toolbar: tabs + filters + search ---- */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Status tabs (segmented control with counts) */}
          <Tabs items={tabItems} value={activeStatus} onChange={setActiveStatus} />

          {/* Property type filter */}
          <FilterDropdown
            label="Property type"
            options={propertyTypeNames}
            selected={activePropertyTypes}
            open={ptDropdownOpen}
            containerRef={ptRef}
            onToggleOpen={(e) => {
              e.stopPropagation();
              setPtDropdownOpen(!ptDropdownOpen);
              setBrDropdownOpen(false);
            }}
            onToggleOption={togglePropertyType}
            onClear={() => setActivePropertyTypes([])}
          />

          {/* Broker filter */}
          <FilterDropdown
            label="Broker"
            options={brokerNames}
            selected={activeBrokers}
            open={brDropdownOpen}
            containerRef={brRef}
            onToggleOpen={(e) => {
              e.stopPropagation();
              setBrDropdownOpen(!brDropdownOpen);
              setPtDropdownOpen(false);
            }}
            onToggleOption={toggleBroker}
            onClear={() => setActiveBrokers([])}
          />

          {/* Listing count */}
          <span className="text-sm text-text-3 whitespace-nowrap">
            {filteredItems.length === tableItems.length
              ? `All ${tableItems.length}`
              : `${filteredItems.length} of ${tableItems.length}`}
          </span>

          {/* Search — pushed right, with a leading magnifier icon */}
          <div className="relative ml-auto w-60">
            <Search
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
            />
            <Input
              type="text"
              placeholder="Search listings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        {/* ---- Table (Card with no padding so the sticky header sits flush) ---- */}
        <Card padding="none" className="overflow-auto max-h-[calc(100vh-220px)]">
          <Table>
            <THead>
              <TR>
                {COLUMNS.map((col, i) => (
                  <TH key={i} className={col === "" ? "w-12" : undefined}>
                    {col}
                  </TH>
                ))}
              </TR>
            </THead>
            <tbody>
              {/* Loading state — grey placeholder rows */}
              {loading && (
                <TableMessage colSpan={COLUMNS.length}>
                  <TableSkeleton rows={8} columns={["w-56", "w-20", "w-24", "w-28", "w-24", "w-12", "w-16", "w-20"]} />
                </TableMessage>
              )}

              {/* Error state */}
              {error && (
                <TableMessage colSpan={COLUMNS.length}>
                  <EmptyState
                    title="Couldn't load listings"
                    description={error}
                    action={
                      <Button variant="secondary" onClick={fetchListings}>
                        Retry
                      </Button>
                    }
                  />
                </TableMessage>
              )}

              {/* Empty state */}
              {!loading && !error && filteredItems.length === 0 && (
                <TableMessage colSpan={COLUMNS.length}>
                  <EmptyState
                    icon={<Search size={20} strokeWidth={1.75} />}
                    title="No listings match your filters"
                    description="Try a different status, property type, or search term."
                  />
                </TableMessage>
              )}

              {/* Listing rows */}
              {!loading &&
                !error &&
                filteredItems.map((item) => {
                  const fd = item.fieldData || {};
                  const status = getListingStatus(item);
                  return (
                    <TR key={item.id} onClick={() => handleRowClick(item)} className="group">
                      {/* Name (bold) */}
                      <TD className="font-semibold text-text max-w-[320px] truncate">
                        {fd.name || "—"}
                      </TD>

                      {/* Listing Type */}
                      <TD nowrap className="text-text-2">
                        {LISTING_TYPES[fd["listing-type-2"] || ""] || "—"}
                      </TD>

                      {/* Property Type */}
                      <TD nowrap className="text-text-2">
                        {PROPERTY_TYPES_SHORT[fd["property-type"] || ""] || "—"}
                      </TD>

                      {/* City */}
                      <TD nowrap className="text-text-2">
                        {cityShort(fd["city-county"])}
                      </TD>

                      {/* Price */}
                      <TD nowrap className="text-text-2">
                        {fd["list-price"] || "—"}
                      </TD>

                      {/* Acres */}
                      <TD nowrap className="text-text-2">
                        {fd["square-feet"] != null
                          ? String(fd["square-feet"])
                          : "—"}
                      </TD>

                      {/* Status badge */}
                      <TD nowrap>
                        <Badge tone={badgeTone(status)}>{status}</Badge>
                      </TD>

                      {/* Updated date */}
                      <TD nowrap className="text-text-2">
                        {formatDate(item.lastUpdated)}
                      </TD>

                      {/* Open-on-site link (appears on hover) */}
                      <TD nowrap align="right" className="pr-3">
                        {fd.slug && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://www.cre8advisors.com/listings/${fd.slug}`,
                                "_blank"
                              );
                            }}
                            title="View on site"
                            aria-label="View on site"
                            className={cn(
                              "inline-flex items-center justify-center w-7 h-7 rounded-control text-text-3",
                              "opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-2 hover:text-text",
                              FOCUS_RING
                            )}
                          >
                            <ExternalLink size={16} strokeWidth={1.75} />
                          </button>
                        )}
                      </TD>
                    </TR>
                  );
                })}
            </tbody>
          </Table>
        </Card>
      </PageContainer>
    </AppShell>
  );
}
