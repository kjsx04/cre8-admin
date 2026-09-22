"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { LoadingBlock } from "@/components/ui";
import ListingForm from "@/components/ListingForm";
import { ListingItem } from "@/lib/admin-constants";

/**
 * /listings/new — Create a new listing.
 * Fetches all listings (for duplicate detection),
 * then renders ListingForm in create mode (item = null).
 */
export default function NewListingPage() {
  const [allItems, setAllItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/listings");
        const data = await res.json();
        setAllItems(data.items || []);
      } catch {
        // Non-critical — duplicate detection just won't work
        console.warn("Failed to load listings for duplicate detection");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <AppShell>
      <div>
        {/* Brief loading while fetching listing list */}
        {loading && (
          <LoadingBlock message="Loading…" />
        )}

        {/* Form in create mode */}
        {!loading && <ListingForm item={null} allItems={allItems} />}
      </div>
    </AppShell>
  );
}
