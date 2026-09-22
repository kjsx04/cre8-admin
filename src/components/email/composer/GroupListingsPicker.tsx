"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { ListingItem } from "@/lib/admin-constants";
import { GroupListing, GroupChip } from "@/lib/email/types";
import { listingToGroupCard } from "@/lib/email/utils";
import { IconButton, Input, Tabs } from "@/components/ui";
import { FieldProps } from "./fieldProps";

interface GroupListingsPickerProps {
  listings: ListingItem[];
  loading: boolean;
  cards: GroupListing[];
  onChange: (cards: GroupListing[]) => void;
  fieldProps: FieldProps;
}

const CHIPS: GroupChip[] = ["", "Just Listed", "Price Reduced", "Under Contract"];

/**
 * Section 2 (group emails) — pick several listings, order them, tune each card.
 * The search box stays open while you add: type, click a listing, it joins the
 * list below and the box is ready for the next one.
 * Each card: photo (from the listing's gallery), name, one-line summary, status chip.
 */
export default function GroupListingsPicker({ listings, loading, cards, onChange, fieldProps }: GroupListingsPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [photoPickerFor, setPhotoPickerFor] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listings not yet in the group (sold ones excluded)
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

  // Close the results when clicking anywhere else
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /** Add a listing and keep the search ready for the next one */
  const add = (l: ListingItem) => {
    onChange([...cards, listingToGroupCard(l)]);
    setQuery("");
    setHighlightIdx(0);
    inputRef.current?.focus();
    setOpen(true);
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

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlightIdx((i) => (i + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setHighlightIdx((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter" && open) { e.preventDefault(); add(filtered[highlightIdx]); }
  }

  const needed = Math.max(0, 2 - cards.length);

  return (
    <div className="space-y-4">
      {/* Search + add — stays open so you can keep adding */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={loading ? "Loading listings…" : cards.length === 0 ? "Search listings — click to add" : "Add another listing"}
            className="pl-9"
          />
        </div>
        {/* Results — a floating layer, so it gets the popover shadow */}
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-surface border border-border rounded-card shadow-popover overflow-hidden">
            <ul className="max-h-72 overflow-y-auto py-1">
              {loading && filtered.length === 0 && <li className="px-3 py-3 text-sm text-text-3">Loading…</li>}
              {!loading && filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-text-3">{candidates.length === 0 ? "Every listing is already in the group" : "No matches"}</li>
              )}
              {filtered.map((l, i) => {
                const fd = l.fieldData;
                const t = fd.gallery?.[0]?.url;
                const sub = [fd["city-county"], fd["list-price"]].filter(Boolean).join(" · ");
                return (
                  <li key={l.id}>
                    {/* Option row — a bare button because it holds a thumbnail + two lines */}
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightIdx(i)}
                      onClick={() => add(l)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left ${i === highlightIdx ? "bg-surface-2" : ""}`}
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
                      <span className="ml-auto text-xs font-medium text-text-2 shrink-0">Add</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {needed > 0 && (
        <p className="text-xs text-text-3 -mt-2">
          {cards.length === 0 ? "Pick at least 2 listings." : "1 more needed."}
        </p>
      )}

      {/* Chosen listings, in email order */}
      {cards.length > 0 && (
        <ol className="space-y-2">
          {cards.map((c, i) => {
            const item = listings.find((l) => l.id === c.listing_id);
            const gallery = item?.fieldData.gallery || [];
            const binding = fieldProps(`group-${i}`);
            return (
              <li key={c.listing_id} className="rounded-card border border-border bg-surface p-3">
                <div className="flex items-start gap-3">
                  {/* Photo — click to swap (ring turns green on hover = pick) */}
                  <button
                    type="button"
                    onClick={() => setPhotoPickerFor(photoPickerFor === c.listing_id ? null : c.listing_id)}
                    className="w-20 h-14 rounded overflow-hidden bg-surface-2 shrink-0 ring-1 ring-border hover:ring-accent"
                    title={gallery.length > 1 ? "Click to choose a different photo" : "Photo"}
                  >
                    {c.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-ink text-white text-label font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium text-text truncate">{c.name}</span>
                    </div>
                    {/* Summary line — keeps the composer's click-to-focus binding */}
                    <Input
                      {...binding}
                      small
                      value={c.summary}
                      onChange={(e) => update(c.listing_id, { summary: e.target.value })}
                      placeholder="Acres · City"
                    />
                    {/* Status chip — segmented choice */}
                    <Tabs
                      size="sm"
                      items={CHIPS.map((chip) => ({ value: chip, label: chip || "No chip" }))}
                      value={c.chip}
                      onChange={(chip) => update(c.listing_id, { chip })}
                    />
                  </div>

                  {/* Order + remove */}
                  <div className="flex flex-col items-center shrink-0">
                    <IconButton size="sm" label="Move up" icon={<ArrowUp size={16} strokeWidth={1.75} />} onClick={() => move(c.listing_id, -1)} disabled={i === 0} />
                    <IconButton size="sm" label="Move down" icon={<ArrowDown size={16} strokeWidth={1.75} />} onClick={() => move(c.listing_id, 1)} disabled={i === cards.length - 1} />
                    <IconButton size="sm" label="Remove" icon={<X size={16} strokeWidth={1.75} />} onClick={() => remove(c.listing_id)} className="hover:text-danger-fg" />
                  </div>
                </div>

                {/* Gallery strip for this card */}
                {photoPickerFor === c.listing_id && gallery.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {gallery.map((img, gi) => (
                      <button
                        key={gi}
                        type="button"
                        onClick={() => {
                          update(c.listing_id, { photo_url: img.url });
                          setPhotoPickerFor(null);
                        }}
                        className={`aspect-[4/3] rounded overflow-hidden ${c.photo_url === img.url ? "ring-2 ring-accent" : "ring-1 ring-border opacity-80 hover:opacity-100"}`}
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
    </div>
  );
}
