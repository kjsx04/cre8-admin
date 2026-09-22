"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Campaign } from "@/lib/email/types";
import { canEdit } from "@/lib/email/utils";
import { ListingItem } from "@/lib/admin-constants";
import { Button, EmptyState, LoadingBlock } from "@/components/ui";
import EmailComposer from "@/components/email/composer/EmailComposer";

/**
 * /marketing/email/[id]/edit — edit an existing campaign.
 * Loads the campaign + listings, then renders the composer prefilled.
 * Campaigns that can't be edited (completed / cancelled / paused) bounce back to the calendar.
 */
export default function EditCampaignPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [campRes, listRes] = await Promise.all([
          fetch(`/api/email/campaigns/${id}`),
          fetch("/api/listings").catch(() => null),
        ]);

        if (!campRes.ok) {
          setError("Campaign not found");
          return;
        }
        const camp: Campaign = await campRes.json();

        if (!canEdit(camp.status)) {
          router.replace("/marketing/email");
          return;
        }
        setCampaign(camp);

        if (listRes && listRes.ok) {
          const data = await listRes.json();
          setListings(data.items || []);
        }
      } catch {
        setError("Failed to load campaign");
      } finally {
        setListingsLoading(false);
      }
    })();
  }, [id, router]);

  // Error → shared empty state with a way back
  if (error) {
    return (
      <EmptyState
        title={error}
        action={
          <Button variant="secondary" href="/marketing/email">
            Back to campaigns
          </Button>
        }
      />
    );
  }

  // Loading → shared spinner block
  if (!campaign) {
    return <LoadingBlock message="Loading campaign..." />;
  }

  return (
    <EmailComposer mode="edit" campaign={campaign} listings={listings} listingsLoading={listingsLoading} />
  );
}
