"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { Campaign, CampaignFormData, CampaignStatus } from "@/lib/email/types";

import EmailCalendar from "@/components/email/EmailCalendar";
import CampaignCard from "@/components/email/CampaignCard";
import CampaignForm from "@/components/email/CampaignForm";
import CampaignDetail from "@/components/email/CampaignDetail";
import SchedulingAnimation from "@/components/email/SchedulingAnimation";
import { ListingItem } from "@/lib/admin-constants";

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

  // Data state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  // Toast scheduling animation state (lives at page level, independent of any modal)
  const [toastVisible, setToastVisible] = useState(false);
  const [toastApiDone, setToastApiDone] = useState(false);
  const [toastApiError, setToastApiError] = useState<string | null>(null);
  // Track whether the toast should use create (5-step) or edit (2-step) animation
  const [toastMode, setToastMode] = useState<"create" | "edit">("create");
  // Store last form data + context for retry
  const lastFormRef = useRef<{ data: CampaignFormData; editId?: string } | null>(null);

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

  // Fetch CRE8 listings for the campaign form dropdown
  const fetchListings = useCallback(async () => {
    try {
      const res = await fetch("/api/listings");
      if (res.ok) {
        const data = await res.json();
        setListings(data.items || []);
      }
    } catch {
      // Non-critical — form still works with manual input
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetchListings();
  }, [fetchCampaigns, fetchListings]);

  // Fire the API call for create or edit, updating toast state as it resolves
  const fireSchedulingApi = async (data: CampaignFormData, editId?: string) => {
    // Store for retry
    lastFormRef.current = { data, editId };

    // Show the toast and reset state
    setToastVisible(true);
    setToastApiDone(false);
    setToastApiError(null);

    try {
      if (editId) {
        // Edit existing campaign
        const res = await fetch(`/api/email/campaigns/${editId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": userEmail,
          },
          body: JSON.stringify({ ...data, auto_schedule: true }),
        });
        if (!res.ok) throw new Error("Failed to update campaign");

        // Refresh campaigns + selected campaign detail
        await fetchCampaigns();
        const refreshRes = await fetch(`/api/email/campaigns/${editId}`);
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json();
          setSelectedCampaign(refreshed);
        }
      } else {
        // Create new campaign
        const res = await fetch("/api/email/campaigns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": userEmail,
          },
          body: JSON.stringify({ ...data, auto_schedule: true }),
        });
        if (!res.ok) throw new Error("Failed to create campaign");
        await fetchCampaigns();
      }
      // Signal success to the toast
      setToastApiDone(true);
    } catch (err) {
      setToastApiError(err instanceof Error ? err.message : "Failed to schedule campaign");
    }
  };

  // Create new campaign — form calls this, then closes immediately
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCreate = async (data: CampaignFormData, _autoSchedule: boolean) => {
    setToastMode("create");
    fireSchedulingApi(data);
  };

  // Edit campaign via full form — called from CampaignDetail
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleEdit = async (data: CampaignFormData, _autoSchedule: boolean) => {
    if (!selectedCampaign) return;
    setToastMode("edit");
    fireSchedulingApi(data, selectedCampaign.id);
  };

  // Retry from the toast — re-fires stored form data
  const handleToastRetry = () => {
    if (!lastFormRef.current) return;
    const { data, editId } = lastFormRef.current;
    fireSchedulingApi(data, editId);
  };

  // Toast done — hide it
  const handleToastComplete = () => {
    setToastVisible(false);
  };

  // Update campaign (partial PATCH — used for inline edits, not the full form)
  const handleUpdate = async (id: string, data: Partial<CampaignFormData>) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch(`/api/email/campaigns/${id}`, { method: "DELETE" });
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
      const res = await fetch(`/api/email/campaigns/${id}/pause`, { method: "POST" });
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
      const res = await fetch(`/api/email/campaigns/${id}/resume`, { method: "POST" });
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
            onClick={() => setShowForm(true)}
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

      {/* Campaign form modal */}
      {showForm && (
        <CampaignForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
          listings={listings}
        />
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
          onEdit={handleEdit}
          listings={listings}
        />
      )}

      {/* Scheduling toast — fixed bottom-left, independent of modals */}
      {toastVisible && (
        <SchedulingAnimation
          apiDone={toastApiDone}
          apiError={toastApiError}
          onComplete={handleToastComplete}
          onRetry={handleToastRetry}
          mode={toastMode}
        />
      )}
    </div>
  );
}
