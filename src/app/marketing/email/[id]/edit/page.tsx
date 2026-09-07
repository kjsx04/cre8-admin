"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Campaign } from "@/lib/email/types";
import { canEdit } from "@/lib/email/utils";
import { ListingItem } from "@/lib/admin-constants";
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

  if (error) {
    return (
      <div className="text-center py-20 text-[#CC3333] text-sm">
        {error}
        <div className="mt-3">
          <Link href="/marketing/email" className="text-green hover:underline">Back to campaigns</Link>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center py-20 text-[#777] text-sm">
        <div className="w-[18px] h-[18px] border-2 border-[#E5E5E5] border-t-green rounded-full animate-spin mr-2.5" />
        Loading campaign...
      </div>
    );
  }

  return (
    <EmailComposer mode="edit" campaign={campaign} listings={listings} listingsLoading={listingsLoading} />
  );
}
