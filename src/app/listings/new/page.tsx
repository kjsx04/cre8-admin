"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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
          <div className="flex items-center justify-center py-20 text-[#777] text-sm">
            <div className="w-[18px] h-[18px] border-2 border-[#E5E5E5] border-t-green rounded-full animate-spin mr-2.5" />
            Loading...
          </div>
        )}

        {/* Form in create mode */}
        {!loading && <ListingForm item={null} allItems={allItems} />}
      </div>
    </AppShell>
  );
}
