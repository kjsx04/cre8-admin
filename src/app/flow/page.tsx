"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import DealCard from "@/components/flow/DealCard";
import DealDetail from "@/components/flow/DealDetail";
import DealForm from "@/components/flow/DealForm";
import DealBoard from "@/components/flow/DealBoard";
import { Deal, DealFormData, DealStatus, BrokerDefaults, DealDate, Broker } from "@/lib/flow/types";
import {
  formatCurrency,
  formatDate,
  calcMemberTakeHome,
  getMemberSplit,
  getCriticalDates,
  getNextCriticalDate,
  countdownText,
  checkStatusAdvancement,
  getDropHighlightConfig,
  KanbanColumn,
} from "@/lib/flow/utils";
import { graphScopes } from "@/lib/msal-config";
import { getSiteId, getDriveId, createDealFolder, uploadDealFile as uploadDealFileToSP } from "@/lib/graph";

// Tab options for filtering deals
const TABS: { label: string; statuses: DealStatus[] }[] = [
  { label: "Active", statuses: ["active", "due_diligence", "closing"] },
  { label: "Closed", statuses: ["closed"] },
  { label: "Cancelled", statuses: ["cancelled"] },
];

// Map target kanban column to the status that should be set on the deal
const COLUMN_TO_STATUS: Record<KanbanColumn, DealStatus> = {
  pre_escrow: "active",
  due_diligence: "due_diligence",
  closing: "closing",
};

export default function FlowPage() {
  const { instance, accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  const [deals, setDeals] = useState<Deal[]>([]);
  const [brokerDefaults, setBrokerDefaults] = useState<BrokerDefaults | null>(null);
  const [brokerId, setBrokerId] = useState<string>("");          // logged-in broker's UUID
  const [allBrokers, setAllBrokers] = useState<Pick<Broker, "id" | "name" | "email">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Editable forecast day windows (default 30/60/90) ──
  const [forecastDays, setForecastDays] = useState([30, 60, 90]);

  // ── View toggle: board (default) vs list — persisted in localStorage ──
  const [viewMode, setViewMode] = useState<"board" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("flow_view_mode") as "board" | "list") || "board";
    }
    return "board";
  });

  // ── Kanban drag-drop state ──
  // When a deal is dropped on a new column, we optimistically move it and open the edit form
  const [dropEditDeal, setDropEditDeal] = useState<Deal | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<KanbanColumn | null>(null);

  // ── Auto-move notifications (deals that silently advanced) ──
  const [autoMoveNotices, setAutoMoveNotices] = useState<{ dealName: string; from: string; to: string }[]>([]);

  // ── Extension prompt modal state ──
  const [extensionPrompt, setExtensionPrompt] = useState<{
    deal: Deal;
    dateLabel: string;
    dateValue: string;
  } | null>(null);

  // Track whether auto-move has run for this data load
  const autoMoveRanRef = useRef(false);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem("flow_view_mode", viewMode);
  }, [viewMode]);

  // Fetch deals + broker defaults from API
  const fetchDeals = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch("/api/flow/deals", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load deals");
      }
      const data = await res.json();
      // Shape: { deals, broker_defaults, broker_id, all_brokers }
      setDeals(data.deals || []);
      setBrokerDefaults(data.broker_defaults || null);
      setBrokerId(data.broker_id || "");
      setAllBrokers(data.all_brokers || []);
      setError(null);
      // Reset auto-move flag so reconciliation runs on fresh data
      autoMoveRanRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  // ── SharePoint deal file upload (fire-and-forget after deal save) ──
  const uploadFileToSharePoint = useCallback(async (dealId: string, dealName: string, brokerName: string, file: File) => {
    try {
      const account = accounts[0];
      if (!account) return;
      const tokenResponse = await instance.acquireTokenSilent({ ...graphScopes, account });
      const accessToken = tokenResponse.accessToken;

      const siteId = await getSiteId(accessToken);
      const driveId = await getDriveId(accessToken, siteId);

      // Create deal folder (idempotent)
      const folderUrl = await createDealFolder(accessToken, driveId, brokerName, dealName);

      // Upload the file
      const buffer = await file.arrayBuffer();
      await uploadDealFileToSP(accessToken, driveId, brokerName, dealName, file.name, buffer, file.type || "application/octet-stream");

      // Save the SharePoint folder URL on the deal (if we got one)
      if (folderUrl) {
        await fetch(`/api/flow/deals/${dealId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sharepoint_folder_url: folderUrl }),
        });
      }

      console.log(`[Flow] File "${file.name}" uploaded to SharePoint for deal "${dealName}"`);
    } catch (err) {
      // Non-blocking — deal is already saved, file upload is best-effort
      console.error("[Flow] SharePoint upload failed:", err);
    }
  }, [accounts, instance]);

  // ── Auto-move reconciliation — runs once after deals load ──
  useEffect(() => {
    if (loading || autoMoveRanRef.current || deals.length === 0) return;
    autoMoveRanRef.current = true;

    const runAutoMoves = async () => {
      const notices: { dealName: string; from: string; to: string }[] = [];
      const extensionPrompts: { deal: Deal; dateLabel: string; dateValue: string }[] = [];

      // Check each active deal for status advancement
      const activeDeals = deals.filter((d) => ["active", "due_diligence"].includes(d.status));

      for (const deal of activeDeals) {
        const result = checkStatusAdvancement(deal);
        if (!result) continue;

        if (result.action === "advance") {
          // Silent auto-advance — fire PATCH and collect notice
          try {
            await fetch(`/api/flow/deals/${deal.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: result.newStatus }),
            });
            const statusLabels: Record<string, string> = {
              active: "Pre-Escrow",
              due_diligence: "Due Diligence",
              closing: "Closing",
            };
            notices.push({
              dealName: deal.deal_name,
              from: statusLabels[deal.status] || deal.status,
              to: statusLabels[result.newStatus] || result.newStatus,
            });
          } catch (e) {
            console.error(`Auto-move failed for ${deal.deal_name}:`, e);
          }
        } else if (result.action === "prompt_extension") {
          // Extension date reached — queue prompt (don't auto-move)
          extensionPrompts.push({
            deal,
            dateLabel: result.datePassed.label,
            dateValue: result.datePassed.date,
          });
        }
      }

      // Show notices for silent moves
      if (notices.length > 0) {
        setAutoMoveNotices(notices);
        // Auto-dismiss after 6 seconds
        setTimeout(() => setAutoMoveNotices([]), 6000);
      }

      // Show first extension prompt (one at a time)
      if (extensionPrompts.length > 0) {
        setExtensionPrompt(extensionPrompts[0]);
      }

      // Re-fetch to get updated statuses
      if (notices.length > 0) {
        await fetchDeals();
      }
    };

    runAutoMoves();
  }, [loading, deals, fetchDeals]);

  // Get the logged-in broker's display name for SharePoint folder naming
  const getBrokerName = useCallback(() => {
    const broker = allBrokers.find((b) => b.id === brokerId);
    return broker?.name || accounts[0]?.name || "Unknown";
  }, [allBrokers, brokerId, accounts]);

  // Create a new deal (includes deal_dates as a separate array)
  const handleCreate = async (data: DealFormData, dealDates?: DealDate[], pendingFile?: File) => {
    setSaving(true);
    try {
      const res = await fetch("/api/flow/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          ...data,
          deal_dates: dealDates || [],
        }),
      });
      if (!res.ok) throw new Error("Failed to create deal");
      const createdDeal = await res.json();
      setShowNewForm(false);

      // Fire-and-forget SharePoint upload if a file was dropped
      if (pendingFile && createdDeal.id) {
        uploadFileToSharePoint(createdDeal.id, data.deal_name, getBrokerName(), pendingFile);
      }

      await fetchDeals();
    } catch (e) {
      console.error("Create failed:", e);
    } finally {
      setSaving(false);
    }
  };

  // Update a deal (from DealDetail — edit, close, cancel, notes)
  const handleUpdate = async (id: string, data: Partial<Deal> | DealFormData, dealDates?: DealDate[], pendingFile?: File) => {
    try {
      const payload: Record<string, unknown> = { ...data };
      if (dealDates !== undefined) {
        payload.deal_dates = dealDates;
      }
      const res = await fetch(`/api/flow/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update deal");

      // Fire-and-forget SharePoint upload if a file was dropped
      const dealName = (data as DealFormData).deal_name || selectedDeal?.deal_name || "Deal";
      if (pendingFile) {
        uploadFileToSharePoint(id, dealName, getBrokerName(), pendingFile);
      }

      await fetchDeals();
      // Refresh the selected deal if it's the one we updated
      if (selectedDeal?.id === id) {
        const updated = await res.json();
        setSelectedDeal(updated);
      }
    } catch (e) {
      console.error("Update failed:", e);
    }
  };

  // ── Kanban drag-drop handler ──
  const handleBoardDrop = (deal: Deal, targetColumn: KanbanColumn) => {
    // Optimistically update the deal's status in local state
    const newStatus = COLUMN_TO_STATUS[targetColumn];
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, status: newStatus } : d))
    );
    // Open the edit form with highlight config for the target column
    setDropEditDeal({ ...deal, status: newStatus });
    setDropTargetColumn(targetColumn);
  };

  // Save from the drop-triggered edit form — persist status + field changes
  const handleDropSave = async (data: DealFormData, dealDates?: DealDate[], pendingFile?: File) => {
    if (!dropEditDeal) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...data,
        status: dropEditDeal.status, // include the new status from the drop
      };
      if (dealDates !== undefined) {
        payload.deal_dates = dealDates;
      }
      const res = await fetch(`/api/flow/deals/${dropEditDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update deal");

      // Fire-and-forget SharePoint upload if a file was dropped
      if (pendingFile) {
        uploadFileToSharePoint(dropEditDeal.id, data.deal_name, getBrokerName(), pendingFile);
      }

      setDropEditDeal(null);
      setDropTargetColumn(null);
      await fetchDeals();
    } catch (e) {
      console.error("Drop save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  // Cancel the drop — revert optimistic move by re-fetching
  const handleDropCancel = async () => {
    setDropEditDeal(null);
    setDropTargetColumn(null);
    await fetchDeals();
  };

  // ── Extension prompt handlers ──

  // "Yes — Extension Filed" → stay in DD, open edit form to update dates
  const handleExtensionFiled = () => {
    if (!extensionPrompt) return;
    const deal = extensionPrompt.deal;
    setExtensionPrompt(null);
    // Open edit form targeting the dates section so user can update extension dates
    setDropEditDeal(deal);
    setDropTargetColumn("due_diligence");
  };

  // "No — Move to Closing" → auto-move to closing
  const handleExtensionDecline = async () => {
    if (!extensionPrompt) return;
    const deal = extensionPrompt.deal;
    setExtensionPrompt(null);
    try {
      await fetch(`/api/flow/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closing" }),
      });
      await fetchDeals();
    } catch (e) {
      console.error("Extension decline failed:", e);
    }
  };

  // Filter deals by active tab
  const filteredDeals = deals.filter((d) => TABS[activeTab].statuses.includes(d.status));

  // Sort active deals by nearest critical date (most urgent first)
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    if (activeTab === 0) {
      // Active tab — sort by nearest upcoming date
      const nextA = getNextCriticalDate(a);
      const nextB = getNextCriticalDate(b);
      if (!nextA && !nextB) return 0;
      if (!nextA) return 1;
      if (!nextB) return -1;
      return nextA.daysAway - nextB.daysAway;
    }
    // Closed/Cancelled — newest first (by updated_at)
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Summary stats (active deals only) — uses member-specific take-home for logged-in broker
  const activeDeals = deals.filter((d) => ["active", "due_diligence", "closing"].includes(d.status));
  const totalPipeline = activeDeals.reduce((sum, d) => sum + (d.price || 0), 0);
  const totalTakeHome = activeDeals.reduce((sum, d) => {
    const memberSplit = getMemberSplit(d.deal_members, brokerId);
    return sum + calcMemberTakeHome(d.price, d.commission_rate, d.broker_split, d.additional_splits || [], memberSplit);
  }, 0);

  // Get estimated close date for a deal — last (latest) critical date in the timeline
  const getEstimatedCloseDate = (deal: Deal): Date | null => {
    const dates = getCriticalDates(deal);
    if (dates.length === 0) return null;
    // The last date in the sorted timeline is the close date
    return dates[dates.length - 1].date;
  };

  // Calculate forecast take-home: sum take-home for deals closing within N days from today
  const calcForecastTakeHome = (days: number): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + days);

    return activeDeals.reduce((sum, deal) => {
      const closeDate = getEstimatedCloseDate(deal);
      if (!closeDate) return sum; // no dates = skip
      if (closeDate > cutoff) return sum; // closing after the window
      const memberSplit = getMemberSplit(deal.deal_members, brokerId);
      return sum + calcMemberTakeHome(deal.price, deal.commission_rate, deal.broker_split, deal.additional_splits || [], memberSplit);
    }, 0);
  };

  // Next urgent date across all active deals
  const urgentDate = activeDeals
    .map((d) => ({ deal: d, next: getNextCriticalDate(d) }))
    .filter((x) => x.next && !x.next.isPast)
    .sort((a, b) => a.next!.daysAway - b.next!.daysAway)[0];

  // Get drop highlight config for the edit form opened after a drag-drop
  const dropHighlight = dropTargetColumn ? getDropHighlightConfig(dropTargetColumn) : null;

  return (
    <div>
      {/* ── Summary header zone ── */}
      <div className="bg-white border-b border-[#E0E0E0] px-6 pt-6 pb-6">
        <div className="max-w-6xl mx-auto">
          {/* Summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1.5fr] gap-4">
            <SummaryCard label="Active Deals" value={String(activeDeals.length)} />
            <SummaryCard label="Pipeline Value" value={formatCurrency(totalPipeline)} />
            <SummaryCard label="Total Take-Home" value={formatCurrency(totalTakeHome)} accent />
            {/* Forecast card — 3 sub-columns with editable day windows */}
            <div className="bg-white border border-[#E0E0E0] rounded-card p-4">
              <p className="text-xs uppercase tracking-wide text-[rgba(0,0,0,0.45)] mb-2">Take-Home Forecast</p>
              <div className="flex">
                {forecastDays.map((days, i) => (
                  <div key={i} className={`flex-1 text-center ${i > 0 ? "border-l border-[#E0E0E0] pl-3" : ""} ${i < forecastDays.length - 1 ? "pr-3" : ""}`}>
                    <p className="font-bebas text-2xl text-green">{formatCurrency(calcForecastTakeHome(days))}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={days}
                        onChange={(e) => {
                          const val = parseInt(e.target.value.replace(/\D/g, "")) || 0;
                          setForecastDays((prev) => prev.map((d, j) => (j === i ? val : d)));
                        }}
                        className="w-[3ch] text-xs text-center text-[rgba(0,0,0,0.45)] border-b border-transparent bg-transparent
                                   hover:border-[#E0E0E0] focus:outline-none focus:border-green focus:text-[#1A1A1A]
                                   [appearance:textfield]"
                      />
                      <span className="text-xs text-[rgba(0,0,0,0.35)]">days</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Light content area ── */}
      <div className="px-6 py-6 max-w-6xl mx-auto">

      {/* Auto-move notification bar */}
      {autoMoveNotices.length > 0 && (
        <div className="mb-4 p-3 rounded-card border border-blue-200 bg-blue-50 text-sm text-blue-800">
          <div className="flex items-center gap-2 mb-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span className="font-medium">Deals auto-updated based on dates:</span>
          </div>
          <ul className="ml-6 space-y-0.5">
            {autoMoveNotices.map((n, i) => (
              <li key={i} className="text-xs">
                <strong>{n.dealName}</strong> moved from {n.from} to {n.to}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Urgent date alert */}
      {urgentDate && urgentDate.next && urgentDate.next.urgency !== "green" && urgentDate.next.urgency !== "gray" && (
        <div className={`mb-4 p-3 rounded-card border text-sm flex items-center gap-2
          ${urgentDate.next.urgency === "red"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-amber-50 border-amber-200 text-amber-700"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            <strong>{urgentDate.deal.deal_name}</strong> — {urgentDate.next.label} in {countdownText(urgentDate.next.daysAway)}
          </span>
        </div>
      )}

      {/* Tab bar + View toggle + New Deal button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map((tab, i) => {
              const count = deals.filter((d) => tab.statuses.includes(d.status)).length;
              return (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(i)}
                  className={`px-4 py-2 text-sm font-medium rounded-btn transition-colors duration-200
                    ${activeTab === i
                      ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                      : "text-medium-gray hover:text-charcoal hover:bg-light-gray border border-transparent"}`}
                >
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>

          {/* View toggle — only visible on Active tab */}
          {activeTab === 0 && (
            <div className="flex border border-border-light rounded-btn overflow-hidden">
              {/* Board view icon */}
              <button
                onClick={() => setViewMode("board")}
                className={`p-1.5 transition-colors duration-200 ${
                  viewMode === "board"
                    ? "bg-charcoal text-white"
                    : "text-medium-gray hover:text-charcoal bg-white"
                }`}
                title="Board view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="5" height="18" rx="1" />
                  <rect x="10" y="3" width="5" height="12" rx="1" />
                  <rect x="17" y="3" width="5" height="15" rx="1" />
                </svg>
              </button>
              {/* List view icon */}
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors duration-200 ${
                  viewMode === "list"
                    ? "bg-charcoal text-white"
                    : "text-medium-gray hover:text-charcoal bg-white"
                }`}
                title="List view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="4" rx="1" />
                  <rect x="3" y="10" width="18" height="4" rx="1" />
                  <rect x="3" y="17" width="18" height="4" rx="1" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowNewForm(true)}
          className="px-4 py-2 text-sm font-semibold bg-green text-black uppercase tracking-wide rounded-btn
                     hover:bg-green/90 transition-colors duration-200 flex items-center gap-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Deal
        </button>
      </div>

      {/* Deal content area */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-red-600 text-sm mb-2">{error}</p>
          <button onClick={fetchDeals} className="text-sm text-green hover:underline">Retry</button>
        </div>
      ) : activeTab === 0 && viewMode === "board" ? (
        /* ── Kanban Board View (Active tab only) ── */
        activeDeals.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-gray text-sm">No active deals. Create one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DealBoard
              deals={activeDeals}
              brokerId={brokerId}
              onCardClick={(deal) => setSelectedDeal(deal)}
              onDrop={handleBoardDrop}
            />
          </div>
        )
      ) : sortedDeals.length === 0 ? (
        /* ── Empty state (list view or non-active tabs) ── */
        <div className="text-center py-16">
          <p className="text-muted-gray text-sm">
            {activeTab === 0 ? "No active deals. Create one to get started." : `No ${TABS[activeTab].label.toLowerCase()} deals.`}
          </p>
        </div>
      ) : (
        /* ── Card Grid / List View ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedDeals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              brokerId={brokerId}
              onClick={() => setSelectedDeal(deal)}
            />
          ))}
        </div>
      )}

      {/* Deal detail slide-over */}
      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          brokerId={brokerId}
          allBrokers={allBrokers}
          onUpdate={handleUpdate}
          onClose={() => setSelectedDeal(null)}
        />
      )}

      {/* New deal form — pre-fill commission from broker defaults */}
      {showNewForm && (
        <DealForm
          onSave={handleCreate}
          onCancel={() => setShowNewForm(false)}
          saving={saving}
          mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          brokerDefaults={brokerDefaults || undefined}
          userEmail={userEmail}
          brokerId={brokerId}
          allBrokers={allBrokers}
        />
      )}

      {/* Drop-triggered edit form — opens after dragging a deal to a new column */}
      {dropEditDeal && dropHighlight && (
        <DealForm
          deal={dropEditDeal}
          onSave={handleDropSave}
          onCancel={handleDropCancel}
          saving={saving}
          mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          brokerDefaults={brokerDefaults || undefined}
          userEmail={userEmail}
          brokerId={brokerId}
          allBrokers={allBrokers}
          initialHighlightFields={dropHighlight.fields}
          contextBanner={dropHighlight.banner}
        />
      )}

      {/* Extension prompt modal */}
      {extensionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" />
          <div className="relative bg-white rounded-card border border-border-light p-6 w-full max-w-md mx-4">
            <h3 className="font-bebas text-2xl tracking-wide text-charcoal mb-2">
              Extension Deadline Reached
            </h3>
            <p className="text-sm text-medium-gray mb-4">
              <strong>{extensionPrompt.deal.deal_name}</strong>: {extensionPrompt.dateLabel} on {formatDate(extensionPrompt.dateValue)}
            </p>
            <p className="text-sm text-charcoal mb-6">
              Has an extension been filed for this deal?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleExtensionDecline}
                className="px-4 py-2 text-sm font-medium text-medium-gray border border-border-light rounded-btn
                           hover:border-border-medium transition-colors duration-200"
              >
                No — Move to Closing
              </button>
              <button
                onClick={handleExtensionFiled}
                className="px-4 py-2 text-sm font-semibold bg-green text-black uppercase tracking-wide rounded-btn
                           hover:bg-green/90 transition-colors duration-200"
              >
                Yes — Extension Filed
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// Small summary stat card
function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-card p-4">
      <p className="text-xs uppercase tracking-wide text-[rgba(0,0,0,0.45)] mb-1">{label}</p>
      <p className={`font-bebas text-2xl ${accent ? "text-green" : "text-[#1A1A1A]"}`}>{value}</p>
    </div>
  );
}
