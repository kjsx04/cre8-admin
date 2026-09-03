"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import DealCard from "@/components/flow/DealCard";
import DealDetail from "@/components/flow/DealDetail";
import DealForm from "@/components/flow/DealForm";
import DealBoard from "@/components/flow/DealBoard";
import { Deal, DealFormData, DealStatus, BrokerDefaults, DealDate, Broker, LeaseStage } from "@/lib/flow/types";
import {
  formatCurrency,
  formatDate,
  calcTakeHome,
  getMemberSplit,
  getCriticalDates,
  getNextCriticalDate,
  countdownText,
  checkStatusAdvancement,
  getDropHighlightConfig,
  getKanbanColumn,
  getLeaseStage,
  KanbanColumn,
  KANBAN_COLUMNS,
  LEASE_KANBAN_COLUMNS,
} from "@/lib/flow/utils";
import { graphScopes } from "@/lib/msal-config";
import { getSiteId, getDriveId, createDealFolder, uploadDealFile as uploadDealFileToSP, uploadToFolder } from "@/lib/graph";

// Status tabs — scoped to whichever deal type (Sale/Lease) is toggled on
const ACTIVE_STATUSES: DealStatus[] = ["active", "due_diligence", "closing"];
const TABS: { label: string; statuses: DealStatus[] }[] = [
  { label: "Active", statuses: ACTIVE_STATUSES },
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

  // ── Deal type toggle: Sale vs Lease — everything below it is scoped to this type ──
  const [dealTypeTab, setDealTypeTab] = useState<"sale" | "lease">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("flow_deal_type_tab") as "sale" | "lease") || "sale";
    }
    return "sale";
  });
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  // New Deal flow: the type picker shows first, then the form opens with the chosen type
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [newDealType, setNewDealType] = useState<"sale" | "lease">("sale");
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
  // Lease board drop target — set when a lease drop needs the edit form (signed_lease confirms payment dates)
  const [dropTargetLeaseStage, setDropTargetLeaseStage] = useState<LeaseStage | null>(null);

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

  // Persist view mode + deal type toggle
  useEffect(() => {
    localStorage.setItem("flow_view_mode", viewMode);
  }, [viewMode]);
  useEffect(() => {
    localStorage.setItem("flow_deal_type_tab", dealTypeTab);
  }, [dealTypeTab]);

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
  // If the deal has a user-linked folder, upload there. Otherwise, auto-create /Deals/{Broker}/{Deal}/Documents/.
  const uploadFileToSharePoint = useCallback(async (dealId: string, dealName: string, brokerName: string, file: File, existingFolderUrl?: string) => {
    try {
      const account = accounts[0];
      if (!account) return;
      const tokenResponse = await instance.acquireTokenSilent({ ...graphScopes, account });
      const accessToken = tokenResponse.accessToken;

      const siteId = await getSiteId(accessToken);
      const driveId = await getDriveId(accessToken, siteId);
      const buffer = await file.arrayBuffer();

      if (existingFolderUrl) {
        // User-linked folder — upload directly to it
        try {
          const url = new URL(existingFolderUrl);
          const pathMatch = url.pathname.match(/\/Shared%20Documents\/(.+)/i) || url.pathname.match(/\/Shared Documents\/(.+)/i);
          if (pathMatch) {
            const folderPath = decodeURIComponent(pathMatch[1]).replace(/\/+$/, "");
            await uploadToFolder(accessToken, driveId, folderPath, file.name, buffer, file.type || "application/octet-stream");
            console.log(`[Flow] File "${file.name}" uploaded to linked folder for deal "${dealName}"`);
            return;
          }
        } catch (parseErr) {
          console.warn("[Flow] Failed to parse linked folder URL, falling back to auto-create:", parseErr);
        }
      }

      // No linked folder — auto-create deal folder structure
      const folderUrl = await createDealFolder(accessToken, driveId, brokerName, dealName);

      // Upload the file
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
      // Jump to the new deal's type + Active tab so it's immediately visible
      setDealTypeTab(data.deal_type === "lease" ? "lease" : "sale");
      setActiveTab(0);

      // Fire-and-forget SharePoint upload if a file was dropped
      if (pendingFile && createdDeal.id) {
        // Use user-linked folder if set, otherwise auto-create
        const linkedFolder = (data as unknown as Record<string, unknown>).sharepoint_folder_url as string | undefined;
        uploadFileToSharePoint(createdDeal.id, data.deal_name, getBrokerName(), pendingFile, linkedFolder || createdDeal.sharepoint_folder_url);
      }

      await fetchDeals();
    } catch (e) {
      console.error("Create failed:", e);
    } finally {
      setSaving(false);
    }
  };

  // Permanently delete a deal
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/flow/deals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete deal");
      setSelectedDeal(null);
      await fetchDeals();
    } catch (e) {
      console.error("Delete failed:", e);
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
        // Use existing folder URL from the deal or from the update payload
        const folderUrl = (data as Record<string, unknown>).sharepoint_folder_url as string | undefined
          || selectedDeal?.sharepoint_folder_url;
        uploadFileToSharePoint(id, dealName, getBrokerName(), pendingFile, folderUrl || undefined);
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

  // ── Kanban drag-drop handler (Sale board) ──
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

  // ── Lease board drag-drop handler ──
  // Most stage moves just save immediately. Dropping into Signed Lease opens the edit
  // form so the commission payment due dates get confirmed (1st half is often due at
  // lease execution, but not always — that's what the 30-day reminders guard against).
  const handleLeaseBoardDrop = async (deal: Deal, targetStage: LeaseStage) => {
    // Optimistically update the stage in local state
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, lease_stage: targetStage } : d))
    );

    if (targetStage === "signed_lease") {
      // Open the edit form highlighting the payment schedule before saving the stage
      setDropEditDeal({ ...deal, lease_stage: targetStage });
      setDropTargetLeaseStage(targetStage);
      return;
    }

    // Simple stage move — persist directly
    try {
      const res = await fetch(`/api/flow/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_stage: targetStage }),
      });
      if (!res.ok) throw new Error("Failed to update lease stage");
      await fetchDeals();
    } catch (e) {
      console.error("Lease stage move failed:", e);
      await fetchDeals(); // revert optimistic move
    }
  };

  // Save from the drop-triggered edit form — persist status/stage + field changes
  const handleDropSave = async (data: DealFormData, dealDates?: DealDate[], pendingFile?: File) => {
    if (!dropEditDeal) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...data };
      if (dropTargetLeaseStage) {
        payload.lease_stage = dropTargetLeaseStage; // lease drop — save the new stage
      } else {
        payload.status = dropEditDeal.status; // sale drop — save the new status
      }
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
        const folderUrl = (data as unknown as Record<string, unknown>).sharepoint_folder_url as string | undefined
          || dropEditDeal.sharepoint_folder_url;
        uploadFileToSharePoint(dropEditDeal.id, data.deal_name, getBrokerName(), pendingFile, folderUrl || undefined);
      }

      setDropEditDeal(null);
      setDropTargetColumn(null);
      setDropTargetLeaseStage(null);
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
    setDropTargetLeaseStage(null);
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

  // Filter deals by the deal type toggle + active status tab
  const filteredDeals = deals.filter(
    (d) => d.deal_type === dealTypeTab && TABS[activeTab].statuses.includes(d.status)
  );

  // The board shows on the Active tab
  const isBoardTab = activeTab === 0;

  // Sort active deals by nearest critical date (most urgent first)
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    if (isBoardTab) {
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

  // Get estimated close date for a deal — last (latest) critical date in the timeline
  const getEstimatedCloseDate = (deal: Deal): Date | null => {
    const dates = getCriticalDates(deal);
    if (dates.length === 0) return null;
    return dates[dates.length - 1].date;
  };

  // Summary stats (active deals only) — uses member-specific take-home for logged-in broker
  const activeDeals = deals.filter((d) => ["active", "due_diligence", "closing"].includes(d.status));
  const totalPipeline = activeDeals.reduce((sum, d) => sum + (d.price || 0), 0);
  // User's take-home across all active deals (price × rate × 70% × member split − additional splits)
  const pipelineCommission = activeDeals.reduce((sum, d) => {
    const memberSplit = getMemberSplit(d.deal_members, brokerId);
    return sum + calcTakeHome(d.price, d.commission_rate, memberSplit, d.additional_splits || []);
  }, 0);

  // ── Helper: calculate take-home for a single payment percentage of a deal ──
  const calcPaymentTakeHome = (deal: Deal, percent: number): number => {
    const memberSplit = getMemberSplit(deal.deal_members, brokerId);
    const fullTakeHome = calcTakeHome(deal.price, deal.commission_rate, memberSplit, deal.additional_splits || []);
    return fullTakeHome * (percent / 100);
  };

  // ── Helper: does this deal track money through its lease payment schedule? ──
  // Such deals are counted payment-by-payment (received/unreceived), never by close date —
  // this covers both closed lease deals and active ones moving through the Lease board.
  const usesLeasePayments = (d: Deal): boolean =>
    d.deal_type === "lease" && !!d.lease_payments && d.lease_payments.length > 0 && d.status !== "cancelled";

  // ── YTD take-home: money actually landed in the current calendar year ──
  // Lease deals with payment schedules: sum received payments by received_date (any status).
  // Sales (or leases without schedules): full take-home if closed this year.
  const currentYear = new Date().getFullYear();
  const ytdTakeHome = deals.reduce((sum, d) => {
    if (usesLeasePayments(d)) {
      // Sum received payments where received_date is in the current year
      return sum + (d.lease_payments || [])
        .filter((lp) => lp.received && lp.received_date && new Date(lp.received_date).getFullYear() === currentYear)
        .reduce((pSum, lp) => pSum + calcPaymentTakeHome(d, lp.percent), 0);
    }
    // Sale deal or lease without payment schedule — full take-home if closed this year
    if (d.status !== "closed" || !d.actual_close_date) return sum;
    if (new Date(d.actual_close_date).getFullYear() !== currentYear) return sum;
    const memberSplit = getMemberSplit(d.deal_members, brokerId);
    return sum + calcTakeHome(d.price, d.commission_rate, memberSplit, d.additional_splits || []);
  }, 0);

  // ── Projected: YTD + unreceived lease payments before Dec 31 + active deals closing before year end ──
  const yearEnd = new Date(currentYear, 11, 31); // Dec 31

  // Unreceived lease payments due before Dec 31 (any deal with a payment schedule)
  const unrecevedLeasePaymentsThisYear = deals
    .filter(usesLeasePayments)
    .reduce((sum, d) => {
      return sum + (d.lease_payments || [])
        .filter((lp) => !lp.received && lp.payment_date && new Date(lp.payment_date + "T00:00:00") <= yearEnd
          && new Date(lp.payment_date + "T00:00:00").getFullYear() === currentYear)
        .reduce((pSum, lp) => pSum + calcPaymentTakeHome(d, lp.percent), 0);
    }, 0);

  // Active deals counted by estimated close date — skip lease deals with payment
  // schedules (they're already counted payment-by-payment above)
  const projectedTakeHome = ytdTakeHome + unrecevedLeasePaymentsThisYear + activeDeals.reduce((sum, deal) => {
    if (usesLeasePayments(deal)) return sum;
    const closeDate = getEstimatedCloseDate(deal);
    if (!closeDate || closeDate > yearEnd) return sum;
    const memberSplit = getMemberSplit(deal.deal_members, brokerId);
    return sum + calcTakeHome(deal.price, deal.commission_rate, memberSplit, deal.additional_splits || []);
  }, 0);

  // Calculate forecast take-home: sum take-home for deals closing within N days from today
  // Also includes unreceived lease payments due within the window
  const calcForecastTakeHome = (days: number): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + days);

    // Active deals closing within the window (lease deals with schedules counted below instead)
    const activeForecast = activeDeals.reduce((sum, deal) => {
      if (usesLeasePayments(deal)) return sum;
      const closeDate = getEstimatedCloseDate(deal);
      if (!closeDate) return sum;
      if (closeDate > cutoff) return sum;
      const memberSplit = getMemberSplit(deal.deal_members, brokerId);
      return sum + calcTakeHome(deal.price, deal.commission_rate, memberSplit, deal.additional_splits || []);
    }, 0);

    // Unreceived lease payments due within the window (any deal with a payment schedule)
    const leaseForecast = deals
      .filter(usesLeasePayments)
      .reduce((sum, d) => {
        return sum + (d.lease_payments || [])
          .filter((lp) => !lp.received && lp.payment_date && (() => {
            const payDate = new Date(lp.payment_date + "T00:00:00");
            return payDate >= today && payDate <= cutoff;
          })())
          .reduce((pSum, lp) => pSum + calcPaymentTakeHome(d, lp.percent), 0);
      }, 0);

    return activeForecast + leaseForecast;
  };

  // Next urgent date across all active deals
  const urgentDate = activeDeals
    .map((d) => ({ deal: d, next: getNextCriticalDate(d) }))
    .filter((x) => x.next && !x.next.isPast)
    .sort((a, b) => a.next!.daysAway - b.next!.daysAway)[0];

  // Get drop highlight config for the edit form opened after a drag-drop
  // Lease drops (Signed Lease) highlight the payment schedule instead of the sale date fields
  const dropHighlight = dropTargetLeaseStage
    ? {
        fields: ["lease_payments_section"],
        banner: "Lease signed — confirm the commission payment schedule and due dates",
      }
    : dropTargetColumn
    ? getDropHighlightConfig(dropTargetColumn)
    : null;

  return (
    <div>
      {/* ── Summary header zone ── */}
      <div className="bg-white border-b border-[#E0E0E0] px-6 pt-6 pb-6">
        <div className="w-full">
          {/* Summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1.5fr] gap-4">
            <SummaryCard label="Active Deals" value={String(activeDeals.length)} />
            <div className="bg-white border border-[#E0E0E0] rounded-card p-4">
              <p className="text-xs uppercase tracking-wide text-[rgba(0,0,0,0.45)] mb-1">Pipeline Value</p>
              <p className="font-bebas text-2xl text-[#1A1A1A]">{formatCurrency(totalPipeline)}</p>
              <p className="text-xs text-[rgba(0,0,0,0.40)] mt-1">{formatCurrency(pipelineCommission)} commission</p>
            </div>
            {/* YTD + Projected take-home card */}
            <div className="bg-white border border-[#E0E0E0] rounded-card p-4">
              <div className="flex">
                <div className="flex-1 pr-3">
                  <p className="text-xs uppercase tracking-wide text-[rgba(0,0,0,0.45)] mb-1">YTD Take-Home</p>
                  <p className="font-bebas text-2xl text-green">{formatCurrency(ytdTakeHome)}</p>
                </div>
                <div className="flex-1 border-l border-[#E0E0E0] pl-3">
                  <p className="text-xs uppercase tracking-wide text-[rgba(0,0,0,0.45)] mb-1">Projected {currentYear}</p>
                  <p className="font-bebas text-2xl text-green">{formatCurrency(projectedTakeHome)}</p>
                </div>
              </div>
            </div>
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

      {/* ── Light content area — full width so the 5-column lease board has room to breathe ── */}
      <div className="px-6 py-6 w-full">

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
          {/* Sale / Lease toggle — everything on the page below is scoped to this type */}
          <div className="flex border border-border-light rounded-btn overflow-hidden">
            {(["sale", "lease"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setDealTypeTab(type)}
                className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors duration-200 ${
                  dealTypeTab === type
                    ? "bg-charcoal text-white"
                    : "bg-white text-medium-gray hover:text-charcoal"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Status tabs — counts reflect only the selected deal type */}
          <div className="flex gap-1">
            {TABS.map((tab, i) => {
              const count = deals.filter(
                (d) => d.deal_type === dealTypeTab && tab.statuses.includes(d.status)
              ).length;
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

          {/* View toggle — only visible on the Sale/Lease board tabs */}
          {isBoardTab && (
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
          onClick={() => setShowTypePicker(true)}
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
      ) : isBoardTab && viewMode === "board" ? (
        /* ── Kanban Board View (Active tab — Sale or Lease board per the toggle) ── */
        filteredDeals.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-gray text-sm">
              No active {dealTypeTab} deals. Create one to get started.
            </p>
          </div>
        ) : dealTypeTab === "lease" ? (
          /* Lease board — 5 stage columns driven by lease_stage */
          <div className="overflow-x-auto">
            <DealBoard
              deals={filteredDeals}
              brokerId={brokerId}
              columns={LEASE_KANBAN_COLUMNS}
              getColumn={getLeaseStage}
              onCardClick={(deal) => setSelectedDeal(deal)}
              onDrop={handleLeaseBoardDrop}
            />
          </div>
        ) : (
          /* Sale board — 3 status columns */
          <div className="overflow-x-auto">
            <DealBoard
              deals={filteredDeals}
              brokerId={brokerId}
              columns={KANBAN_COLUMNS}
              getColumn={getKanbanColumn}
              onCardClick={(deal) => setSelectedDeal(deal)}
              onDrop={handleBoardDrop}
            />
          </div>
        )
      ) : sortedDeals.length === 0 ? (
        /* ── Empty state (list view or non-active tabs) ── */
        <div className="text-center py-16">
          <p className="text-muted-gray text-sm">
            {isBoardTab
              ? `No active ${dealTypeTab} deals. Create one to get started.`
              : `No ${TABS[activeTab].label.toLowerCase()} ${dealTypeTab} deals.`}
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
          onDelete={handleDelete}
          onClose={() => setSelectedDeal(null)}
        />
      )}

      {/* New deal form — pre-fill commission from broker defaults */}
      {/* New Deal type picker — choose Sale or Lease before the form opens */}
      {showTypePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowTypePicker(false)} />
          <div className="relative bg-white rounded-card border border-border-light p-6 w-full max-w-md mx-4">
            <h3 className="font-bebas text-2xl tracking-wide text-charcoal mb-4 text-center">Deal Type</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setNewDealType("sale");
                  setShowTypePicker(false);
                  setShowNewForm(true);
                }}
                className="border border-border-light rounded-card py-6 text-center font-bebas text-xl tracking-wide text-charcoal
                           hover:border-green hover:bg-green/5 transition-colors duration-200"
              >
                Sale
              </button>
              <button
                onClick={() => {
                  setNewDealType("lease");
                  setShowTypePicker(false);
                  setShowNewForm(true);
                }}
                className="border border-border-light rounded-card py-6 text-center font-bebas text-xl tracking-wide text-charcoal
                           hover:border-green hover:bg-green/5 transition-colors duration-200"
              >
                Lease
              </button>
            </div>
          </div>
        </div>
      )}

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
          defaultDealType={newDealType}
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
