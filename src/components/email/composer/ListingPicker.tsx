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

const INPUT = "w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal placeholder:text-border-medium focus:outline-none focus:ring-1 focus:ring-green";

/**
 * Section 1 — pick the listing.
 * A button that opens a searchable list. Picking auto-fills the campaign.
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Candidates: not sold (Just Sold announcements come from the publish flow), drafts included
  const candidates = useMemo(
    () => listings.filter((l) => !l.fieldData.sold),
    [listings]
  );

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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the search box when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIdx(0);
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  function choose(l: ListingItem) {
    onPick(l);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => (i + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter") { e.preventDefault(); choose(filtered[highlightIdx]); }
  }

  const thumb = selected?.fieldData.gallery?.[0]?.url;
  const hasSelection = !!selected || !!fallbackName;

  return (
    <div>
      {/* Trigger / current selection */}
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center gap-3 border rounded-btn px-3 py-2 text-left transition-colors ${
            open ? "border-green ring-1 ring-green" : "border-border-light hover:bg-light-gray"
          }`}
        >
          {/* Thumbnail */}
          <div className="w-11 h-8 rounded overflow-hidden bg-border-light shrink-0">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {hasSelection ? (
              <>
                <div className="text-sm text-charcoal truncate">{selected?.fieldData.name || fallbackName}</div>
                <div className="text-xs text-muted-gray truncate">
                  {selected ? (selected.fieldData["city-county"] || selected.fieldData["list-price"] || " ") : "Not in CMS — stored details will be used"}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-gray">{loading ? "Loading listings…" : "Choose a listing"}</div>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`text-muted-gray shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-border-light rounded-card shadow-lg overflow-hidden">
            <div className="p-2 border-b border-border-light">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search listings"
                className={INPUT}
              />
            </div>
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
                      {l.isDraft && <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-gray shrink-0">Draft</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

    </div>
  );
}
