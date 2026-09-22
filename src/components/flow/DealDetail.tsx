"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Folder,
} from "lucide-react";
import { Deal, DealFormData, DealDate, Broker, DealDiffItem, StageSuggestion, ExtractedDealData, DealStatus, W9Status } from "@/lib/flow/types";
import { formatCurrency, formatDate, STATUS_LABELS, buildDealDiff, suggestStageMove, LEASE_STAGE_LABELS, getLeaseStage, isLeasePaymentPhase, leasePaymentLabel } from "@/lib/flow/utils";
import { graphScopes } from "@/lib/msal-config";
import { getSiteId, getDriveId, listFolderContents, uploadToFolder, SharePointItem } from "@/lib/graph";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  SlideOver,
  Spinner,
  Textarea,
  Tone,
  cn,
  useToast,
} from "@/components/ui";
import TimelineBar from "./TimelineBar";
import CommissionCalc from "./CommissionCalc";
import DealForm from "./DealForm";
import ConfirmModal from "./ConfirmModal";
import FileDropZone from "./FileDropZone";
import DealUpdateReview from "./DealUpdateReview";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with MSAL hooks in the modal
const FolderPickerModal = dynamic(() => import("./FolderPickerModal"), { ssr: false });

// Status → Badge tone (green = active, amber = in escrow stages, grey = closed, red = cancelled)
const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  due_diligence: "warning",
  closing: "warning",
  closed: "neutral",
  cancelled: "danger",
};

interface DealDetailProps {
  deal: Deal;
  brokerId?: string;
  allBrokers?: Pick<Broker, "id" | "name" | "email">[];
  onUpdate: (id: string, data: Partial<Deal> | DealFormData, dealDates?: DealDate[], pendingFile?: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

// File type icon helper — one lucide icon, colored by type (PDF red, Word blue, other grey)
function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const color =
    ext === "pdf" ? "text-danger" :
    ext === "docx" || ext === "doc" ? "text-info-fg" :
    "text-text-3";
  return <FileText size={16} strokeWidth={1.75} className={cn("flex-shrink-0", color)} />;
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Small "Received / Pending" toggle chip — green when received (status), neutral otherwise
function ReceivedToggle({ received, onClick }: { received: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 h-control-sm px-3 text-xs font-medium rounded-control border transition-colors duration-150",
        received
          ? "bg-accent-soft border-accent text-accent-strong"
          : "border-border text-text-2 hover:border-border-strong hover:text-text"
      )}
    >
      {received ? <Check size={14} strokeWidth={2.5} /> : <Circle size={14} strokeWidth={1.5} />}
      {received ? "Received" : "Pending"}
    </button>
  );
}

// ── Lease Payment Schedule (received toggles once the lease is signed, read-only before) ──
function LeasePaymentSchedule({
  deal,
  onToggleReceived,
  onSetW9Status,
}: {
  deal: Deal;
  onToggleReceived?: (paymentId: string, received: boolean) => void;
  onSetW9Status?: (status: W9Status) => void;
}) {
  // Calculate member's take-home for display
  const totalCommission = (deal.price || 0) * (deal.commission_rate || 0);
  const sortedPayments = [...(deal.lease_payments || [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Card padding="sm">
      <h3 className="text-sm font-semibold text-text mb-3">Payment schedule</h3>
      <div className="space-y-2">
        {sortedPayments
          .map((lp, i) => {
            const amount = totalCommission * (lp.percent / 100);
            return (
              <div
                key={lp.id}
                className={cn(
                  "flex items-center justify-between py-2 px-3 rounded-control border transition-colors",
                  lp.received ? "border-accent/40 bg-accent-soft/50" : "border-border"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-text-2 whitespace-nowrap">{leasePaymentLabel(i, sortedPayments.length)}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-text font-medium">
                      {lp.percent}% — {formatCurrency(amount)}
                    </p>
                    <p className="text-xs text-text-3">
                      {lp.payment_date ? formatDate(lp.payment_date) : (
                        lp.offset_days !== null ? (
                          lp.offset_days === 0
                            ? "At close"
                            : `${lp.offset_days} days after ${lp.offset_from === "previous" ? "previous" : "close"}`
                        ) : "Date TBD"
                      )}
                      {lp.received && lp.received_date && (
                        <span className="ml-1 text-accent-strong">· Received {formatDate(lp.received_date)}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Received toggle button — only for closed deals */}
                {onToggleReceived ? (
                  <ReceivedToggle received={!!lp.received} onClick={() => onToggleReceived(lp.id, !lp.received)} />
                ) : (
                  /* Read-only label for active deals */
                  <span className="text-xs text-text-3">
                    {lp.offset_days !== null ? (
                      lp.offset_days === 0 ? "At close" : `${lp.offset_days}d after ${lp.offset_from === "previous" ? "prev" : "close"}`
                    ) : "Scheduled"}
                  </span>
                )}
              </div>
            );
          })}
      </div>

      {/* W9 / Invoice from outside broker — always shown, N/A when there's no outside broker */}
      {onSetW9Status && (
        <div
          className={cn(
            "mt-2 flex items-center justify-between py-2 px-3 rounded-control border transition-colors",
            deal.w9_status === "received" ? "border-accent/40 bg-accent-soft/50" : "border-border"
          )}
        >
          <div className="min-w-0">
            <p className="text-sm text-text font-medium">W9 &amp; invoice — outside broker</p>
            <p className="text-xs text-text-3">
              {deal.w9_status === "received" ? "Received" : deal.w9_status === "na" ? "Not applicable" : "Needed before paying an outside broker"}
            </p>
          </div>
          {/* Three-state control: Pending → Received, or mark N/A when no outside broker is involved */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ReceivedToggle
              received={deal.w9_status === "received"}
              onClick={() => onSetW9Status(deal.w9_status === "received" ? "pending" : "received")}
            />
            <button
              type="button"
              onClick={() => onSetW9Status(deal.w9_status === "na" ? "pending" : "na")}
              className={cn(
                "h-control-sm px-2.5 text-xs font-medium rounded-control border transition-colors duration-150",
                deal.w9_status === "na"
                  ? "bg-surface-2 border-border-strong text-text"
                  : "border-border text-text-3 hover:border-border-strong hover:text-text"
              )}
              title="No outside broker on this deal"
            >
              N/A
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function DealDetail({ deal, brokerId, allBrokers, onUpdate, onDelete, onClose }: DealDetailProps) {
  // Toast replaces the old native browser alert for "no changes detected"
  const toast = useToast();
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
  const [folderContents, setFolderContents] = useState<SharePointItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [browsingSubpath, setBrowsingSubpath] = useState("");  // relative subpath within the linked folder
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Save edited deal (with deal_dates + optional file for SharePoint upload)
  const handleSave = async (data: DealFormData, dealDates?: DealDate[], pendingFile?: File) => {
    setSaving(true);
    await onUpdate(deal.id, data, dealDates, pendingFile);
    setSaving(false);
    setEditing(false);
    // Re-fetch folder contents after editing (a new file may have been uploaded)
    if (pendingFile && deal.sharepoint_folder_url) {
      setTimeout(() => fetchFolderContents(), 3000); // slight delay for SharePoint to process
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

  // ── Set the W9/invoice status (pending / received / na) ──
  const handleSetW9Status = async (status: W9Status) => {
    await onUpdate(deal.id, { w9_status: status } as Partial<Deal>);
  };

  // ── Extract the base folder path from a SharePoint URL ──
  const getFolderPathFromUrl = useCallback((spUrl: string): string => {
    try {
      const url = new URL(spUrl);
      const pathMatch = url.pathname.match(/\/Shared%20Documents\/(.+)/i) || url.pathname.match(/\/Shared Documents\/(.+)/i);
      if (pathMatch) {
        return decodeURIComponent(pathMatch[1]).replace(/\/+$/, "");
      }
    } catch { /* ignore parse errors */ }
    return "";
  }, []);

  // ── Fetch folder contents (folders + files) from the deal's SharePoint folder ──
  const fetchFolderContents = useCallback(async () => {
    if (!deal.sharepoint_folder_url) return;
    const account = accounts[0];
    if (!account) return;

    setFilesLoading(true);
    try {
      const tokenResponse = await instance.acquireTokenSilent({ ...graphScopes, account });
      const accessToken = tokenResponse.accessToken;
      const siteId = await getSiteId(accessToken);
      const driveId = await getDriveId(accessToken, siteId);

      const basePath = getFolderPathFromUrl(deal.sharepoint_folder_url);
      if (!basePath) return;

      // Build full path including any subpath the user navigated to
      const fullPath = browsingSubpath ? `${basePath}/${browsingSubpath}` : basePath;
      const result = await listFolderContents(accessToken, driveId, fullPath);
      setFolderContents(result);
    } catch (err) {
      console.error("[DealDetail] Failed to fetch folder contents:", err);
    } finally {
      setFilesLoading(false);
    }
  }, [deal.sharepoint_folder_url, browsingSubpath, accounts, instance, getFolderPathFromUrl]);

  // Fetch folder contents on mount and when path changes
  useEffect(() => {
    fetchFolderContents();
  }, [fetchFolderContents]);

  // ── Handle inline file upload (drop files directly into the Documents section) ──
  const handleDirectUpload = useCallback(async (uploadFiles: FileList) => {
    if (!deal.sharepoint_folder_url) return;
    const account = accounts[0];
    if (!account) return;

    setUploading(true);
    try {
      const tokenResponse = await instance.acquireTokenSilent({ ...graphScopes, account });
      const accessToken = tokenResponse.accessToken;
      const siteId = await getSiteId(accessToken);
      const driveId = await getDriveId(accessToken, siteId);

      const basePath = getFolderPathFromUrl(deal.sharepoint_folder_url);
      if (!basePath) return;

      // Upload to whichever subfolder the user is currently viewing
      const targetPath = browsingSubpath ? `${basePath}/${browsingSubpath}` : basePath;

      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        if (file.size > 4 * 1024 * 1024) {
          console.warn(`[DealDetail] Skipping "${file.name}" — exceeds 4MB`);
          continue;
        }
        const buffer = await file.arrayBuffer();
        await uploadToFolder(accessToken, driveId, targetPath, file.name, buffer, file.type || "application/octet-stream");
      }

      // Refresh folder contents
      setTimeout(() => fetchFolderContents(), 1500);
    } catch (err) {
      console.error("[DealDetail] Direct upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [deal.sharepoint_folder_url, browsingSubpath, accounts, instance, getFolderPathFromUrl, fetchFolderContents]);

  // ── Handle folder picker selection ──
  const handleFolderSelected = useCallback(async (folderUrl: string, folderPath: string) => {
    setShowFolderPicker(false);
    // Save the folder URL to the deal — we need to resolve a proper webUrl
    // If folderUrl is empty (user clicked "Use this folder"), build it from path
    const finalUrl = folderUrl || `https://cre8advisors.sharepoint.com/sites/CRE8Operations/Shared%20Documents/${encodeURIComponent(folderPath).replace(/%2F/g, "/")}`;
    setBrowsingSubpath("");  // reset subpath when changing folders
    await onUpdate(deal.id, { sharepoint_folder_url: finalUrl } as Partial<Deal>);
  }, [deal.id, onUpdate]);


  // ── Document update: handle extraction result from drop zone ──
  const handleUpdateExtracted = useCallback((extracted: ExtractedDealData) => {
    // Build diff between current deal and extracted data
    const diff = buildDealDiff(deal, extracted);

    if (diff.length === 0) {
      // No changes detected — brief message, don't enter review mode
      toast.info("No changes detected in this document.");
      return;
    }

    // Check for stage move suggestion
    const suggestion = suggestStageMove(deal, extracted);

    setDiffItems(diff);
    setStageSuggestion(suggestion);
    setUpdateDocType(extracted.document_type || "other");
    setShowUpdateReview(true);
  }, [deal, toast]);

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

      // Re-fetch folder contents if a file was uploaded
      if (updatePendingFile && deal.sharepoint_folder_url) {
        setTimeout(() => fetchFolderContents(), 3000);
      }
    } catch (err) {
      console.error("[DealDetail] Approve update failed:", err);
    } finally {
      setApproving(false);
    }
  }, [deal, onUpdate, updatePendingFile, fetchFolderContents]);

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

  // Footer actions depend on status: active → Edit / Close / Cancel; closed → Edit; cancelled → Delete
  const footerActions = isActive ? (
    <>
      <Button variant="ghost" onClick={() => setShowCancelModal(true)}>
        Cancel deal
      </Button>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button
        onClick={() => {
          // Reset close modal state each time it opens
          setCloseDate("");
          setCloseCommission(String((deal.commission_rate || 0) * 100));
          setCommissionVerified(false);
          setShowCloseModal(true);
        }}
      >
        Close deal
      </Button>
    </>
  ) : deal.status === "closed" ? (
    <Button variant="secondary" onClick={() => setEditing(true)}>
      Edit
    </Button>
  ) : deal.status === "cancelled" ? (
    /* Delete only available for cancelled deals — intentional 2-step process */
    <Button variant="danger" onClick={() => setShowDeleteModal(true)} title="Permanently delete this deal">
      Delete
    </Button>
  ) : null;

  return (
    <>
      {/* Slide-over panel (SlideOver primitive — overlay, Escape closes, sticky header/footer) */}
      <SlideOver
        open
        onClose={onClose}
        width="lg"
        title={deal.deal_name}
        description={deal.property_address || undefined}
        headerActions={
          /* Active lease deals show their board stage; everything else shows status */
          <Badge tone={STATUS_TONE[deal.status] || "neutral"}>
            {deal.deal_type === "lease" && isActive
              ? LEASE_STAGE_LABELS[getLeaseStage(deal)]
              : STATUS_LABELS[deal.status]}
          </Badge>
        }
        footer={footerActions}
      >
        <div className="space-y-4">
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

          {/* Lease Payment Schedule — shows for lease deals with payments.
              Received toggles unlock once the lease is signed (or the deal is closed). */}
          {deal.deal_type === "lease" && deal.lease_payments && deal.lease_payments.length > 0 && (
            <LeasePaymentSchedule
              deal={deal}
              onToggleReceived={
                deal.status === "closed" || isLeasePaymentPhase(deal) ? handleToggleReceived : undefined
              }
              onSetW9Status={deal.status !== "cancelled" ? handleSetW9Status : undefined}
            />
          )}

          {/* Timeline */}
          <TimelineBar deal={deal} />

          {/* Deal info */}
          <Card padding="sm">
            <h3 className="text-sm font-semibold text-text mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-2">Type</span>
                <span className="font-medium text-text capitalize">{deal.deal_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-2">Effective date</span>
                <span className="font-medium text-text">{formatDate(deal.effective_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-2">Escrow open</span>
                <span className="font-medium text-text">{formatDate(deal.escrow_open_date)}</span>
              </div>
              {deal.escrow_company && (
                <div className="flex justify-between">
                  <span className="text-text-2">Escrow company</span>
                  <span className="font-medium text-text">{deal.escrow_company}</span>
                </div>
              )}
              {deal.escrow_number && (
                <div className="flex justify-between">
                  <span className="text-text-2">Escrow number</span>
                  <span className="font-medium text-text">{deal.escrow_number}</span>
                </div>
              )}

              {/* Dynamic dates from deal_dates */}
              {deal.deal_dates && deal.deal_dates.length > 0 ? (
                deal.deal_dates
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((dd) => (
                    <div key={dd.id} className="flex justify-between">
                      <span className="text-text-2">{dd.label}</span>
                      <span className="font-medium text-text">
                        {formatDate(dd.date)}
                        {dd.offset_days && (
                          <span className="text-xs text-text-3 ml-1">
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
                      <span className="text-text-2">Feasibility period</span>
                      <span className="font-medium text-text">{deal.feasibility_days} days</span>
                    </div>
                  )}
                  {deal.inside_close_days && (
                    <div className="flex justify-between">
                      <span className="text-text-2">Inside close period</span>
                      <span className="font-medium text-text">{deal.inside_close_days} days</span>
                    </div>
                  )}
                  {deal.outside_close_days && (
                    <div className="flex justify-between">
                      <span className="text-text-2">Outside close period</span>
                      <span className="font-medium text-text">{deal.outside_close_days} days</span>
                    </div>
                  )}
                </>
              )}

              {deal.actual_close_date && (
                <div className="flex justify-between">
                  <span className="text-text-2">Actual close date</span>
                  <span className="font-medium text-text">{formatDate(deal.actual_close_date)}</span>
                </div>
              )}
              {deal.cancel_reason && (
                <div className="flex justify-between">
                  <span className="text-text-2">Cancel reason</span>
                  <span className="font-medium text-text">{deal.cancel_reason}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-2">Price</span>
                <span className="font-medium text-text tabular-nums">{formatCurrency(deal.price)}</span>
              </div>
            </div>
          </Card>

          {/* Documents — always shown */}
          <Card padding="sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text">Documents</h3>
              {deal.sharepoint_folder_url ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setShowFolderPicker(true)} title="Change linked folder">
                    Change folder
                  </Button>
                  <a
                    href={deal.sharepoint_folder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 h-control-sm px-2 text-sm font-medium text-text-2 hover:text-text rounded-control hover:bg-surface-2 transition-colors"
                  >
                    Open in SharePoint
                    <ExternalLink size={14} strokeWidth={1.75} />
                  </a>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setShowFolderPicker(true)}>
                  Link folder
                </Button>
              )}
            </div>

            {!deal.sharepoint_folder_url ? (
              /* No folder linked — prompt to link one */
              <div className="text-center py-6">
                <Folder size={32} strokeWidth={1.5} className="mx-auto mb-2 text-text-3" />
                <p className="text-sm text-text-3 mb-3">No folder linked to this deal</p>
                <Button variant="secondary" size="sm" onClick={() => setShowFolderPicker(true)}>
                  Browse SharePoint to link a folder
                </Button>
              </div>
            ) : (
              <>
                {/* Breadcrumb for subfolder navigation */}
                {browsingSubpath && (
                  <div className="flex items-center gap-1 mb-2 text-xs flex-wrap">
                    <button
                      type="button"
                      onClick={() => setBrowsingSubpath("")}
                      className="text-text-2 hover:text-text transition-colors"
                    >
                      Root
                    </button>
                    {browsingSubpath.split("/").map((segment, i, arr) => {
                      const subpath = arr.slice(0, i + 1).join("/");
                      return (
                        <span key={subpath} className="flex items-center gap-1">
                          <ChevronRight size={12} strokeWidth={1.75} className="text-text-3" />
                          <button
                            type="button"
                            onClick={() => setBrowsingSubpath(subpath)}
                            className={cn(
                              "transition-colors",
                              i === arr.length - 1 ? "text-text font-medium" : "text-text-2 hover:text-text"
                            )}
                          >
                            {segment}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* File drop zone for direct upload */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files.length > 0) {
                      handleDirectUpload(e.dataTransfer.files);
                    }
                  }}
                  className={cn(
                    "border border-dashed rounded-control px-3 py-2 mb-3 text-center transition-colors cursor-pointer",
                    dragOver ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"
                  )}
                  onClick={() => {
                    // Click to browse files
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.onchange = () => {
                      if (input.files && input.files.length > 0) {
                        handleDirectUpload(input.files);
                      }
                    };
                    input.click();
                  }}
                >
                  {uploading ? (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <Spinner size="sm" />
                      <span className="text-xs text-text-3">Uploading...</span>
                    </div>
                  ) : (
                    <p className="text-xs text-text-3 py-1">
                      Drop files here to upload{browsingSubpath ? ` to ${browsingSubpath.split("/").pop()}` : ""}
                    </p>
                  )}
                </div>

                {/* Folder contents list */}
                {filesLoading ? (
                  <div className="flex items-center gap-2 py-3">
                    <Spinner size="sm" />
                    <span className="text-xs text-text-3">Loading...</span>
                  </div>
                ) : folderContents.length === 0 ? (
                  <p className="text-xs text-text-3 py-2">
                    This folder is empty
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {/* Back button when in a subfolder */}
                    {browsingSubpath && (
                      <button
                        type="button"
                        onClick={() => {
                          const parts = browsingSubpath.split("/");
                          parts.pop();
                          setBrowsingSubpath(parts.join("/"));
                        }}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-control hover:bg-surface-2 transition-colors w-full text-left"
                      >
                        <ChevronLeft size={14} strokeWidth={2} className="text-text-3" />
                        <span className="text-xs text-text-2">..</span>
                      </button>
                    )}
                    {folderContents.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded-control hover:bg-surface-2 transition-colors group"
                      >
                        {item.isFolder ? (
                          /* Folder row — click to drill in */
                          <button
                            type="button"
                            onClick={() => {
                              setBrowsingSubpath(
                                browsingSubpath ? `${browsingSubpath}/${item.name}` : item.name
                              );
                            }}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <Folder size={16} strokeWidth={1.75} className="flex-shrink-0 text-text-2" />
                            <div className="min-w-0">
                              <p className="text-sm text-text truncate">{item.name}</p>
                              {item.childCount > 0 && (
                                <p className="text-xs text-text-3">{item.childCount} items</p>
                              )}
                            </div>
                            <ChevronRight
                              size={14}
                              strokeWidth={2}
                              className="flex-shrink-0 ml-auto text-text-3 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </button>
                        ) : (
                          /* File row */
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileIcon name={item.name} />
                            <div className="min-w-0">
                              <p className="text-sm text-text truncate">{item.name}</p>
                              <p className="text-xs text-text-3">
                                {formatFileSize(item.size)}
                                {item.lastModified && (
                                  <> · {new Date(item.lastModified).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!item.isFolder && item.downloadUrl ? (
                            <a
                              href={item.downloadUrl}
                              download={item.name}
                              className="p-1 rounded-control text-text-3 hover:text-text transition-colors"
                              title="Download"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download size={14} strokeWidth={1.75} />
                            </a>
                          ) : !item.isFolder ? (
                            <a
                              href={item.webUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded-control text-text-3 hover:text-text transition-colors"
                              title="Open in SharePoint"
                            >
                              <ExternalLink size={14} strokeWidth={1.75} />
                            </a>
                          ) : (
                            /* Folder — open in SharePoint */
                            <a
                              href={item.webUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded-control text-text-3 hover:text-text transition-colors opacity-0 group-hover:opacity-100"
                              title="Open in SharePoint"
                            >
                              <ExternalLink size={14} strokeWidth={1.75} />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Notes */}
          <Card padding="sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text">Notes</h3>
              {notesSaving && <span className="text-xs text-text-3">Saving...</span>}
            </div>
            {/* Textarea primitive — same value/onBlur autosave as before */}
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              rows={4}
              className="resize-none"
              placeholder="Add notes about this deal..."
            />
          </Card>
          </>
          )}
        </div>
      </SlideOver>

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

      {/* Close deal confirmation — with commission verification (Modal primitive) */}
      <Modal
        open={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        size="sm"
        title="Close deal"
        description={`Mark "${deal.deal_name}" as closed?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCloseModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCloseDeal} disabled={!commissionVerified}>
              Close deal
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Close date */}
          <Field label="Close date">
            <Input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </Field>

          {/* Commission verification */}
          <Field label="Commission rate (%)">
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.1"
                value={closeCommission}
                onChange={(e) => {
                  setCloseCommission(e.target.value);
                  // Uncheck if they edit the value
                  setCommissionVerified(false);
                }}
                className="flex-1"
              />
              {/* Verify checkmark — green once verified (status) */}
              <button
                type="button"
                onClick={() => setCommissionVerified(!commissionVerified)}
                className={cn(
                  "flex items-center gap-1.5 h-control px-3 text-sm font-medium rounded-control border transition-colors duration-150 shrink-0",
                  commissionVerified
                    ? "bg-accent-soft border-accent text-accent-strong"
                    : "border-border text-text-2 hover:border-border-strong hover:text-text"
                )}
              >
                <Check size={16} strokeWidth={2.5} />
                {commissionVerified ? "Verified" : "Verify"}
              </button>
            </div>
          </Field>

          {/* Lease payment schedule preview — shows resolved dates based on entered close date */}
          {deal.deal_type === "lease" && deal.lease_payments && deal.lease_payments.length > 0 && (
            <div className="p-3 bg-surface-2 rounded-control border border-border">
              <p className="text-xs font-medium text-text-2 mb-2">Payment schedule</p>
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
                          <span className="text-text">
                            #{i + 1} — {lp.percent}% ({formatCurrency(amount)})
                          </span>
                          <span className="text-text-2">
                            {resolvedDate ? formatDate(resolvedDate) : "TBD"}
                          </span>
                        </div>
                      );
                    });
                })()}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Cancel deal confirmation */}
      {showCancelModal && (
        <ConfirmModal
          title="Cancel deal"
          message={`Cancel "${deal.deal_name}"? This can be undone by editing the deal status.`}
          confirmLabel="Cancel deal"
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
          title="Delete deal"
          message={`Permanently delete "${deal.deal_name}"? This cannot be undone — the deal and all its data will be removed.`}
          confirmLabel="Delete forever"
          confirmColor="red"
          onConfirm={handleDeleteDeal}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* SharePoint folder picker modal */}
      {showFolderPicker && (
        <FolderPickerModal
          onSelect={handleFolderSelected}
          onCancel={() => setShowFolderPicker(false)}
          initialPath=""
        />
      )}
    </>
  );
}
