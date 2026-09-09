"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListingItem } from "@/lib/admin-constants";
import { GroupListing, GroupChip } from "@/lib/email/types";
import { listingToGroupCard } from "@/lib/email/utils";
import { FieldProps } from "./fieldProps";

interface GroupListingsPickerProps {
  listings: ListingItem[];
  loading: boolean;
  cards: GroupListing[];
  onChange: (cards: GroupListing[]) => void;
  fieldProps: FieldProps;
}

const INPUT = "w-full border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal placeholder:text-border-medium focus:outline-none focus:ring-1 focus:ring-green";
const CHIPS: GroupChip[] = ["", "Just Listed", "Price Reduced", "Under Contract"];

/**
 * Section 1 for group emails — pick several listings, order them, tune each card.
 * Each card: photo (from the listing's gallery), name, one-line summary, status chip.
 */
export default function GroupListingsPicker({ listings, loading, cards, onChange, fieldProps }: GroupListingsPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [photoPickerFor, setPhotoPickerFor] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const chosen = new Set(cards.map((c) => c.listing_id));
  const candidates = useMemo(
    () => listings.filter((l) => !l.fieldData.sold && !chosen.has(l.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listings, cards]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((l) => {
      const fd = l.fieldData;
      return [fd.name, fd["city-county"], fd["full-address"], fd["list-price"], fd.zoning]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [candidates, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const add = (l: ListingItem) => {
    onChange([...cards, listingToGroupCard(l)]);
    setQuery("");
  };
  const update = (id: string, patch: Partial<GroupListing>) => onChange(cards.map((c) => (c.listing_id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(cards.filter((c) => c.listing_id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const i = cards.findIndex((c) => c.listing_id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cards.length) return;
    const next = [...cards];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Chosen listings, in email order */}
      {cards.length > 0 && (
        <ol className="space-y-2">
          {cards.map((c, i) => {
            const item = listings.find((l) => l.id === c.listing_id);
            const gallery = item?.fieldData.gallery || [];
            const binding = fieldProps(`group-${i}`);
            return (
              <li key={c.listing_id} className="rounded-card border border-border-light bg-white p-2.5">
                <div className="flex items-start gap-3">
                  {/* Photo — click to swap */}
                  <button
                    type="button"
                    onClick={() => setPhotoPickerFor(photoPickerFor === c.listing_id ? null : c.listing_id)}
                    className="w-20 h-14 rounded overflow-hidden bg-border-light shrink-0 ring-1 ring-border-light hover:ring-green"
                    title={gallery.length > 1 ? "Click to choose a different photo" : "Photo"}
                  >
                    {c.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-charcoal text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium text-charcoal truncate">{c.name}</span>
                    </div>
                    <input
                      {...binding}
                      value={c.summary}
                      onChange={(e) => update(c.listing_id, { summary: e.target.value })}
                      placeholder="Price · Acres · City"
                      className={`${INPUT} text-xs`}
                    />
                    <div className="flex items-center gap-1.5">
                      {CHIPS.map((chip) => (
                        <button
                          key={chip || "none"}
                          type="button"
                          onClick={() => update(c.listing_id, { chip })}
                          className={`px-2 py-0.5 rounded-btn text-[11px] font-medium transition-colors ${
                            c.chip === chip
                              ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                              : "bg-light-gray text-medium-gray hover:text-charcoal border border-transparent"
                          }`}
                        >
                          {chip || "No chip"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Order + remove */}
                  <div className="flex flex-col items-center shrink-0">
                    <button type="button" onClick={() => move(c.listing_id, -1)} disabled={i === 0} className="p-0.5 text-muted-gray hover:text-charcoal disabled:opacity-20" title="Move up">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button type="button" onClick={() => move(c.listing_id, 1)} disabled={i === cards.length - 1} className="p-0.5 text-muted-gray hover:text-charcoal disabled:opacity-20" title="Move down">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button type="button" onClick={() => remove(c.listing_id)} className="p-0.5 text-muted-gray hover:text-red-500 text-base leading-none" title="Remove">&times;</button>
                  </div>
                </div>

                {/* Gallery strip for this card */}
                {photoPickerFor === c.listing_id && gallery.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {gallery.map((img, gi) => (
                      <button
                        key={gi}
                        type="button"
                        onClick={() => {
                          update(c.listing_id, { photo_url: img.url });
                          setPhotoPickerFor(null);
                        }}
                        className={`aspect-[4/3] rounded overflow-hidden ${c.photo_url === img.url ? "ring-2 ring-green" : "ring-1 ring-border-light opacity-80 hover:opacity-100"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Add a listing */}
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`w-full border border-dashed rounded-btn px-3 py-2 text-sm text-left transition-colors ${
            open ? "border-green text-charcoal" : "border-border-medium text-muted-gray hover:border-muted-gray hover:text-charcoal"
          }`}
        >
          + Add a listing{cards.length < 2 ? ` (${2 - cards.length} more needed)` : ""}
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-border-light rounded-card shadow-lg overflow-hidden">
            <div className="p-2 border-b border-border-light">
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search listings" className={INPUT} />
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {loading && filtered.length === 0 && <li className="px-3 py-3 text-sm text-muted-gray">Loading…</li>}
              {!loading && filtered.length === 0 && <li className="px-3 py-3 text-sm text-muted-gray">No matches</li>}
              {filtered.map((l) => {
                const fd = l.fieldData;
                const t = fd.gallery?.[0]?.url;
                const sub = [fd["city-county"], fd["list-price"]].filter(Boolean).join(" · ");
                return (
                  <li key={l.id}>
                    <button type="button" onClick={() => add(l)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-light-gray">
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
