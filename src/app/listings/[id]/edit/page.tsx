"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { LoadingBlock, EmptyState } from "@/components/ui";
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
      <div>
        {/* Loading state */}
        {loading && (
          <LoadingBlock message="Loading listing…" />
        )}

        {/* Error state */}
        {error && (
          <EmptyState title="Couldn't load this listing" description={error} />
        )}

        {/* Form */}
        {!loading && !error && item && (
          <ListingForm item={item} allItems={allItems} />
        )}
      </div>
    </AppShell>
  );
}
