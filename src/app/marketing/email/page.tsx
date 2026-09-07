"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { Campaign, CampaignFormData, CampaignStatus } from "@/lib/email/types";

import EmailCalendar from "@/components/email/EmailCalendar";
import CampaignCard from "@/components/email/CampaignCard";
import CampaignDetail from "@/components/email/CampaignDetail";

// Status tabs for filtering the campaign list
const STATUS_TABS: { label: string; statuses: CampaignStatus[] }[] = [
  { label: "All", statuses: [] },
  { label: "Scheduled", statuses: ["scheduled", "active"] },
  { label: "Drafts", statuses: ["draft"] },
  { label: "Completed", statuses: ["completed", "cancelled", "paused"] },
];

export default function EmailPage() {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const router = useRouter();

  // Data state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState(0);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  // Fetch campaigns from API
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/email/campaigns");
      if (!res.ok) throw new Error("Failed to load campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Update campaign (partial PATCH — used for inline edits, not the full form)
  const handleUpdate = async (id: string, data: Partial<CampaignFormData>) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update campaign");
      await fetchCampaigns();

      if (selectedCampaign?.id === id) {
        const updated = await res.json();
        setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  // Delete campaign
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      setSelectedCampaign(null);
      await fetchCampaigns();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Pause campaign
  const handlePause = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/pause`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Failed to pause campaign");
      await fetchCampaigns();
      if (selectedCampaign?.id === id) {
        const updated = await res.json();
        setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error("Pause failed:", err);
    }
  };

  // Resume campaign
  const handleResume = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/resume`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Failed to resume campaign");
      await fetchCampaigns();
      if (selectedCampaign?.id === id) {
        const updated = await res.json();
        setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error("Resume failed:", err);
    }
  };

  // Calendar event click → open detail
  const handleEventClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
  };

  // Filter campaigns by active tab
  const filteredCampaigns = STATUS_TABS[activeTab].statuses.length === 0
    ? campaigns
    : campaigns.filter((c) => STATUS_TABS[activeTab].statuses.includes(c.status));

  // Summary counts
  const scheduledCount = campaigns.filter((c) => c.status === "scheduled" || c.status === "active").length;
  const draftCount = campaigns.filter((c) => c.status === "draft").length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bebas text-3xl tracking-wide text-charcoal">
            Email Campaigns
          </h1>
          <p className="text-sm text-muted-gray mt-0.5">
            {scheduledCount} scheduled &middot; {draftCount} draft{draftCount !== 1 ? "s" : ""} &middot; {campaigns.length} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex border border-border-light rounded-btn overflow-hidden">
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${viewMode === "calendar" ? "bg-charcoal text-white" : "text-muted-gray hover:text-charcoal bg-white"}`}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${viewMode === "list" ? "bg-charcoal text-white" : "text-muted-gray hover:text-charcoal bg-white"}`}
            >
              List
            </button>
          </div>

          {/* New campaign button */}
          <button
            onClick={() => router.push("/marketing/email/new")}
            className="px-4 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition"
          >
            + New Campaign
          </button>
        </div>
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <p className="text-center text-red-500 py-8">{error}</p>
      )}

      {/* Main content */}
      {!loading && !error && (
        <>
          {viewMode === "calendar" ? (
            <EmailCalendar
              campaigns={filteredCampaigns}
              onEventClick={handleEventClick}
            />
          ) : (
            /* List view */
            <div>
              {/* Status tabs */}
              <div className="flex gap-1 mb-4">
                {STATUS_TABS.map((tab, i) => (
                  <button
                    key={tab.label}
                    onClick={() => setActiveTab(i)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-btn transition-colors duration-150
                      ${activeTab === i
                        ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                        : "text-muted-gray hover:text-charcoal hover:bg-light-gray border border-transparent"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Campaign cards */}
              {filteredCampaigns.length === 0 ? (
                <div className="text-center py-12 text-muted-gray text-sm">
                  No campaigns found. Create one to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCampaigns.map((c) => (
                    <CampaignCard
                      key={c.id}
                      campaign={c}
                      onClick={handleEventClick}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Campaign detail slide-over */}
      {selectedCampaign && (
        <CampaignDetail
          campaign={selectedCampaign}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onPause={handlePause}
          onResume={handleResume}
          onClose={() => setSelectedCampaign(null)}
        />
      )}

    </div>
  );
}
