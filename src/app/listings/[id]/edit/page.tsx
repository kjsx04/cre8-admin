"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import ListingForm from "@/components/ListingForm";
import { ListingItem } from "@/lib/admin-constants";

/**
 * /listings/[id]/edit — Edit an existing listing.
 * Fetches the listing by ID + all listings (for duplicate detection),
 * then renders ListingForm in edit mode.
 */
export default function EditListingPage() {
  const params = useParams();
  const id = params.id as string;

  const [item, setItem] = useState<ListingItem | null>(null);
  const [allItems, setAllItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch listing + all listings in parallel
        const [itemRes, allRes] = await Promise.all([
          fetch(`/api/listings/${id}`),
          fetch("/api/listings"),
        ]);

        if (!itemRes.ok) {
          throw new Error(
            itemRes.status === 404
              ? "Listing not found"
              : `Failed to load listing (${itemRes.status})`
          );
        }

        const itemData = await itemRes.json();
        const allData = await allRes.json();

        setItem(itemData.item);
        setAllItems(allData.items || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  return (
    <AppShell>
      <div style={{ fontFamily: "'Barlow', sans-serif" }}>
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-[#999] text-sm">
            <div className="w-[18px] h-[18px] border-2 border-[#E5E5E5] border-t-green rounded-full animate-spin mr-2.5" />
            Loading listing...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-20 text-[#CC3333] text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        {!loading && !error && item && (
          <ListingForm item={item} allItems={allItems} />
        )}
      </div>
    </AppShell>
  );
}
