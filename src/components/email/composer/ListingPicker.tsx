"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListingItem } from "@/lib/admin-constants";

interface ListingPickerProps {
  listings: ListingItem[];
  loading: boolean;
  /** The listing matching the draft's listingId (undefined if not in the CMS list) */
  selected: ListingItem | undefined;
  /** Stored name to show when the listing isn't in the CMS list (edit mode) */
  fallbackName: string;
  onPick: (listing: ListingItem) => void;
}

const INPUT = "w-full border border-border-light rounded-btn pl-9 pr-3 py-2 text-sm text-charcoal placeholder:text-border-medium focus:outline-none focus:ring-1 focus:ring-green";

/**
 * Section 2 (single emails) — pick the listing.
 * A search box you can type in straight away; results drop down as you type.
 * Picking one auto-fills the campaign and shows it as a card under the box.
 */
export default function ListingPicker({
  listings,
  loading,
  selected,
  fallbackName,
  onPick,
}: ListingPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Candidates: not sold (Just Sold announcements come from the publish flow), drafts included
  const candidates = useMemo(
    () => listings.filter((l) => !l.fieldData.sold),
    [listings]
  );

  // Match on name, city, address, or price
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((l) => {
      const fd = l.fieldData;
      return [fd.name, fd["city-county"], fd["full-address"], fd["list-price"]]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [candidates, query]);

  // Close the results when clicking anywhere else
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(l: ListingItem) {
    onPick(l);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlightIdx((i) => (i + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setHighlightIdx((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter" && open) { e.preventDefault(); choose(filtered[highlightIdx]); }
  }

  const thumb = selected?.fieldData.gallery?.[0]?.url;
  const hasSelection = !!selected || !!fallbackName;

  return (
    <div className="space-y-2">
      {/* Search box — always visible, results drop down beneath it */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-gray pointer-events-none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={loading ? "Loading listings…" : hasSelection ? "Search to change the listing" : "Search listings"}
            className={INPUT}
          />
        </div>

        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-border-light rounded-card shadow-lg overflow-hidden">
            <ul className="max-h-72 overflow-y-auto py-1">
              {loading && filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-gray">Loading…</li>
              )}
              {!loading && filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-gray">No matches</li>
              )}
              {filtered.map((l, i) => {
                const fd = l.fieldData;
                const t = fd.gallery?.[0]?.url;
                const sub = [fd["city-county"], fd["list-price"]].filter(Boolean).join(" · ");
                const isCurrent = selected?.id === l.id;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightIdx(i)}
                      onClick={() => choose(l)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                        i === highlightIdx ? "bg-light-gray" : ""
                      }`}
                    >
                      <div className="w-12 h-8 rounded overflow-hidden bg-border-light shrink-0">
                        {t && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-charcoal truncate">{fd.name || l.id}</div>
                        {sub && <div className="text-xs text-muted-gray truncate">{sub}</div>}
                      </div>
                      {isCurrent && <span className="ml-auto text-[10px] uppercase tracking-wide text-green shrink-0">Selected</span>}
                      {!isCurrent && l.isDraft && <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-gray shrink-0">Draft</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* The chosen listing */}
      {hasSelection && (
        <div className="flex items-center gap-3 border border-green rounded-btn px-3 py-2 bg-white">
          <div className="w-11 h-8 rounded overflow-hidden bg-border-light shrink-0">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-charcoal truncate">{selected?.fieldData.name || fallbackName}</div>
            <div className="text-xs text-muted-gray truncate">
              {selected ? (selected.fieldData["city-county"] || selected.fieldData["list-price"] || " ") : "Not in CMS — stored details will be used"}
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green shrink-0">
            <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
