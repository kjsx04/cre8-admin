"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Folder, Info, MapPin, Pencil, Plus, Search, X } from "lucide-react";
import { Deal, DealFormData, DealType, DealDate, CRE8Listing, ExtractedDealData, AdditionalSplit, BrokerDefaults, Broker, LeaseStage } from "@/lib/flow/types";
import {
  formatCurrency,
  addDays,
  toInputDate,
  daysBetween,
  LEASE_KANBAN_COLUMNS,
} from "@/lib/flow/utils";
import {
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Section,
  Select,
  Tabs,
  Textarea,
  cn,
} from "@/components/ui";
import FileDropZone from "./FileDropZone";
import dynamic from "next/dynamic";
import type { SelectedParcel } from "./ParcelPickerModal";

// Dynamic imports to avoid SSR issues with mapbox-gl / MSAL hooks
const ParcelPickerModal = dynamic(() => import("./ParcelPickerModal"), {
  ssr: false,
});
const FolderPickerModal = dynamic(() => import("./FolderPickerModal"), {
  ssr: false,
});

// ── Types for form-level date rows (not yet saved to DB) ──
interface FormDate {
  tempId: string;            // local key for React — replaced by real UUID on save
  label: string;
  date: string;              // YYYY-MM-DD (resolved)
  mode: "absolute" | "relative";
  offset_days: number | null;
  offset_from: string | null; // tempId of another FormDate, or "escrow_open"
  sort_order: number;
  editing: boolean;           // true when row is in inline edit mode
}

// Preset label suggestions for the date row dropdown
const DATE_LABEL_PRESETS = [
  "Feasibility Ends",
  "Inside Close",
  "Outside Close",
  "Extension",
  "Inspection Deadline",
  "Financing Contingency",
];

// ── Broker member row in the form ──
interface FormMember {
  broker_id: string;
  broker_name: string;
  split_percent: number | null;  // null = even split
}

// ── Lease payment schedule row in the form ──
interface FormPayment {
  tempId: string;
  percent: string;                // string for input — e.g. "50"
  mode: "absolute" | "relative"; // absolute = calendar date, relative = X days after close/previous
  payment_date: string;           // YYYY-MM-DD
  offset_days: string;            // string for input — e.g. "60"
  offset_from: string;            // "close_date" or "previous"
  received: boolean;              // carried through on edit so saving doesn't reset paid payments
  received_date: string | null;
}

interface DealFormProps {
  deal?: Deal;                // if editing, pre-fill from existing deal
  onSave: (data: DealFormData, dealDates?: DealDate[], pendingFile?: File) => void;
  onCancel: () => void;
  saving?: boolean;
  mapboxToken?: string;       // Mapbox token for parcel picker
  brokerDefaults?: BrokerDefaults;  // pre-fill commission settings for new deals
  userEmail?: string;         // for saving broker defaults
  brokerId?: string;          // logged-in broker's UUID
  allBrokers?: Pick<Broker, "id" | "name" | "email">[];  // all CRE8 brokers for picker
  // Kanban drop highlight — amber ring on fields that need attention after a drag-drop
  initialHighlightFields?: string[];
  contextBanner?: string;     // amber banner message below the form title
  defaultDealType?: DealType; // pre-select deal type for new deals (e.g. "lease" from the Lease tab)
}

// Empty form defaults
const emptyForm: DealFormData = {
  deal_name: "",
  property_address: "",
  deal_type: "sale",
  price: "",
  commission_rate: "3",
  broker_split: "50",
  effective_date: "",
  escrow_open_date: "",
  notes: "",
  listing_id: "",
  parcel_number: "",
  escrow_number: "",
  escrow_company: "",
  additional_splits: [],
  broker_members: [],
  lease_stage: "negotiating_loi",
};

// Generate a short random ID for local form state
function tempId(): string {
  return "tmp_" + Math.random().toString(36).substring(2, 9);
}

// Highlight recipes — green = AI/listing auto-filled (status), amber = Kanban drop context
const GREEN_HIGHLIGHT = "border-accent ring-1 ring-accent/30 bg-accent-soft";
const AMBER_HIGHLIGHT = "border-warning-fg/60 ring-1 ring-warning-fg/30 bg-warning-bg";

// Shared popover look for the listing / broker search dropdowns (floating layer → shadow allowed)
const POPOVER = "absolute z-10 mt-1 bg-surface border border-border rounded-control shadow-popover overflow-hidden";

// ── Searchable listing selector (unchanged logic — Field/Input primitives) ──
function ListingSearch({
  listings,
  loading,
  selectedId,
  onSelect,
  highlighted,
}: {
  listings: CRE8Listing[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  highlighted: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Find selected listing for display
  const selected = listings.find((l) => l.id === selectedId);

  // Filter listings by search query (name or address)
  const filtered = query.trim()
    ? listings.filter((l) => {
        const q = query.toLowerCase();
        return l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q);
      })
    : listings;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef}>
      <Field label="Link to CRE8 listing" hint="Optional — auto-fills name, address, and price from your listing">
        <div className="relative">
          {/* If a listing is selected, show it as a chip with a clear button */}
          {selected ? (
            <div
              className={cn(
                "flex items-center justify-between h-control border rounded-control px-3 text-base bg-surface transition-all duration-500",
                highlighted ? GREEN_HIGHLIGHT : "border-border"
              )}
            >
              <span className="text-text truncate">
                {selected.name}{selected.address ? ` — ${selected.address}` : ""}
              </span>
              <IconButton
                label="Clear"
                size="sm"
                icon={<X size={16} strokeWidth={1.75} />}
                onClick={() => {
                  onSelect("");
                  setQuery("");
                }}
                className="-mr-2"
              />
            </div>
          ) : (
            <>
              <Input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder={loading ? "Loading listings..." : "Search by name or address..."}
                disabled={loading}
                className={cn("pr-9", highlighted && GREEN_HIGHLIGHT)}
              />
              {/* Search icon */}
              <Search
                size={16}
                strokeWidth={1.75}
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-3"
              />
            </>
          )}

          {/* Dropdown results */}
          {open && !selected && (
            <div className={cn(POPOVER, "w-full max-h-48 overflow-y-auto")}>
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-text-3">
                  {query ? "No listings match" : "No listings available"}
                </div>
              ) : (
                filtered.slice(0, 12).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      onSelect(l.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors border-b border-border last:border-0"
                  >
                    <span className="font-medium text-text">{l.name}</span>
                    {l.address && (
                      <span className="text-text-3 ml-1">— {l.address}</span>
                    )}
                    {l.price && l.price !== "Call for Pricing" && l.price !== "Call For Pricing" && (
                      <span className="text-accent-strong ml-1">{l.price.startsWith("$") ? l.price : `$${l.price}`}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </Field>
    </div>
  );
}

// ── Main DealForm component ──

export default function DealForm({ deal, onSave, onCancel, saving, mapboxToken, brokerDefaults, userEmail, brokerId, allBrokers, initialHighlightFields, contextBanner, defaultDealType }: DealFormProps) {
  const [form, setForm] = useState<DealFormData>(emptyForm);
  const isEditing = !!deal;

  // ── Dynamic dates state ──
  const [dealDates, setDealDates] = useState<FormDate[]>([]);

  // ── Commission additional splits (form-level) ──
  const [additionalSplits, setAdditionalSplits] = useState<AdditionalSplit[]>([]);

  // ── Listings state (for dropdown) ──
  const [listings, setListings] = useState<CRE8Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);

  // ── Broker members state ──
  const [brokerMembers, setBrokerMembers] = useState<FormMember[]>([]);
  const [showBrokerDropdown, setShowBrokerDropdown] = useState(false);
  const [brokerSearch, setBrokerSearch] = useState("");
  const brokerDropdownRef = useRef<HTMLDivElement>(null);

  // ── Lease payment schedule state ──
  const [leasePayments, setLeasePayments] = useState<FormPayment[]>([]);

  // ── Parcel picker state ──
  const [showParcelPicker, setShowParcelPicker] = useState(false);
  // Store selected parcels so re-opening the picker zooms back to them
  const [storedParcels, setStoredParcels] = useState<SelectedParcel[]>([]);

  // ── Pending file for SharePoint upload after save ──
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // ── SharePoint folder picker state ──
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [linkedFolderUrl, setLinkedFolderUrl] = useState(deal?.sharepoint_folder_url || "");
  const [linkedFolderPath, setLinkedFolderPath] = useState("");

  // ── Save defaults feedback ──
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // ── Track which fields were auto-filled (for green highlight) ──
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Amber highlight for Kanban drop context (persists until user edits the field) ──
  const [amberFields, setAmberFields] = useState<Set<string>>(
    new Set(initialHighlightFields || [])
  );

  // If editing, populate form from existing deal
  useEffect(() => {
    if (deal) {
      setForm({
        deal_name: deal.deal_name,
        property_address: deal.property_address || "",
        deal_type: deal.deal_type,
        price: deal.price ? String(deal.price) : "",
        commission_rate: String(deal.commission_rate * 100),
        broker_split: String(deal.broker_split * 100),
        effective_date: toInputDate(deal.effective_date),
        escrow_open_date: toInputDate(deal.escrow_open_date),
        notes: deal.notes || "",
        listing_id: deal.listing_id || "",
        parcel_number: deal.parcel_number || "",
        escrow_number: deal.escrow_number || "",
        escrow_company: deal.escrow_company || "",
        additional_splits: deal.additional_splits || [],
        broker_members: (deal.deal_members || []).map((m) => ({
          broker_id: m.broker_id,
          split_percent: m.split_percent,
        })),
        lease_stage: deal.lease_stage || "negotiating_loi",
      });
      setAdditionalSplits(deal.additional_splits || []);

      // Populate broker members from deal.deal_members
      if (deal.deal_members && deal.deal_members.length > 0) {
        setBrokerMembers(
          deal.deal_members.map((m) => ({
            broker_id: m.broker_id,
            broker_name: m.broker_name || "Unknown",
            split_percent: m.split_percent,
          }))
        );
      } else if (brokerId) {
        // Fallback — just the current broker
        const me = allBrokers?.find((b) => b.id === brokerId);
        setBrokerMembers([{ broker_id: brokerId, broker_name: me?.name || "You", split_percent: null }]);
      }

      // Populate dynamic dates from deal.deal_dates
      if (deal.deal_dates && deal.deal_dates.length > 0) {
        setDealDates(
          deal.deal_dates
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((dd) => ({
              tempId: dd.id,
              label: dd.label,
              date: dd.date,
              mode: dd.offset_days ? "relative" : "absolute",
              offset_days: dd.offset_days,
              offset_from: dd.offset_from,
              sort_order: dd.sort_order,
              editing: false,
            }))
        );
      }

      // Populate lease payment schedule from deal.lease_payments
      if (deal.lease_payments && deal.lease_payments.length > 0) {
        setLeasePayments(
          deal.lease_payments
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((lp) => ({
              tempId: lp.id,
              percent: String(lp.percent),
              mode: (lp.payment_date ? "absolute" : "relative") as "absolute" | "relative",
              payment_date: lp.payment_date || "",
              offset_days: lp.offset_days !== null ? String(lp.offset_days) : "",
              offset_from: lp.offset_from || "close_date",
              received: lp.received || false,
              received_date: lp.received_date || null,
            }))
        );
      } else if (deal.deal_type === "lease") {
        // Lease deal with no payments — default 50/50
        setLeasePayments([
          { tempId: tempId(), percent: "50", mode: "relative", payment_date: "", offset_days: "0", offset_from: "close_date", received: false, received_date: null },
          { tempId: tempId(), percent: "50", mode: "relative", payment_date: "", offset_days: "60", offset_from: "previous", received: false, received_date: null },
        ]);
      }
    } else {
      // New deal — pre-fill from broker defaults + the tab's deal type
      setForm((prev) => ({
        ...prev,
        ...(brokerDefaults
          ? {
              commission_rate: String(brokerDefaults.commission_rate * 100),
              broker_split: String(brokerDefaults.broker_split * 100),
              additional_splits: brokerDefaults.additional_splits || [],
            }
          : {}),
        ...(defaultDealType ? { deal_type: defaultDealType } : {}),
      }));
      if (brokerDefaults) setAdditionalSplits(brokerDefaults.additional_splits || []);

      // New lease deal (from the Lease tab) — start with the default 50/50 payment schedule
      if (defaultDealType === "lease") {
        setLeasePayments([
          { tempId: tempId(), percent: "50", mode: "relative", payment_date: "", offset_days: "0", offset_from: "close_date", received: false, received_date: null },
          { tempId: tempId(), percent: "50", mode: "relative", payment_date: "", offset_days: "60", offset_from: "previous", received: false, received_date: null },
        ]);
      }

      // Auto-add the current broker as the first member
      if (brokerId) {
        const me = allBrokers?.find((b) => b.id === brokerId);
        setBrokerMembers([{ broker_id: brokerId, broker_name: me?.name || "You", split_percent: null }]);
      }
    }
  }, [deal, brokerDefaults, brokerId, allBrokers, defaultDealType]);

  // Fetch CRE8 listings for the dropdown
  useEffect(() => {
    let cancelled = false;
    setListingsLoading(true);
    fetch("/api/flow/listings")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setListings(data);
        }
      })
      .catch((err) => console.warn("[DealForm] Listings fetch failed:", err))
      .finally(() => {
        if (!cancelled) setListingsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Close broker dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (brokerDropdownRef.current && !brokerDropdownRef.current.contains(e.target as Node)) {
        setShowBrokerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Cleanup highlight timer on unmount
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const update = (field: keyof DealFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear amber highlight when user edits the field
    if (amberFields.has(field)) {
      setAmberFields((prev) => { const next = new Set(prev); next.delete(field); return next; });
    }
  };

  // ── Highlight auto-filled fields briefly ──
  const flashHighlight = useCallback((fields: string[]) => {
    setHighlightedFields(new Set(fields));
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedFields(new Set());
    }, 2000);
  }, []);

  // ── Merge extracted data into form (only fills empty fields) ──
  const handleExtracted = useCallback((data: ExtractedDealData) => {
    const filledFields: string[] = [];
    setForm((prev) => {
      const updated = { ...prev };
      // Map simple fields — overwrite any field the AI extracted (source of truth)
      const simpleFields: (keyof ExtractedDealData)[] = [
        "deal_name", "property_address", "deal_type", "price",
        "commission_rate", "effective_date", "escrow_open_date",
        "escrow_number", "escrow_company", "notes",
      ];
      for (const key of simpleFields) {
        const value = data[key];
        if (value !== undefined && key in updated) {
          const formKey = key as keyof DealFormData;
          (updated as Record<string, unknown>)[formKey] = String(value);
          filledFields.push(key);
        }
      }
      // If doc is an LOI and form has an effective_date, clear it
      if (data.document_type === "loi" && updated.effective_date) {
        updated.effective_date = "";
        filledFields.push("effective_date");
      }
      return updated;
    });

    // Map extracted deal_dates into the dynamic dates state — overwrite existing
    if (data.deal_dates && Array.isArray(data.deal_dates) && data.deal_dates.length > 0) {
      setDealDates(
        data.deal_dates.map((dd, i) => ({
          tempId: tempId(),
          label: dd.label || "Milestone",
          date: dd.date || "",
          mode: dd.offset_days ? "relative" as const : "absolute" as const,
          offset_days: dd.offset_days || null,
          offset_from: dd.offset_reference || "escrow_open",
          sort_order: i + 1,
          editing: !dd.date, // open edit mode if date wasn't resolved
        }))
      );
      filledFields.push("deal_dates");
    }

    setTimeout(() => flashHighlight(filledFields), 50);
  }, [flashHighlight]);

  // ── Handle listing selection ──
  const handleListingSelect = useCallback((listingId: string) => {
    if (!listingId) {
      update("listing_id", "");
      return;
    }

    const listing = listings.find((l) => l.id === listingId);
    if (!listing) return;

    const filledFields: string[] = ["listing_id"];
    setForm((prev) => {
      const updated = { ...prev, listing_id: listingId };

      if (!updated.deal_name && listing.name) {
        updated.deal_name = listing.name;
        filledFields.push("deal_name");
      }
      if (!updated.property_address && listing.address) {
        updated.property_address = listing.address;
        filledFields.push("property_address");
      }
      if (!updated.price && listing.price) {
        const numericPrice = listing.price.replace(/[^0-9.]/g, "");
        if (numericPrice && !isNaN(parseFloat(numericPrice))) {
          updated.price = numericPrice;
          filledFields.push("price");
        }
      }
      if (listing.listing_type) {
        const lt = listing.listing_type.toLowerCase();
        if (lt.includes("lease")) {
          updated.deal_type = "lease";
          filledFields.push("deal_type");
        } else if (lt.includes("sale")) {
          updated.deal_type = "sale";
          filledFields.push("deal_type");
        }
      }

      return updated;
    });

    setTimeout(() => flashHighlight(filledFields), 50);
  }, [listings, flashHighlight]);

  // ── Handle parcel picker confirm ──
  const handleParcelConfirm = useCallback((selection: { property_address: string; parcel_number: string; seller_entity: string; acreage: string; selectedParcels?: SelectedParcel[] }) => {
    // Store selected parcels so re-opening the picker restores them
    if (selection.selectedParcels) {
      setStoredParcels(selection.selectedParcels);
    }
    const filledFields: string[] = [];
    setForm((prev) => {
      const updated = { ...prev };
      if (selection.property_address && !updated.property_address) {
        updated.property_address = selection.property_address;
        filledFields.push("property_address");
      }
      if (selection.parcel_number) {
        updated.parcel_number = selection.parcel_number;
        filledFields.push("parcel_number");
      }
      return updated;
    });
    setShowParcelPicker(false);
    setTimeout(() => flashHighlight(filledFields), 50);
  }, [flashHighlight]);

  // ── Dynamic date helpers ──

  const addDateRow = () => {
    setDealDates((prev) => [
      ...prev,
      {
        tempId: tempId(),
        label: "",
        date: "",
        mode: "absolute",
        offset_days: null,
        offset_from: "escrow_open",
        sort_order: prev.length + 1,
        editing: true,
      },
    ]);
  };

  const updateDateRow = (id: string, updates: Partial<FormDate>) => {
    setDealDates((prev) =>
      prev.map((d) => {
        if (d.tempId !== id) return d;
        const updated = { ...d, ...updates };
        // Auto-resolve date when offset changes in relative mode
        if (updated.mode === "relative" && updated.offset_days && updated.offset_from) {
          let refDate: Date | null = null;
          if (updated.offset_from === "escrow_open" && form.escrow_open_date) {
            refDate = new Date(form.escrow_open_date + "T00:00:00");
          } else {
            const ref = prev.find((r) => r.tempId === updated.offset_from);
            if (ref && ref.date) refDate = new Date(ref.date + "T00:00:00");
          }
          if (refDate) {
            updated.date = addDays(refDate, updated.offset_days).toISOString().substring(0, 10);
          }
        }
        return updated;
      })
    );
  };

  const removeDateRow = (id: string) => {
    setDealDates((prev) => prev.filter((d) => d.tempId !== id));
  };

  // ── Additional splits helpers ──

  const addSplit = () => {
    setAdditionalSplits((prev) => [...prev, { label: "", percent: 0 }]);
  };

  const updateSplit = (index: number, updates: Partial<AdditionalSplit>) => {
    setAdditionalSplits((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  const removeSplit = (index: number) => {
    setAdditionalSplits((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Broker member helpers ──

  const addBrokerMember = (broker: Pick<Broker, "id" | "name" | "email">) => {
    if (brokerMembers.some((m) => m.broker_id === broker.id)) return;
    setBrokerMembers((prev) => [...prev, { broker_id: broker.id, broker_name: broker.name, split_percent: null }]);
    setBrokerSearch("");
    setShowBrokerDropdown(false);
  };

  const removeBrokerMember = (bId: string) => {
    // Can't remove yourself
    if (bId === brokerId) return;
    setBrokerMembers((prev) => prev.filter((m) => m.broker_id !== bId));
  };

  const updateMemberSplit = (bId: string, value: string) => {
    setBrokerMembers((prev) =>
      prev.map((m) =>
        m.broker_id === bId
          ? { ...m, split_percent: value === "" ? null : parseFloat(value) / 100 }
          : m
      )
    );
  };

  // Check if any member has an explicit split override
  const hasExplicitSplits = brokerMembers.some((m) => m.split_percent !== null);

  // Validate splits sum to 100% when explicit
  const splitsValid = !hasExplicitSplits || Math.abs(
    brokerMembers.reduce((sum, m) => sum + (m.split_percent ?? 0) * 100, 0) - 100
  ) < 0.01;

  // Validate lease payments sum to 100% (only for lease deals with payments defined)
  const leasePaymentsValid = form.deal_type !== "lease" || leasePayments.length === 0 || Math.abs(
    leasePayments.reduce((sum, lp) => sum + (parseFloat(lp.percent) || 0), 0) - 100
  ) < 0.01;

  // Available brokers for the picker (exclude those already added)
  const availableBrokers = (allBrokers || []).filter(
    (b) => !brokerMembers.some((m) => m.broker_id === b.id)
  );
  const filteredAvailBrokers = brokerSearch.trim()
    ? availableBrokers.filter((b) => b.name.toLowerCase().includes(brokerSearch.toLowerCase()))
    : availableBrokers;

  // ── Save broker defaults ──
  const saveDefaults = async () => {
    if (!userEmail) return;
    setDefaultsSaving(true);
    try {
      const res = await fetch("/api/flow/broker/defaults", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          commission_rate: (parseFloat(form.commission_rate) || 3) / 100,
          broker_split: (parseFloat(form.broker_split) || 50) / 100,
          additional_splits: additionalSplits.filter((s) => s.label.trim()),
        }),
      });
      if (res.ok) {
        setDefaultsSaved(true);
        setTimeout(() => setDefaultsSaved(false), 2000);
      }
    } catch (e) {
      console.error("Failed to save defaults:", e);
    } finally {
      setDefaultsSaving(false);
    }
  };

  // Commission breakdown preview
  const previewPrice = parseFloat(form.price) || 0;
  const previewRate = (parseFloat(form.commission_rate) || 0) / 100;
  const previewCommission = previewPrice * previewRate;
  const previewHouseCut = previewCommission * 0.30;
  const previewAfterHouse = previewCommission * 0.70;
  // Logged-in broker's member split
  const myMember = brokerMembers.find((m) => m.broker_id === brokerId);
  const myMemberSplit = myMember
    ? (myMember.split_percent !== null ? myMember.split_percent : 1 / brokerMembers.length)
    : 1;
  const previewMyShare = previewAfterHouse * myMemberSplit;
  const previewDeductions = additionalSplits
    .filter((s) => s.label.trim() && s.percent > 0)
    .reduce((sum, s) => sum + previewMyShare * s.percent, 0);
  const previewTakeHome = previewMyShare - previewDeductions;

  // Urgency dot color for date rows
  const getUrgencyColor = (dateStr: string): string => {
    if (!dateStr) return "bg-border-strong";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    const days = daysBetween(today, d);
    if (days < 0) return "bg-border-strong";  // past = gray
    if (days <= 3) return "bg-danger";
    if (days <= 14) return "bg-warning-fg";
    return "bg-accent";
  };

  // Get reference options for the "days after" dropdown
  const getRefOptions = (excludeId: string) => {
    const options: { value: string; label: string }[] = [
      { value: "escrow_open", label: "Escrow Open" },
    ];
    for (const dd of dealDates) {
      if (dd.tempId !== excludeId && dd.label) {
        options.push({ value: dd.tempId, label: dd.label });
      }
    }
    return options;
  };

  // Get display text for offset reference
  const getRefLabel = (refId: string | null) => {
    if (!refId) return "";
    if (refId === "escrow_open") return "Escrow Open";
    const ref = dealDates.find((d) => d.tempId === refId);
    return ref?.label || "—";
  };

  const formatPreviewDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deal_name.trim()) return;

    // Attach additional_splits and broker_members to form data
    const formData: DealFormData = {
      ...form,
      additional_splits: additionalSplits.filter((s) => s.label.trim()),
      broker_members: brokerMembers.map((m) => ({
        broker_id: m.broker_id,
        split_percent: m.split_percent,
      })),
    };

    // Convert form dates to DealDate shape for API
    const apiDates = dealDates
      .filter((d) => d.label.trim() && d.date)
      .map((d, i) => ({
        id: d.tempId,
        deal_id: deal?.id || "",
        label: d.label,
        date: d.date,
        offset_days: d.mode === "relative" ? d.offset_days : null,
        offset_from: d.mode === "relative" ? d.offset_from : null,
        sort_order: i,
      }));

    // Convert lease payments to API shape (only for lease deals)
    // First payment is always offset from close_date, regardless of what the form says.
    // received/received_date carry through from the existing rows so editing a deal
    // never resets payments that were already marked paid.
    const apiLeasePayments = form.deal_type === "lease" ? leasePayments.map((lp, i) => ({
      sort_order: i,
      percent: parseFloat(lp.percent) || 0,
      payment_date: lp.mode === "absolute" ? lp.payment_date || null : null,
      offset_days: lp.mode === "relative" ? parseInt(lp.offset_days) || 0 : null,
      offset_from: lp.mode === "relative" ? (i === 0 ? "close_date" : lp.offset_from) : null,
      received: lp.received,
      received_date: lp.received_date,
    })) : [];

    // Attach lease_payments to formData so it flows through to the API
    (formData as unknown as Record<string, unknown>).lease_payments = apiLeasePayments;

    // Attach linked SharePoint folder URL if set
    if (linkedFolderUrl) {
      (formData as unknown as Record<string, unknown>).sharepoint_folder_url = linkedFolderUrl;
    }

    onSave(formData, apiDates as DealDate[], pendingFile || undefined);
  };

  // Highlight classes for a field — green for AI auto-fill, amber for Kanban drop context
  const highlightCls = (field?: string) =>
    cn(
      "transition-all duration-500",
      field && highlightedFields.has(field)
        ? GREEN_HIGHLIGHT
        : field && amberFields.has(field)
        ? AMBER_HIGHLIGHT
        : ""
    );

  // Amber ring around a whole section (payment schedule / critical dates) after a drop
  const sectionHighlightCls = (key: string) =>
    cn(
      "border-t border-border pt-5 transition-all duration-300",
      amberFields.has(key) && "ring-1 ring-warning-fg/30 bg-warning-bg/50 rounded-card p-4 -mx-2"
    );

  // Lease payment total (for the validation banner)
  const leaseTotal = leasePayments.reduce((s, lp) => s + (parseFloat(lp.percent) || 0), 0);

  return (
    // Modal primitive — the form body scrolls; Cancel/Save live in the sticky footer
    // (the submit button targets the form via its id since it sits outside the <form>)
    <Modal
      open
      onClose={onCancel}
      size="lg"
      title={isEditing ? "Edit deal" : "New deal"}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="deal-form"
            loading={saving}
            disabled={saving || !form.deal_name.trim() || (hasExplicitSplits && !splitsValid) || !leasePaymentsValid}
          >
            {saving ? "Saving..." : isEditing ? "Save changes" : "Create deal"}
          </Button>
        </>
      }
    >
      <form id="deal-form" onSubmit={handleSubmit} className="space-y-6">
        {/* ── Amber context banner (shown after Kanban drag-drop) ── */}
        {contextBanner && (
          <div className="p-3 rounded-control border border-warning-fg/20 bg-warning-bg text-sm text-warning-fg flex items-center gap-2">
            <Info size={16} strokeWidth={1.75} className="flex-shrink-0" />
            {contextBanner}
          </div>
        )}

        {/* ── File Drop Zone (always visible — compact in edit mode) ── */}
        <FileDropZone
          onExtracted={handleExtracted}
          onFileReady={(file) => setPendingFile(file)}
          compact={isEditing}
        />

        {/* ── CRE8 Listing Selector (searchable) ── */}
        <ListingSearch
          listings={listings}
          loading={listingsLoading}
          selectedId={form.listing_id}
          onSelect={handleListingSelect}
          highlighted={highlightedFields.has("listing_id")}
        />

        {/* ── SharePoint Folder Link ── */}
        <Field label="SharePoint folder">
          {linkedFolderUrl ? (
            <div className="flex items-center justify-between h-control border border-border rounded-control pl-3 pr-1 text-base bg-surface">
              <div className="flex items-center gap-2 min-w-0">
                {/* Folder icon */}
                <Folder size={16} strokeWidth={1.75} className="flex-shrink-0 text-text-2" />
                <span className="text-text truncate">
                  {linkedFolderPath || linkedFolderUrl.split("/").filter(Boolean).pop() || "Linked folder"}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <Button variant="ghost" size="sm" onClick={() => setShowFolderPicker(true)}>
                  Change
                </Button>
                <IconButton
                  label="Remove link"
                  size="sm"
                  icon={<X size={16} strokeWidth={1.75} />}
                  onClick={() => { setLinkedFolderUrl(""); setLinkedFolderPath(""); }}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowFolderPicker(true)}
              className="w-full h-control border border-dashed border-border rounded-control px-3 text-base text-text-3
                         hover:border-border-strong hover:text-text transition-colors text-left flex items-center gap-2"
            >
              <Folder size={16} strokeWidth={1.75} />
              Link a SharePoint folder...
            </button>
          )}
        </Field>

        {/* ── Identity ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Deal name" required className="md:col-span-2">
            <Input
              type="text"
              value={form.deal_name}
              onChange={(e) => update("deal_name", e.target.value)}
              placeholder="e.g. 7th Street Retail"
              className={highlightCls("deal_name")}
              required
            />
          </Field>
          <Field label="Property address">
            <div className="flex gap-2">
              <Input
                type="text"
                value={form.property_address}
                onChange={(e) => update("property_address", e.target.value)}
                placeholder="123 Main St, Phoenix AZ"
                className={highlightCls("property_address")}
              />
              {/* Parcel picker button */}
              {mapboxToken && (
                <IconButton
                  label="Pick from map"
                  variant="secondary"
                  icon={<MapPin size={18} strokeWidth={1.75} />}
                  onClick={() => setShowParcelPicker(true)}
                />
              )}
            </div>
          </Field>
          <Field label="Deal type">
            <Select
              value={form.deal_type}
              onChange={(e) => {
                const newType = e.target.value as DealType;
                update("deal_type", newType);
                // Auto-populate/clear lease payment schedule on type switch
                if (newType === "lease" && leasePayments.length === 0) {
                  setLeasePayments([
                    { tempId: tempId(), percent: "50", mode: "relative", payment_date: "", offset_days: "0", offset_from: "close_date", received: false, received_date: null },
                    { tempId: tempId(), percent: "50", mode: "relative", payment_date: "", offset_days: "60", offset_from: "previous", received: false, received_date: null },
                  ]);
                } else if (newType === "sale") {
                  setLeasePayments([]);
                }
              }}
              className={highlightCls("deal_type")}
            >
              <option value="sale">Sale</option>
              <option value="lease">Lease</option>
            </Select>
          </Field>
          {/* APN field — shows when parcel_number has a value */}
          {form.parcel_number && (
            <Field label="Parcel number (APN)" className="md:col-span-2">
              <Input
                type="text"
                value={form.parcel_number}
                onChange={(e) => update("parcel_number", e.target.value)}
                className={highlightCls("parcel_number")}
                readOnly
              />
            </Field>
          )}
        </div>

        {/* ── Brokers on This Deal ── */}
        {allBrokers && allBrokers.length > 0 && (
          <div className="border-t border-border pt-5">
            <Section title="Brokers on this deal">
              {/* Member rows */}
              <div className="space-y-2 mb-3">
                {brokerMembers.map((m) => (
                  <div key={m.broker_id} className="flex items-center gap-2">
                    {/* Broker name */}
                    <span className="flex-1 text-sm text-text truncate">
                      {m.broker_name}
                      {m.broker_id === brokerId && (
                        <span className="text-xs text-text-3 ml-1">(you)</span>
                      )}
                    </span>

                    {/* Split % input */}
                    <div className="flex items-center gap-1">
                      <div className="w-16">
                        <Input
                          small
                          type="number"
                          step="1"
                          value={m.split_percent !== null ? (m.split_percent * 100).toFixed(0) : ""}
                          onChange={(e) => updateMemberSplit(m.broker_id, e.target.value)}
                          placeholder={
                            brokerMembers.length > 1
                              ? (100 / brokerMembers.length).toFixed(0)
                              : "100"
                          }
                          className="text-right px-2"
                        />
                      </div>
                      <span className="text-xs text-text-3">%</span>
                    </div>

                    {/* Remove button (can't remove yourself) */}
                    {m.broker_id !== brokerId ? (
                      <IconButton
                        label="Remove broker"
                        size="sm"
                        icon={<X size={16} strokeWidth={1.75} />}
                        onClick={() => removeBrokerMember(m.broker_id)}
                        className="hover:text-danger"
                      />
                    ) : (
                      // Spacer to keep layout aligned
                      <div className="w-control-sm" />
                    )}
                  </div>
                ))}
              </div>

              {/* Even split label */}
              {brokerMembers.length > 1 && !hasExplicitSplits && (
                <p className="text-xs text-text-3 mb-2">
                  Even split — {(100 / brokerMembers.length).toFixed(0)}% each
                </p>
              )}

              {/* Validation warning when splits don't sum to 100% */}
              {hasExplicitSplits && !splitsValid && (
                <p className="text-xs text-danger-fg mb-2">
                  Splits must total 100% (currently {(brokerMembers.reduce((s, m) => s + (m.split_percent ?? 0) * 100, 0)).toFixed(0)}%)
                </p>
              )}

              {/* Add Broker dropdown */}
              {availableBrokers.length > 0 && (
                <div className="relative" ref={brokerDropdownRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Plus size={16} strokeWidth={1.75} />}
                    onClick={() => setShowBrokerDropdown(!showBrokerDropdown)}
                    className="-ml-3"
                  >
                    Add broker
                  </Button>

                  {showBrokerDropdown && (
                    <div className={cn(POPOVER, "w-64")}>
                      {/* Search input */}
                      <input
                        type="text"
                        value={brokerSearch}
                        onChange={(e) => setBrokerSearch(e.target.value)}
                        placeholder="Search brokers..."
                        className="w-full border-b border-border px-3 py-2 text-sm text-text bg-surface placeholder:text-text-3 focus:outline-none"
                        autoFocus
                      />
                      <div className="max-h-36 overflow-y-auto">
                        {filteredAvailBrokers.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-text-3">No brokers found</div>
                        ) : (
                          filteredAvailBrokers.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => addBrokerMember(b)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors border-b border-border last:border-0"
                            >
                              <span className="font-medium text-text">{b.name}</span>
                              <span className="text-text-3 ml-1 text-xs">{b.email}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>
          </div>
        )}

        {/* ── Commission ── */}
        <div className="border-t border-border pt-5">
          <Section title="Commission">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Price ($)">
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                  placeholder="2500000"
                  className={highlightCls("price")}
                />
              </Field>
              <Field label="Commission rate (%)">
                <Input
                  type="number"
                  step="0.1"
                  value={form.commission_rate}
                  onChange={(e) => update("commission_rate", e.target.value)}
                  placeholder="3"
                  className={highlightCls("commission_rate")}
                />
              </Field>
            </div>

            {/* Commission breakdown — shown when price is entered */}
            {previewPrice > 0 && previewRate > 0 && (
              <div className="mt-4 bg-surface-2 rounded-card p-4 space-y-2 text-sm">
                {/* Total commission */}
                <div className="flex justify-between">
                  <span className="text-text-2">Total commission ({form.commission_rate}%)</span>
                  <span className="font-medium text-text tabular-nums">{formatCurrency(previewCommission)}</span>
                </div>

                {/* House cut */}
                <div className="flex justify-between">
                  <span className="text-text-2">House (30%)</span>
                  <span className="text-text-2 tabular-nums">−{formatCurrency(previewHouseCut)}</span>
                </div>

                <div className="border-t border-border" />

                {/* After house */}
                <div className="flex justify-between">
                  <span className="text-text-2 font-medium">After house</span>
                  <span className="font-medium text-text tabular-nums">{formatCurrency(previewAfterHouse)}</span>
                </div>

                {/* Broker splits — show each broker's share */}
                {brokerMembers.length > 1 && (
                  <>
                    <div className="border-t border-border" />
                    {brokerMembers.map((m) => {
                      const split = m.split_percent !== null ? m.split_percent : 1 / brokerMembers.length;
                      const share = previewAfterHouse * split;
                      const brokerInfo = allBrokers?.find((b) => b.id === m.broker_id);
                      const name = brokerInfo?.name || (m.broker_id === brokerId ? "You" : "Broker");
                      const isYou = m.broker_id === brokerId;
                      return (
                        <div key={m.broker_id} className="flex justify-between">
                          <span className={isYou ? "text-text font-medium" : "text-text-2"}>
                            {name} ({(split * 100).toFixed(0)}%)
                          </span>
                          <span className={isYou ? "font-medium text-text tabular-nums" : "text-text-2 tabular-nums"}>
                            {formatCurrency(share)}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Additional split deductions */}
                {additionalSplits.filter((s) => s.label.trim() && s.percent > 0).length > 0 && (
                  <>
                    <div className="border-t border-border" />
                    {additionalSplits
                      .filter((s) => s.label.trim() && s.percent > 0)
                      .map((s, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-text-2">{s.label} ({(s.percent * 100).toFixed(0)}%)</span>
                          <span className="text-text-2 tabular-nums">−{formatCurrency(previewMyShare * s.percent)}</span>
                        </div>
                      ))}
                  </>
                )}

                {/* Take-home — green is status (money that lands) */}
                <div className="border-t border-border pt-1" />
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-text">Your take-home</span>
                  <span className="font-semibold text-accent-strong text-lg tabular-nums">{formatCurrency(previewTakeHome)}</span>
                </div>
              </div>
            )}

            {/* Additional Splits — editable */}
            <div className="mt-4">
              <p className="text-sm font-medium text-text mb-2">Additional splits</p>
              {additionalSplits.map((split, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <Input
                    small
                    type="text"
                    value={split.label}
                    onChange={(e) => updateSplit(i, { label: e.target.value })}
                    placeholder="e.g. Referral fee"
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <div className="w-16">
                      <Input
                        small
                        type="number"
                        step="1"
                        value={split.percent ? (split.percent * 100).toFixed(0) : ""}
                        onChange={(e) => updateSplit(i, { percent: (parseFloat(e.target.value) || 0) / 100 })}
                        placeholder="25"
                        className="text-right px-2"
                      />
                    </div>
                    <span className="text-xs text-text-3">%</span>
                  </div>
                  <IconButton
                    label="Remove split"
                    size="sm"
                    icon={<X size={16} strokeWidth={1.75} />}
                    onClick={() => removeSplit(i)}
                    className="hover:text-danger"
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" icon={<Plus size={16} strokeWidth={1.75} />} onClick={addSplit} className="-ml-3">
                Add split
              </Button>
            </div>

            {/* Save as My Defaults button */}
            {userEmail && (
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={saveDefaults} disabled={defaultsSaving}>
                  {defaultsSaved ? "Saved!" : defaultsSaving ? "Saving..." : "Save as my defaults"}
                </Button>
              </div>
            )}
          </Section>
        </div>

        {/* ── Lease Payment Schedule — only for lease deals ── */}
        {form.deal_type === "lease" && (
          <div className={sectionHighlightCls("lease_payments_section")}>
            <Section title="Payment schedule" description="Percentages must total 100%">
              {/* Validation banner */}
              {Math.abs(leaseTotal - 100) >= 0.01 && leasePayments.length > 0 && (
                <div
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-control mb-3 border",
                    leaseTotal > 100
                      ? "bg-danger-bg border-danger/20 text-danger-fg"
                      : "bg-warning-bg border-warning-fg/20 text-warning-fg"
                  )}
                >
                  Total: {leaseTotal.toFixed(0)}% — must equal 100%
                </div>
              )}

              {/* Payment rows */}
              <div className="space-y-2">
                {leasePayments.map((lp, i) => (
                  <div key={lp.tempId} className="border border-border rounded-control p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Payment label */}
                      <span className="text-xs font-medium text-text-2 whitespace-nowrap">
                        Payment {i + 1}
                      </span>

                      {/* Percent input */}
                      <div className="flex items-center gap-1">
                        <div className="w-16">
                          <Input
                            small
                            type="number"
                            step="1"
                            min="1"
                            max="100"
                            value={lp.percent}
                            onChange={(e) => {
                              const updated = [...leasePayments];
                              updated[i] = { ...updated[i], percent: e.target.value };
                              setLeasePayments(updated);
                            }}
                            className="text-right px-2"
                          />
                        </div>
                        <span className="text-xs text-text-3">%</span>
                      </div>

                      {/* Mode toggle */}
                      <div className="w-36">
                        <Select
                          small
                          value={lp.mode}
                          onChange={(e) => {
                            const updated = [...leasePayments];
                            updated[i] = { ...updated[i], mode: e.target.value as "absolute" | "relative" };
                            setLeasePayments(updated);
                          }}
                        >
                          <option value="relative">Days after...</option>
                          <option value="absolute">Specific date</option>
                        </Select>
                      </div>

                      {/* Date/offset input based on mode */}
                      {lp.mode === "relative" ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <div className="w-16">
                            <Input
                              small
                              type="number"
                              min="0"
                              value={lp.offset_days}
                              onChange={(e) => {
                                const updated = [...leasePayments];
                                updated[i] = { ...updated[i], offset_days: e.target.value };
                                setLeasePayments(updated);
                              }}
                              placeholder="0"
                              className="text-right px-2"
                            />
                          </div>
                          <span className="text-xs text-text-3 whitespace-nowrap">days after</span>
                          {i === 0 ? (
                            <span className="text-xs text-text-3">close</span>
                          ) : (
                            <div className="w-40">
                              <Select
                                small
                                value={lp.offset_from}
                                onChange={(e) => {
                                  const updated = [...leasePayments];
                                  updated[i] = { ...updated[i], offset_from: e.target.value };
                                  setLeasePayments(updated);
                                }}
                              >
                                <option value="close_date">close</option>
                                <option value="previous">previous payment</option>
                              </Select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Input
                          small
                          type="date"
                          value={lp.payment_date}
                          onChange={(e) => {
                            const updated = [...leasePayments];
                            updated[i] = { ...updated[i], payment_date: e.target.value };
                            setLeasePayments(updated);
                          }}
                          className="flex-1"
                        />
                      )}

                      {/* Remove button (only if more than 1 row) */}
                      {leasePayments.length > 1 && (
                        <IconButton
                          label="Remove payment"
                          size="sm"
                          icon={<X size={16} strokeWidth={1.75} />}
                          onClick={() => setLeasePayments(leasePayments.filter((_, j) => j !== i))}
                          className="hover:text-danger"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Payment button */}
              <Button
                variant="ghost"
                size="sm"
                icon={<Plus size={16} strokeWidth={1.75} />}
                onClick={() => setLeasePayments([...leasePayments, {
                  tempId: tempId(),
                  percent: "",
                  mode: "relative",
                  payment_date: "",
                  offset_days: "",
                  offset_from: leasePayments.length === 0 ? "close_date" : "previous",
                  received: false,
                  received_date: null,
                }])}
                className="mt-2 -ml-3"
              >
                Add payment
              </Button>
            </Section>
          </div>
        )}

        {/* ── Lease Stage — only for lease deals ── */}
        {form.deal_type === "lease" && (
          <div className="border-t border-border pt-5">
            <Field label="Lease stage" hint="Where this deal sits on the Lease board — you can also drag it between columns">
              <Select
                value={form.lease_stage}
                onChange={(e) => update("lease_stage", e.target.value as LeaseStage)}
                className={highlightCls("lease_stage")}
              >
                {LEASE_KANBAN_COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {/* ── Critical Dates ── */}
        <div className={sectionHighlightCls("deal_dates_section")}>
          <Section title="Critical dates">
            {/* Fixed fields: Effective Date + Escrow Open */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Field label="Effective date">
                <Input
                  type="date"
                  value={form.effective_date}
                  onChange={(e) => update("effective_date", e.target.value)}
                  className={highlightCls("effective_date")}
                />
              </Field>
              <Field label="Escrow open date">
                <Input
                  type="date"
                  value={form.escrow_open_date}
                  onChange={(e) => update("escrow_open_date", e.target.value)}
                  className={highlightCls("escrow_open_date")}
                />
              </Field>
              <Field label="Escrow company">
                <Input
                  type="text"
                  value={form.escrow_company}
                  onChange={(e) => update("escrow_company", e.target.value)}
                  placeholder="e.g. Fidelity National Title"
                  className={highlightCls("escrow_company")}
                />
              </Field>
              <Field label="Escrow number">
                <Input
                  type="text"
                  value={form.escrow_number}
                  onChange={(e) => update("escrow_number", e.target.value)}
                  placeholder="e.g. FM55250953"
                  className={highlightCls("escrow_number")}
                />
              </Field>
            </div>

            {/* Dynamic date rows */}
            <div className="space-y-2">
              {dealDates.map((dd) => (
                <div key={dd.tempId} className="border border-border rounded-control p-3">
                  {dd.editing ? (
                    /* ── Inline edit mode ── */
                    <div className="space-y-3">
                      {/* Label with preset dropdown */}
                      <div>
                        <Input
                          small
                          type="text"
                          value={dd.label}
                          onChange={(e) => updateDateRow(dd.tempId, { label: e.target.value })}
                          placeholder="Date label..."
                          list={`presets-${dd.tempId}`}
                        />
                        <datalist id={`presets-${dd.tempId}`}>
                          {DATE_LABEL_PRESETS.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </div>

                      {/* Mode toggle — Tabs primitive (segmented control) */}
                      <Tabs
                        size="sm"
                        items={[
                          { value: "absolute", label: "Specific date" },
                          { value: "relative", label: "Days after..." },
                        ]}
                        value={dd.mode}
                        onChange={(v) => updateDateRow(dd.tempId, { mode: v })}
                      />

                      {/* Date inputs based on mode */}
                      {dd.mode === "absolute" ? (
                        <Input
                          small
                          type="date"
                          value={dd.date}
                          onChange={(e) => updateDateRow(dd.tempId, { date: e.target.value })}
                        />
                      ) : (
                        <div className="flex gap-2 items-center">
                          <div className="w-20">
                            <Input
                              small
                              type="number"
                              value={dd.offset_days || ""}
                              onChange={(e) =>
                                updateDateRow(dd.tempId, { offset_days: parseInt(e.target.value) || null })
                              }
                              placeholder="30"
                            />
                          </div>
                          <span className="text-xs text-text-3 whitespace-nowrap">days after</span>
                          <div className="flex-1">
                            <Select
                              small
                              value={dd.offset_from || "escrow_open"}
                              onChange={(e) => updateDateRow(dd.tempId, { offset_from: e.target.value })}
                            >
                              {getRefOptions(dd.tempId).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      )}

                      {/* Resolved date preview (for relative mode) */}
                      {dd.mode === "relative" && dd.date && (
                        <p className="text-xs text-text-3">
                          Resolves to: <span className="font-medium text-text">{formatPreviewDate(dd.date)}</span>
                        </p>
                      )}

                      {/* Done / Delete buttons */}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => updateDateRow(dd.tempId, { editing: false })}>
                          Done
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => removeDateRow(dd.tempId)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display mode ── */
                    <div className="flex items-center gap-3">
                      {/* Urgency dot */}
                      <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", getUrgencyColor(dd.date))} />

                      {/* Label + date */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-text truncate">{dd.label || "Untitled"}</span>
                          <span className="text-sm text-text flex-shrink-0">
                            {formatPreviewDate(dd.date)}
                          </span>
                        </div>
                        {dd.mode === "relative" && dd.offset_days && (
                          <span className="text-xs text-text-3">
                            {dd.offset_days} days after {getRefLabel(dd.offset_from)}
                          </span>
                        )}
                      </div>

                      {/* Edit / Delete buttons */}
                      <div className="flex gap-1 flex-shrink-0">
                        <IconButton
                          label="Edit"
                          size="sm"
                          icon={<Pencil size={16} strokeWidth={1.75} />}
                          onClick={() => updateDateRow(dd.tempId, { editing: true })}
                        />
                        <IconButton
                          label="Delete"
                          size="sm"
                          icon={<X size={16} strokeWidth={1.75} />}
                          onClick={() => removeDateRow(dd.tempId)}
                          className="hover:text-danger"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Date button */}
              <Button variant="ghost" size="sm" icon={<Plus size={16} strokeWidth={1.75} />} onClick={addDateRow} className="mt-1 -ml-3">
                Add date
              </Button>
            </div>
          </Section>
        </div>

        {/* ── Notes ── */}
        <div className="border-t border-border pt-5">
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              className={cn(highlightCls("notes"), "resize-none")}
              placeholder="Any additional details..."
            />
          </Field>
        </div>
      </form>

      {/* ── Parcel Picker Modal ── */}
      {showParcelPicker && mapboxToken && (
        <ParcelPickerModal
          mapboxToken={mapboxToken}
          onConfirm={handleParcelConfirm}
          onClose={() => setShowParcelPicker(false)}
          initialParcels={storedParcels.length > 0 ? storedParcels : undefined}
        />
      )}

      {/* ── SharePoint Folder Picker Modal ── */}
      {showFolderPicker && (
        <FolderPickerModal
          onSelect={(folderUrl, folderPath) => {
            const finalUrl = folderUrl || `https://cre8advisors.sharepoint.com/sites/CRE8Operations/Shared%20Documents/${encodeURIComponent(folderPath).replace(/%2F/g, "/")}`;
            setLinkedFolderUrl(finalUrl);
            setLinkedFolderPath(folderPath);
            setShowFolderPicker(false);
          }}
          onCancel={() => setShowFolderPicker(false)}
          initialPath=""
        />
      )}
    </Modal>
  );
}
