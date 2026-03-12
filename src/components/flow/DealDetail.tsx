"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { Deal, DealFormData, DealDate, Broker, DealDiffItem, StageSuggestion, ExtractedDealData, DealStatus } from "@/lib/flow/types";
import { formatCurrency, formatDate, STATUS_LABELS, STATUS_COLORS, buildDealDiff, suggestStageMove } from "@/lib/flow/utils";
import { graphScopes } from "@/lib/msal-config";
import { getSiteId, getDriveId, listFolderFiles, SharePointFile } from "@/lib/graph";
import TimelineBar from "./TimelineBar";
import CommissionCalc from "./CommissionCalc";
import DealForm from "./DealForm";
import ConfirmModal from "./ConfirmModal";
import FileDropZone from "./FileDropZone";
import DealUpdateReview from "./DealUpdateReview";

interface DealDetailProps {
  deal: Deal;
  brokerId?: string;
  allBrokers?: Pick<Broker, "id" | "name" | "email">[];
  onUpdate: (id: string, data: Partial<Deal> | DealFormData, dealDates?: DealDate[], pendingFile?: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

// File type icon helper
function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
        <rect x="4" y="2" width="16" height="20" rx="2" stroke="#DC2626" strokeWidth="1.5" />
        <text x="12" y="15" textAnchor="middle" fill="#DC2626" fontSize="6" fontWeight="bold">PDF</text>
      </svg>
    );
  }
  if (ext === "docx" || ext === "doc") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
        <rect x="4" y="2" width="16" height="20" rx="2" stroke="#2563EB" strokeWidth="1.5" />
        <text x="12" y="15" textAnchor="middle" fill="#2563EB" fontSize="5" fontWeight="bold">DOC</text>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Lease Payment Schedule (received toggles for closed deals, read-only for active) ──
function LeasePaymentSchedule({
  deal,
  onToggleReceived,
}: {
  deal: Deal;
  onToggleReceived?: (paymentId: string, received: boolean) => void;
}) {
  // Calculate member's take-home for display
  const totalCommission = (deal.price || 0) * (deal.commission_rate || 0);

  return (
    <div className="bg-white border border-border-light rounded-card p-4">
      <h3 className="font-dm font-semibold text-sm text-charcoal mb-3">Payment Schedule</h3>
      <div className="space-y-2">
        {(deal.lease_payments || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((lp, i) => {
            const amount = totalCommission * (lp.percent / 100);
            return (
              <div
                key={lp.id}
                className={`flex items-center justify-between py-2 px-3 rounded-btn border transition-colors ${
                  lp.received
                    ? "border-green/30 bg-green/5"
                    : "border-border-light"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-medium-gray">#{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-charcoal font-medium">
                      {lp.percent}% — {formatCurrency(amount)}
                    </p>
                    <p className="text-xs text-muted-gray">
                      {lp.payment_date ? formatDate(lp.payment_date) : (
                        lp.offset_days !== null ? (
                          lp.offset_days === 0
                            ? "At close"
                            : `${lp.offset_days} days after ${lp.offset_from === "previous" ? "previous" : "close"}`
                        ) : "Date TBD"
                      )}
                      {lp.received && lp.received_date && (
                        <span className="ml-1 text-green">· Received {formatDate(lp.received_date)}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Received toggle button — only for closed deals */}
                {onToggleReceived ? (
                  <button
                    onClick={() => onToggleReceived(lp.id, !lp.received)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-btn border transition-colors duration-200 ${
                      lp.received
                        ? "bg-green/10 border-green text-green"
                        : "border-border-light text-medium-gray hover:border-green hover:text-green"
                    }`}
                  >
                    {lp.received ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Received
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                        Pending
                      </>
                    )}
                  </button>
                ) : (
                  /* Read-only label for active deals */
                  <span className="text-xs text-muted-gray italic">
                    {lp.offset_days !== null ? (
                      lp.offset_days === 0 ? "At close" : `${lp.offset_days}d after ${lp.offset_from === "previous" ? "prev" : "close"}`
                    ) : "Scheduled"}
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default function DealDetail({ deal, brokerId, allBrokers, onUpdate, onDelete, onClose }: DealDetailProps) {
  const { instance, accounts } = useMsal();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [closeDate, setCloseDate] = useState("");
  // Commission rate is stored as decimal (0.06) — display as percentage (6)
  const [closeCommission, setCloseCommission] = useState(String((deal.commission_rate || 0) * 100));
  const [commissionVerified, setCommissionVerified] = useState(false);
  const [notes, setNotes] = useState(deal.notes || "");
  const [notesSaving, setNotesSaving] = useState(false);

  // ── Document update review state ──
  const [showUpdateReview, setShowUpdateReview] = useState(false);
  const [diffItems, setDiffItems] = useState<DealDiffItem[]>([]);
  const [stageSuggestion, setStageSuggestion] = useState<StageSuggestion | null>(null);
  const [updateFileName, setUpdateFileName] = useState("");
  const [updateDocType, setUpdateDocType] = useState("");
  const [updatePendingFile, setUpdatePendingFile] = useState<File | null>(null);
  const [approving, setApproving] = useState(false);

  // Documents state
  const [files, setFiles] = useState<SharePointFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Save edited deal (with deal_dates + optional file for SharePoint upload)
  const handleSave = async (data: DealFormData, dealDates?: DealDate[], pendingFile?: File) => {
    setSaving(true);
    await onUpdate(deal.id, data, dealDates, pendingFile);
    setSaving(false);
    setEditing(false);
    // Re-fetch files after editing (a new file may have been uploaded)
    if (pendingFile && deal.sharepoint_folder_url) {
      setTimeout(() => fetchFiles(), 3000); // slight delay for SharePoint to process
    }
  };

  // Close deal — includes verified/edited commission rate + resolved lease payment dates
  const handleCloseDeal = async () => {
    const finalRatePct = parseFloat(closeCommission); // percentage value (e.g. 6)
    const actualClose = closeDate || new Date().toISOString().substring(0, 10);
    const payload: Record<string, unknown> = {
      status: "closed",
      actual_close_date: actualClose,
    };
    // Include commission_rate if it changed (compare as percentages)
    const currentPct = (deal.commission_rate || 0) * 100;
    if (!isNaN(finalRatePct) && Math.abs(finalRatePct - currentPct) > 0.001) {
      // API expects percentage — it divides by 100 on save
      payload.commission_rate = finalRatePct;
    }

    // For lease deals: resolve offset-based payment dates to absolute dates using the close date
    if (deal.deal_type === "lease" && deal.lease_payments && deal.lease_payments.length > 0) {
      const closeDateObj = new Date(actualClose + "T00:00:00");
      const resolvedPayments: Record<string, unknown>[] = [];
      let previousDate = closeDateObj;

      const sorted = [...deal.lease_payments].sort((a, b) => a.sort_order - b.sort_order);
      for (const lp of sorted) {
        let resolvedDate = lp.payment_date;

        if (!resolvedDate && lp.offset_days !== null) {
          // Resolve offset to an absolute date
          const baseDate = lp.offset_from === "previous" ? previousDate : closeDateObj;
          const resolved = new Date(baseDate);
          resolved.setDate(resolved.getDate() + (lp.offset_days || 0));
          resolvedDate = resolved.toISOString().substring(0, 10);
        }

        resolvedPayments.push({
          sort_order: lp.sort_order,
          percent: lp.percent,
          payment_date: resolvedDate,
          offset_days: lp.offset_days,
          offset_from: lp.offset_from,
          received: lp.received || false,
          received_date: lp.received_date || null,
        });

        if (resolvedDate) {
          previousDate = new Date(resolvedDate + "T00:00:00");
        }
      }

      payload.lease_payments = resolvedPayments;
    }

    await onUpdate(deal.id, payload as Partial<Deal>);
    setShowCloseModal(false);
  };

  // Cancel deal
  const handleCancelDeal = async (reason?: string) => {
    await onUpdate(deal.id, {
      status: "cancelled",
      cancel_reason: reason || null,
    } as Partial<Deal>);
    setShowCancelModal(false);
  };

  // Permanently delete deal
  const handleDeleteDeal = async () => {
    await onDelete(deal.id);
    setShowDeleteModal(false);
  };

  // Auto-save notes on blur
  const handleNotesBlur = async () => {
    if (notes !== (deal.notes || "")) {
      setNotesSaving(true);
      await onUpdate(deal.id, { notes } as Partial<Deal>);
      setNotesSaving(false);
    }
  };

  // ── Toggle a lease payment as received/unreceived ──
  const handleToggleReceived = async (paymentId: string, received: boolean) => {
    await onUpdate(deal.id, {
      received_payments: [{ id: paymentId, received }],
    } as unknown as Partial<Deal>);
  };

  // ── Fetch files from the deal's SharePoint folder ──
  const fetchFiles = useCallback(async () => {
    if (!deal.sharepoint_folder_url) return;
    const account = accounts[0];
    if (!account) return;

    setFilesLoading(true);
    try {
      const tokenResponse = await instance.acquireTokenSilent({ ...graphScopes, account });
      const accessToken = tokenResponse.accessToken;
      const siteId = await getSiteId(accessToken);
      const driveId = await getDriveId(accessToken, siteId);

      const url = new URL(deal.sharepoint_folder_url);
      const pathMatch = url.pathname.match(/\/Shared%20Documents\/(.+)/i) || url.pathname.match(/\/Shared Documents\/(.+)/i);
      let folderPath = "";
      if (pathMatch) {
        folderPath = decodeURIComponent(pathMatch[1]).replace(/\/+$/, "") + "/Documents";
      }

      if (folderPath) {
        const result = await listFolderFiles(accessToken, driveId, folderPath);
        setFiles(result);
      }
    } catch (err) {
      console.error("[DealDetail] Failed to fetch files:", err);
    } finally {
      setFilesLoading(false);
    }
  }, [deal.sharepoint_folder_url, accounts, instance]);

  // Fetch files on mount if deal has a SharePoint folder
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ── Document update: handle extraction result from drop zone ──
  const handleUpdateExtracted = useCallback((extracted: ExtractedDealData) => {
    // Build diff between current deal and extracted data
    const diff = buildDealDiff(deal, extracted);

    if (diff.length === 0) {
      // No changes detected — brief message, don't enter review mode
      alert("No changes detected in this document.");
      return;
    }

    // Check for stage move suggestion
    const suggestion = suggestStageMove(deal, extracted);

    setDiffItems(diff);
    setStageSuggestion(suggestion);
    setUpdateDocType(extracted.document_type || "other");
    setShowUpdateReview(true);
  }, [deal]);

  // ── Document update: approve selected changes ──
  const handleApproveUpdate = useCallback(async (items: DealDiffItem[], newStatus?: DealStatus) => {
    setApproving(true);
    try {
      // Build PATCH payload from accepted items
      const payload: Record<string, unknown> = {};

      // Collect date changes separately — we need to merge with existing dates
      const dateChanges: { label: string; date?: string; offset_days?: number; offset_reference?: string }[] = [];
      const changedDateLabels = new Set<string>();

      for (const item of items) {
        if (!item.accepted) continue;

        // Use edited value if the user modified it, otherwise use raw proposed
        const value = item.edited && item.editedValue !== undefined ? item.editedValue : item.rawProposed;

        if (item.type === "date_new" || item.type === "date_changed") {
          // Collect date items for merge
          const dateData = item.rawProposed as { label: string; date?: string; offset_days?: number; offset_reference?: string };

          // If user edited, try to use edited value as the date
          if (item.edited && item.editedValue) {
            dateChanges.push({ ...dateData, date: item.editedValue });
          } else {
            dateChanges.push(dateData);
          }
          changedDateLabels.add(dateData.label.toLowerCase());
        } else {
          // Scalar field
          payload[item.field] = value;
        }
      }

      // If there are date changes, merge with existing deal_dates
      if (dateChanges.length > 0) {
        const existingDates = (deal.deal_dates || []).map((dd) => ({
          label: dd.label,
          date: dd.date,
          offset_days: dd.offset_days ?? undefined,
          offset_from: dd.offset_from ?? undefined,
          sort_order: dd.sort_order,
        }));

        // Keep unchanged existing dates, replace changed ones, add new ones
        const merged = existingDates
          .filter((dd) => !changedDateLabels.has(dd.label.toLowerCase()))
          .map((dd) => ({
            label: dd.label,
            date: dd.date,
            offset_days: dd.offset_days ?? null,
            offset_from: dd.offset_from ?? null,
            sort_order: dd.sort_order,
          }));

        // Add changed/new dates
        let nextOrder = merged.length > 0 ? Math.max(...merged.map((d) => d.sort_order)) + 1 : 1;
        for (const dc of dateChanges) {
          // Find existing sort_order if this was a changed date
          const existing = existingDates.find((dd) => dd.label.toLowerCase() === dc.label.toLowerCase());
          merged.push({
            label: dc.label,
            date: dc.date || "",
            offset_days: dc.offset_days ?? null,
            offset_from: dc.offset_reference ?? null,
            sort_order: existing?.sort_order ?? nextOrder++,
          });
        }

        payload.deal_dates = merged;
      }

      // Add status change if stage move was approved
      if (newStatus) {
        payload.status = newStatus;
      }

      // PATCH the deal
      await onUpdate(
        deal.id,
        payload as Partial<Deal>,
        payload.deal_dates as DealDate[] | undefined,
        updatePendingFile || undefined
      );

      // Clean up review state
      setShowUpdateReview(false);
      setDiffItems([]);
      setStageSuggestion(null);
      setUpdateFileName("");
      setUpdateDocType("");
      setUpdatePendingFile(null);

      // Re-fetch files if a file was uploaded
      if (updatePendingFile && deal.sharepoint_folder_url) {
        setTimeout(() => fetchFiles(), 3000);
      }
    } catch (err) {
      console.error("[DealDetail] Approve update failed:", err);
    } finally {
      setApproving(false);
    }
  }, [deal, onUpdate, updatePendingFile, fetchFiles]);

  // Cancel the update review — reset state
  const handleCancelUpdate = useCallback(() => {
    setShowUpdateReview(false);
    setDiffItems([]);
    setStageSuggestion(null);
    setUpdateFileName("");
    setUpdateDocType("");
    setUpdatePendingFile(null);
  }, []);

  const isActive = deal.status !== "closed" && deal.status !== "cancelled";

  return (
    <>
      {/* Slide-over panel */}
      <div className="fixed inset-0 z-40 flex justify-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/20" onClick={onClose} />

        {/* Panel */}
        <div className="relative bg-light-gray w-full max-w-lg overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-[#E0E0E0] px-6 py-5 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bebas text-2xl tracking-wide text-[#1A1A1A] truncate">
                  {deal.deal_name}
                </h2>
                {deal.property_address && (
                  <p className="text-sm text-[rgba(0,0,0,0.45)] truncate">{deal.property_address}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${STATUS_COLORS[deal.status]}`}>
                  {STATUS_LABELS[deal.status]}
                </span>
                <button
                  onClick={onClose}
                  className="text-muted-gray hover:text-charcoal transition-colors p-1"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            {isActive ? (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-xs font-medium border border-[#E0E0E0] text-[#1A1A1A] rounded-btn
                             hover:border-[#999] transition-colors duration-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    // Reset close modal state each time it opens
                    setCloseDate("");
                    setCloseCommission(String((deal.commission_rate || 0) * 100));
                    setCommissionVerified(false);
                    setShowCloseModal(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-green text-black uppercase tracking-wide rounded-btn
                             hover:bg-green/90 transition-colors duration-200"
                >
                  Close Deal
                </button>
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="px-3 py-1.5 text-xs font-medium border border-red-400/50 text-red-400 rounded-btn
                             hover:bg-red-400/10 transition-colors duration-200"
                >
                  Cancel Deal
                </button>
              </div>
            ) : deal.status === "closed" ? (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-xs font-medium border border-[#E0E0E0] text-[#1A1A1A] rounded-btn
                             hover:border-[#999] transition-colors duration-200"
                >
                  Edit
                </button>
              </div>
            ) : deal.status === "cancelled" ? (
              /* Delete only available for cancelled deals — intentional 2-step process */
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-3 py-1.5 text-xs font-medium border border-red-400/50 text-red-400 rounded-btn
                             hover:bg-red-400/10 transition-colors duration-200"
                  title="Permanently delete this deal"
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-4">
            {/* Document drop zone — only for active deals, hidden during review */}
            {isActive && !showUpdateReview && (
              <FileDropZone
                compact
                onExtracted={handleUpdateExtracted}
                onFileReady={(file) => {
                  setUpdatePendingFile(file);
                  setUpdateFileName(file.name);
                }}
              />
            )}

            {/* Document update review mode — replaces normal body content */}
            {showUpdateReview ? (
              <DealUpdateReview
                diffItems={diffItems}
                stageSuggestion={stageSuggestion}
                fileName={updateFileName}
                documentType={updateDocType}
                approving={approving}
                onApprove={handleApproveUpdate}
                onCancel={handleCancelUpdate}
              />
            ) : (
            <>
            {/* Commission breakdown */}
            <CommissionCalc deal={deal} brokerId={brokerId} />

            {/* Lease Payment Schedule — shows for lease deals with payments */}
            {deal.deal_type === "lease" && deal.lease_payments && deal.lease_payments.length > 0 && (
              <LeasePaymentSchedule
                deal={deal}
                onToggleReceived={deal.status === "closed" ? handleToggleReceived : undefined}
              />
            )}

            {/* Timeline */}
            <TimelineBar deal={deal} />

            {/* Deal info */}
            <div className="bg-white border border-border-light rounded-card p-4">
              <h3 className="font-dm font-semibold text-sm text-charcoal mb-3">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-medium-gray">Type</span>
                  <span className="font-medium capitalize">{deal.deal_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-medium-gray">Effective Date</span>
                  <span className="font-medium">{formatDate(deal.effective_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-medium-gray">Escrow Open</span>
                  <span className="font-medium">{formatDate(deal.escrow_open_date)}</span>
                </div>

                {/* Dynamic dates from deal_dates */}
                {deal.deal_dates && deal.deal_dates.length > 0 ? (
                  deal.deal_dates
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((dd) => (
                      <div key={dd.id} className="flex justify-between">
                        <span className="text-medium-gray">{dd.label}</span>
                        <span className="font-medium">
                          {formatDate(dd.date)}
                          {dd.offset_days && (
                            <span className="text-xs text-muted-gray ml-1">
                              ({dd.offset_days}d)
                            </span>
                          )}
                        </span>
                      </div>
                    ))
                ) : (
                  /* Legacy fallback — show old fixed fields */
                  <>
                    {deal.feasibility_days && (
                      <div className="flex justify-between">
                        <span className="text-medium-gray">Feasibility Period</span>
                        <span className="font-medium">{deal.feasibility_days} days</span>
                      </div>
                    )}
                    {deal.inside_close_days && (
                      <div className="flex justify-between">
                        <span className="text-medium-gray">Inside Close Period</span>
                        <span className="font-medium">{deal.inside_close_days} days</span>
                      </div>
                    )}
                    {deal.outside_close_days && (
                      <div className="flex justify-between">
                        <span className="text-medium-gray">Outside Close Period</span>
                        <span className="font-medium">{deal.outside_close_days} days</span>
                      </div>
                    )}
                  </>
                )}

                {deal.actual_close_date && (
                  <div className="flex justify-between">
                    <span className="text-medium-gray">Actual Close Date</span>
                    <span className="font-medium">{formatDate(deal.actual_close_date)}</span>
                  </div>
                )}
                {deal.cancel_reason && (
                  <div className="flex justify-between">
                    <span className="text-medium-gray">Cancel Reason</span>
                    <span className="font-medium">{deal.cancel_reason}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-medium-gray">Price</span>
                  <span className="font-medium">{formatCurrency(deal.price)}</span>
                </div>
              </div>
            </div>

            {/* Documents — only show if deal has a SharePoint folder */}
            {deal.sharepoint_folder_url && (
              <div className="bg-white border border-border-light rounded-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-dm font-semibold text-sm text-charcoal">Documents</h3>
                  <a
                    href={deal.sharepoint_folder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green hover:underline"
                  >
                    Open in SharePoint
                  </a>
                </div>

                {filesLoading ? (
                  <div className="flex items-center gap-2 py-3">
                    <div className="w-3 h-3 border-2 border-green border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-gray">Loading files...</span>
                  </div>
                ) : files.length === 0 ? (
                  <p className="text-xs text-muted-gray py-2">
                    No documents yet — drop a file in the edit form to get started
                  </p>
                ) : (
                  <div className="space-y-1">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-light-gray transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileIcon name={file.name} />
                          <div className="min-w-0">
                            <p className="text-sm text-charcoal truncate">{file.name}</p>
                            <p className="text-xs text-muted-gray">
                              {formatFileSize(file.size)} · {new Date(file.lastModified).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          </div>
                        </div>
                        {/* Download button */}
                        {file.downloadUrl ? (
                          <a
                            href={file.downloadUrl}
                            download={file.name}
                            className="p-1 text-muted-gray hover:text-charcoal transition-colors flex-shrink-0"
                            title="Download"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </a>
                        ) : (
                          <a
                            href={file.webUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-muted-gray hover:text-charcoal transition-colors flex-shrink-0"
                            title="Open in SharePoint"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="bg-white border border-border-light rounded-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-dm font-semibold text-sm text-charcoal">Notes</h3>
                {notesSaving && <span className="text-xs text-muted-gray">Saving...</span>}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                rows={4}
                className="w-full border border-border-light rounded-btn px-3 py-2 text-sm resize-none"
                placeholder="Add notes about this deal..."
              />
            </div>
            </>
            )}
          </div>
        </div>
      </div>

      {/* Edit form modal */}
      {editing && (
        <DealForm
          deal={deal}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
          mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          brokerId={brokerId}
          allBrokers={allBrokers}
        />
      )}

      {/* Close deal confirmation — with commission verification */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCloseModal(false)} />
          <div className="relative bg-white rounded-card border border-border-light p-6 w-full max-w-md mx-4">
            <h3 className="font-dm font-semibold text-lg text-charcoal mb-2">Close Deal</h3>
            <p className="text-sm text-medium-gray mb-4">Mark &ldquo;{deal.deal_name}&rdquo; as closed?</p>

            {/* Close date */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-charcoal mb-1">Close Date</label>
              <input
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="w-full border border-border-light rounded-btn px-3 py-2 text-sm"
              />
            </div>

            {/* Commission verification */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-charcoal mb-1">Commission Rate (%)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.1"
                  value={closeCommission}
                  onChange={(e) => {
                    setCloseCommission(e.target.value);
                    // Uncheck if they edit the value
                    setCommissionVerified(false);
                  }}
                  className="flex-1 border border-border-light rounded-btn px-3 py-2 text-sm"
                />
                {/* Verify checkmark */}
                <button
                  onClick={() => setCommissionVerified(!commissionVerified)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-btn border transition-colors duration-200
                    ${commissionVerified
                      ? "bg-green/10 border-green text-green"
                      : "border-border-light text-medium-gray hover:border-[#999]"
                    }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {commissionVerified ? "Verified" : "Verify"}
                </button>
              </div>
            </div>

            {/* Lease payment schedule preview — shows resolved dates based on entered close date */}
            {deal.deal_type === "lease" && deal.lease_payments && deal.lease_payments.length > 0 && (
              <div className="mb-4 p-3 bg-light-gray rounded-btn border border-border-light">
                <p className="text-xs font-medium text-medium-gray mb-2">Payment Schedule</p>
                <div className="space-y-1.5">
                  {(() => {
                    const cDate = closeDate || new Date().toISOString().substring(0, 10);
                    const closeDateObj = new Date(cDate + "T00:00:00");
                    const totalComm = (deal.price || 0) * (deal.commission_rate || 0);
                    let previousDate = closeDateObj;

                    return [...deal.lease_payments]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((lp, i) => {
                        // Resolve the payment date
                        let resolvedDate = lp.payment_date;
                        if (!resolvedDate && lp.offset_days !== null) {
                          const baseDate = lp.offset_from === "previous" ? previousDate : closeDateObj;
                          const resolved = new Date(baseDate);
                          resolved.setDate(resolved.getDate() + (lp.offset_days || 0));
                          resolvedDate = resolved.toISOString().substring(0, 10);
                        }
                        if (resolvedDate) {
                          previousDate = new Date(resolvedDate + "T00:00:00");
                        }

                        const amount = totalComm * (lp.percent / 100);
                        return (
                          <div key={lp.id} className="flex items-center justify-between text-xs">
                            <span className="text-charcoal">
                              #{i + 1} — {lp.percent}% ({formatCurrency(amount)})
                            </span>
                            <span className="text-medium-gray">
                              {resolvedDate ? formatDate(resolvedDate) : "TBD"}
                            </span>
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 text-sm font-medium text-medium-gray border border-border-light rounded-btn
                           hover:border-border-medium transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseDeal}
                disabled={!commissionVerified}
                className={`px-4 py-2 text-sm font-medium rounded-btn transition-colors duration-200
                  ${commissionVerified
                    ? "bg-green hover:bg-green/90 text-black uppercase tracking-wide"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
              >
                Close Deal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel deal confirmation */}
      {showCancelModal && (
        <ConfirmModal
          title="Cancel Deal"
          message={`Cancel "${deal.deal_name}"? This can be undone by editing the deal status.`}
          confirmLabel="Cancel Deal"
          confirmColor="red"
          showTextInput
          textInputLabel="Reason for cancellation"
          onConfirm={handleCancelDeal}
          onCancel={() => setShowCancelModal(false)}
        />
      )}

      {/* Permanent delete confirmation */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete Deal"
          message={`Permanently delete "${deal.deal_name}"? This cannot be undone — the deal and all its data will be removed.`}
          confirmLabel="Delete Forever"
          confirmColor="red"
          onConfirm={handleDeleteDeal}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
