"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { ListingItem } from "@/lib/admin-constants";
import { Badge, Input } from "@/components/ui";

interface ListingPickerProps {
  listings: ListingItem[];
  loading: boolean;
  /** The listing matching the draft's listingId (undefined if not in the CMS list) */
  selected: ListingItem | undefined;
  /** Stored name to show when the listing isn't in the CMS list (edit mode) */
  fallbackName: string;
  onPick: (listing: ListingItem) => void;
}

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
    <div className="space-y-3">
      {/* Search box — always visible, results drop down beneath it */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none" />
          {/* Shared Input with room for the search icon */}
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={loading ? "Loading listings…" : hasSelection ? "Search to change the listing" : "Search listings"}
            className="pl-9"
          />
        </div>

        {/* Results — a floating layer, so it gets the popover shadow */}
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-surface border border-border rounded-card shadow-popover overflow-hidden">
            <ul className="max-h-72 overflow-y-auto py-1">
              {loading && filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-text-3">Loading…</li>
              )}
              {!loading && filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-text-3">No matches</li>
              )}
              {filtered.map((l, i) => {
                const fd = l.fieldData;
                const t = fd.gallery?.[0]?.url;
                const sub = [fd["city-county"], fd["list-price"]].filter(Boolean).join(" · ");
                const isCurrent = selected?.id === l.id;
                return (
                  <li key={l.id}>
                    {/* Option row — a bare button because it holds a thumbnail + two lines */}
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightIdx(i)}
                      onClick={() => choose(l)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                        i === highlightIdx ? "bg-surface-2" : ""
                      }`}
                    >
                      <div className="w-12 h-8 rounded overflow-hidden bg-surface-2 shrink-0">
                        {t && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-text truncate">{fd.name || l.id}</div>
                        {sub && <div className="text-xs text-text-3 truncate">{sub}</div>}
                      </div>
                      {isCurrent && <Badge tone="success" size="sm" className="ml-auto shrink-0">Selected</Badge>}
                      {!isCurrent && l.isDraft && <Badge size="sm" className="ml-auto shrink-0">Draft</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* The chosen listing — green border = selected (status) */}
      {hasSelection && (
        <div className="flex items-center gap-3 border border-accent-strong bg-accent-soft/40 rounded-control px-3 py-2">
          <div className="w-11 h-8 rounded overflow-hidden bg-surface-2 shrink-0">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-text truncate">{selected?.fieldData.name || fallbackName}</div>
            <div className="text-xs text-text-3 truncate">
              {selected ? (selected.fieldData["city-county"] || selected.fieldData["list-price"] || " ") : "Not in CMS — stored details will be used"}
            </div>
          </div>
          <Check size={16} strokeWidth={1.75} className="text-accent-strong shrink-0" />
        </div>
      )}
    </div>
  );
}
