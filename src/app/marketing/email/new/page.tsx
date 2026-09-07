"use client";

import { useEffect, useState } from "react";
import { ListingItem } from "@/lib/admin-constants";
import EmailComposer from "@/components/email/composer/EmailComposer";

/**
 * /marketing/email/new — create a campaign.
 * Renders the composer immediately; listings load in the background.
 */
export default function NewCampaignPage() {
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/listings");
        if (res.ok) {
          const data = await res.json();
          setListings(data.items || []);
        }
      } catch {
        // Listing picker shows an empty list; the rest of the composer still works
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return <EmailComposer mode="create" listings={listings} listingsLoading={loading} />;
}
