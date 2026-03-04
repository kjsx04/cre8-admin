"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  ListingItem,
  getListingStatus,
  formatDate,
  cityShort,
  LISTING_TYPES,
  PROPERTY_TYPES_SHORT,
  PROPERTY_TYPES,
  BROKERS,
} from "@/lib/admin-constants";

/* ============================================================
   STATUS TABS — filter by listing status
   ============================================================ */
const STATUS_TABS = ["All", "Draft", "Live", "Sold"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/* ============================================================
   MAIN DASHBOARD COMPONENT
   ============================================================ */
export default function DashboardPage() {
  const router = useRouter();

  // Listings data
  const [items, setItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Table body ref for dynamic height sizing
  const tbodyRef = useRef<HTMLDivElement>(null);

  // ---- Fetch listings on mount ----
  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/listings");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
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

  // ---- Resize table body to fill viewport ----
  const sizeTableBody = useCallback(() => {
    if (!tbodyRef.current) return;
    const rect = tbodyRef.current.getBoundingClientRect();
    tbodyRef.current.style.maxHeight = `${window.innerHeight - rect.top - 16}px`;
  }, []);

  useEffect(() => {
    sizeTableBody();
    window.addEventListener("resize", sizeTableBody);
    return () => window.removeEventListener("resize", sizeTableBody);
  }, [sizeTableBody, items, loading]);

  // ---- Filter + sort items ----
  const filteredItems = items
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
      // Sort order: Draft → Live → Sold, then alphabetical by name
      const order = { Draft: 0, Live: 1, Sold: 2 };
      const sa = order[getListingStatus(a)] ?? 9;
      const sb = order[getListingStatus(b)] ?? 9;
      if (sa !== sb) return sa - sb;
      const na = (a.fieldData?.name || "").toLowerCase();
      const nb = (b.fieldData?.name || "").toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });

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

  // ---- Status badge styling ----
  const badgeClass = (status: string) => {
    if (status === "Live") return "bg-[#E8F5D4] text-[#4A8C1C]";
    if (status === "Draft") return "bg-[#FFF8E1] text-[#B8860B]";
    return "bg-[#FFEAEA] text-[#CC3333]"; // Sold
  };

  // ---- Row click — open listing edit form ----
  const handleRowClick = (item: ListingItem) => {
    router.push(`/listings/${item.id}/edit`);
  };

  return (
    <AppShell>
      <div className="px-6 py-4">
        {/* ---- Page heading ---- */}
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-4">Listings</h1>

        {/* ---- Toolbar: tabs + filters + search ---- */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Status tabs */}
          <div className="flex items-center gap-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveStatus(tab)}
                className={`px-3 py-1 rounded-btn text-xs font-semibold transition-colors duration-150
                  ${
                    activeStatus === tab
                      ? "bg-white text-[#1a1a1a] border border-[#E5E5E5] shadow-sm"
                      : "text-[#777] hover:text-[#333] border border-transparent"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Property Type filter pill */}
          <div ref={ptRef} className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPtDropdownOpen(!ptDropdownOpen);
                setBrDropdownOpen(false);
              }}
              className={`px-3 py-1.5 rounded-btn text-xs font-semibold border transition-colors duration-150
                ${
                  activePropertyTypes.length > 0
                    ? "bg-[#1a1a1a] text-white border-[#1a1a1a]"
                    : "text-[#333] border-[#E5E5E5] hover:border-[#CCC]"
                }`}
            >
              Property Type{activePropertyTypes.length > 0 ? ` (${activePropertyTypes.length})` : ""} ▾
            </button>

            {ptDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-[#E5E5E5] rounded-lg shadow-lg min-w-[200px] z-50 py-1.5">
                {propertyTypeNames.map((name) => (
                  <button
                    key={name}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePropertyType(name);
                    }}
                    className={`w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors
                      hover:bg-[#F5F5F5]
                      ${activePropertyTypes.includes(name) ? "text-[#4A8C1C] font-semibold" : "text-[#333]"}`}
                  >
                    {/* Checkbox */}
                    <span
                      className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center flex-shrink-0 text-[11px]
                        ${
                          activePropertyTypes.includes(name)
                            ? "bg-green border-green text-black"
                            : "border-[#CCC]"
                        }`}
                    >
                      {activePropertyTypes.includes(name) && "✓"}
                    </span>
                    {name}
                  </button>
                ))}
                {activePropertyTypes.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePropertyTypes([]);
                    }}
                    className="w-full text-center text-[11px] text-[#777] hover:text-[#CC3333] py-2 border-t border-[#F0F0F0] mt-1 transition-colors"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Broker filter pill */}
          <div ref={brRef} className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBrDropdownOpen(!brDropdownOpen);
                setPtDropdownOpen(false);
              }}
              className={`px-3 py-1.5 rounded-btn text-xs font-semibold border transition-colors duration-150
                ${
                  activeBrokers.length > 0
                    ? "bg-[#1a1a1a] text-white border-[#1a1a1a]"
                    : "text-[#333] border-[#E5E5E5] hover:border-[#CCC]"
                }`}
            >
              Broker{activeBrokers.length > 0 ? ` (${activeBrokers.length})` : ""} ▾
            </button>

            {brDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-[#E5E5E5] rounded-lg shadow-lg min-w-[200px] z-50 py-1.5">
                {brokerNames.map((name) => (
                  <button
                    key={name}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBroker(name);
                    }}
                    className={`w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors
                      hover:bg-[#F5F5F5]
                      ${activeBrokers.includes(name) ? "text-[#4A8C1C] font-semibold" : "text-[#333]"}`}
                  >
                    <span
                      className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center flex-shrink-0 text-[11px]
                        ${
                          activeBrokers.includes(name)
                            ? "bg-green border-green text-black"
                            : "border-[#CCC]"
                        }`}
                    >
                      {activeBrokers.includes(name) && "✓"}
                    </span>
                    {name}
                  </button>
                ))}
                {activeBrokers.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveBrokers([]);
                    }}
                    className="w-full text-center text-[11px] text-[#777] hover:text-[#CC3333] py-2 border-t border-[#F0F0F0] mt-1 transition-colors"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Listing count */}
          <span className="text-sm text-[#777] whitespace-nowrap">
            {filteredItems.length === items.length
              ? `All ${items.length}`
              : `${filteredItems.length} of ${items.length}`}
          </span>

          {/* Search — pushed right */}
          <div className="relative ml-auto">
            <input
              type="text"
              placeholder="Search listings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white border border-[#E5E5E5] rounded-btn px-3 py-1.5 text-sm text-[#333]
                         placeholder:text-[#777] outline-none focus:border-green transition-colors w-52"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#777] hover:text-[#333] text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* + New Listing button */}
          <button
            onClick={() => router.push("/listings/new")}
            className="bg-green text-black font-semibold px-4 py-1.5 rounded-btn text-sm
                       hover:brightness-110 transition-all"
          >
            + New Listing
          </button>
        </div>

        {/* ---- Table ---- */}
        <div className="border border-[#E5E5E5] rounded-lg bg-white overflow-hidden">
          {/* Table header */}
          <div
            className="grid gap-0 px-5 py-2.5 border-b border-[#E5E5E5] bg-[#FAFAFA]"
            style={{
              gridTemplateColumns: "2fr 1fr 1.2fr 1.5fr 1fr 0.6fr 0.7fr 0.8fr",
            }}
          >
            {["Name", "Type", "Property", "City", "Price", "Acres", "Status", "Updated"].map(
              (col) => (
                <div
                  key={col}
                  className="text-[11px] font-semibold text-[#777] uppercase tracking-wider"
                >
                  {col}
                </div>
              )
            )}
          </div>

          {/* Table body */}
          <div ref={tbodyRef} className="overflow-y-auto">
            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-12 text-[#777] text-sm">
                <div className="w-[18px] h-[18px] border-2 border-[#E5E5E5] border-t-green rounded-full animate-spin mr-2.5" />
                Loading listings...
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="text-center py-10 text-[#CC3333] text-sm">
                {error}
                <br />
                <button
                  onClick={fetchListings}
                  className="mt-2.5 px-4 py-1.5 rounded bg-[#F0F0F0] text-[#1A1A1A] border border-[#E0E0E0] text-[13px] hover:bg-[#E0E0E0] transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filteredItems.length === 0 && (
              <div className="text-center py-12 text-[#777] text-sm">
                No listings match your filters
              </div>
            )}

            {/* Listing rows */}
            {!loading &&
              !error &&
              filteredItems.map((item) => {
                const fd = item.fieldData || {};
                const status = getListingStatus(item);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleRowClick(item)}
                    className="grid gap-0 px-5 py-[11px] items-center border-b border-[#F0F0F0] last:border-b-0
                               text-[13px] text-[#333] hover:bg-[#F8F8F8] transition-colors relative group cursor-pointer"
                    style={{
                      gridTemplateColumns:
                        "2fr 1fr 1.2fr 1.5fr 1fr 0.6fr 0.7fr 0.8fr",
                    }}
                  >
                    {/* Name (bold) */}
                    <div className="font-semibold text-[#1a1a1a] overflow-hidden text-ellipsis whitespace-nowrap">
                      {fd.name || "\u2014"}
                    </div>

                    {/* Listing Type */}
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {LISTING_TYPES[fd["listing-type-2"] || ""] || "\u2014"}
                    </div>

                    {/* Property Type */}
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {PROPERTY_TYPES_SHORT[fd["property-type"] || ""] || "\u2014"}
                    </div>

                    {/* City */}
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {cityShort(fd["city-county"])}
                    </div>

                    {/* Price */}
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {fd["list-price"] || "\u2014"}
                    </div>

                    {/* Acres */}
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {fd["square-feet"] != null
                        ? String(fd["square-feet"])
                        : "\u2014"}
                    </div>

                    {/* Status badge */}
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${badgeClass(status)}`}
                      >
                        {status}
                      </span>
                    </div>

                    {/* Updated date */}
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {formatDate(item.lastUpdated)}
                    </div>

                    {/* Open link arrow (visible on hover) */}
                    {fd.slug && (
                      <a
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            `https://www.cre8advisors.com/listings/${fd.slug}`,
                            "_blank"
                          );
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded
                                   bg-[#F0F0F0] flex items-center justify-center text-[13px] text-[#666]
                                   opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer
                                   hover:bg-[#E0E0E0] hover:text-[#333]"
                        title="View on site"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
