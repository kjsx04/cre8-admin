"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Deal, DealFormData, DealType, DealDate, CRE8Listing, ExtractedDealData, AdditionalSplit, BrokerDefaults, Broker } from "@/lib/flow/types";
import {
  formatCurrency,
  addDays,
  toInputDate,
  daysBetween,
} from "@/lib/flow/utils";
import FileDropZone from "./FileDropZone";
import dynamic from "next/dynamic";
import type { SelectedParcel } from "./ParcelPickerModal";

// Dynamic import for ParcelPickerModal to avoid SSR issues with mapbox-gl
const ParcelPickerModal = dynamic(() => import("./ParcelPickerModal"), {
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
  additional_splits: [],
  broker_members: [],
};

// Generate a short random ID for local form state
function tempId(): string {
  return "tmp_" + Math.random().toString(36).substring(2, 9);
}

// ── Searchable listing selector (unchanged) ──
function ListingSearch({
  listings,
  loading,
  selectedId,
  onSelect,
  inputCls,
  labelCls,
  highlighted,
}: {
  listings: CRE8Listing[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  inputCls: string;
  labelCls: string;
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
    <div className="mb-6" ref={wrapperRef}>
      <label className={labelCls}>Link to CRE8 Listing</label>
      <div className="relative">
        {/* If a listing is selected, show it as a chip with a clear button */}
        {selected ? (
          <div
            className={`flex items-center justify-between border rounded-btn px-3 py-2 text-sm bg-white transition-all duration-500 ${
              highlighted ? "border-green ring-1 ring-green/30 bg-green/5" : "border-border-light"
            }`}
          >
            <span className="text-charcoal truncate">
              {selected.name}{selected.address ? ` — ${selected.address}` : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                onSelect("");
                setQuery("");
              }}
              className="ml-2 text-muted-gray hover:text-charcoal transition-colors flex-shrink-0"
              title="Clear"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={loading ? "Loading listings..." : "Search by name or address..."}
              disabled={loading}
              className={inputCls}
            />
            {/* Search icon */}
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5"
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
          </>
        )}

        {/* Dropdown results */}
        {open && !selected && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-border-light rounded-btn shadow-lg max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-gray">
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
                  className="w-full text-left px-3 py-2 text-sm hover:bg-light-gray transition-colors border-b border-border-light last:border-0"
                >
                  <span className="font-medium text-charcoal">{l.name}</span>
                  {l.address && (
                    <span className="text-muted-gray ml-1">— {l.address}</span>
                  )}
                  {l.price && l.price !== "Call for Pricing" && l.price !== "Call For Pricing" && (
                    <span className="text-green ml-1">{l.price.startsWith("$") ? l.price : `$${l.price}`}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-gray mt-1">
        Optional — auto-fills name, address, and price from your listing
      </p>
    </div>
  );
}

// ── Main DealForm component ──

export default function DealForm({ deal, onSave, onCancel, saving, mapboxToken, brokerDefaults, userEmail, brokerId, allBrokers, initialHighlightFields, contextBanner }: DealFormProps) {
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

  // ── Parcel picker state ──
  const [showParcelPicker, setShowParcelPicker] = useState(false);
  // Store selected parcels so re-opening the picker zooms back to them
  const [storedParcels, setStoredParcels] = useState<SelectedParcel[]>([]);

  // ── Pending file for SharePoint upload after save ──
  const [pendingFile, setPendingFile] = useState<File | null>(null);

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
        additional_splits: deal.additional_splits || [],
        broker_members: (deal.deal_members || []).map((m) => ({
          broker_id: m.broker_id,
          split_percent: m.split_percent,
        })),
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
    } else if (brokerDefaults) {
      // New deal — pre-fill from broker defaults
      setForm((prev) => ({
        ...prev,
        commission_rate: String(brokerDefaults.commission_rate * 100),
        broker_split: String(brokerDefaults.broker_split * 100),
        additional_splits: brokerDefaults.additional_splits || [],
      }));
      setAdditionalSplits(brokerDefaults.additional_splits || []);

      // Auto-add the current broker as the first member
      if (brokerId) {
        const me = allBrokers?.find((b) => b.id === brokerId);
        setBrokerMembers([{ broker_id: brokerId, broker_name: me?.name || "You", split_percent: null }]);
      }
    }
  }, [deal, brokerDefaults, brokerId, allBrokers]);

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
        "commission_rate", "effective_date", "escrow_open_date", "notes",
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
    if (!dateStr) return "bg-border-medium";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    const days = daysBetween(today, d);
    if (days < 0) return "bg-border-medium";  // past = gray
    if (days <= 3) return "bg-red-500";
    if (days <= 14) return "bg-amber-500";
    return "bg-green";
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

    onSave(formData, apiDates as DealDate[], pendingFile || undefined);
  };

  // Shared input classes — green highlight for AI auto-fill, amber for Kanban drop context
  const inputCls = (field?: string) =>
    `w-full border rounded-btn px-3 py-2 text-sm text-charcoal bg-white transition-all duration-500 ${
      field && highlightedFields.has(field)
        ? "border-green ring-1 ring-green/30 bg-green/5"
        : field && amberFields.has(field)
        ? "border-amber-400 ring-1 ring-amber-300/50 bg-amber-50"
        : "border-border-light"
    }`;
  const labelCls = "block text-sm font-medium text-charcoal mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onCancel} />

      {/* Form modal */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-card border border-border-light p-6 w-full max-w-2xl mx-4 my-8"
      >
        <h2 className="font-bebas text-2xl tracking-wide text-charcoal mb-4">
          {isEditing ? "Edit Deal" : "New Deal"}
        </h2>

        {/* ── Amber context banner (shown after Kanban drag-drop) ── */}
        {contextBanner && (
          <div className="mb-6 p-3 rounded-btn border border-amber-300 bg-amber-50 text-sm text-amber-800 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
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
          inputCls={inputCls("listing_id")}
          labelCls={labelCls}
          highlighted={highlightedFields.has("listing_id")}
        />

        {/* ── Identity ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="md:col-span-2">
            <label className={labelCls}>Deal Name *</label>
            <input
              type="text"
              value={form.deal_name}
              onChange={(e) => update("deal_name", e.target.value)}
              placeholder="e.g. 7th Street Retail"
              className={inputCls("deal_name")}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Property Address</label>
            <div className="flex gap-1">
              <input
                type="text"
                value={form.property_address}
                onChange={(e) => update("property_address", e.target.value)}
                placeholder="123 Main St, Phoenix AZ"
                className={inputCls("property_address")}
              />
              {/* Parcel picker button */}
              {mapboxToken && (
                <button
                  type="button"
                  onClick={() => setShowParcelPicker(true)}
                  className="flex-shrink-0 p-2 border border-border-light rounded-btn text-medium-gray
                             hover:border-green hover:text-green transition-colors duration-200"
                  title="Pick from map"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>Deal Type</label>
            <select
              value={form.deal_type}
              onChange={(e) => update("deal_type", e.target.value as DealType)}
              className={inputCls("deal_type")}
            >
              <option value="sale">Sale</option>
              <option value="lease">Lease</option>
            </select>
          </div>
          {/* APN field — shows when parcel_number has a value */}
          {form.parcel_number && (
            <div className="md:col-span-2">
              <label className={labelCls}>Parcel Number (APN)</label>
              <input
                type="text"
                value={form.parcel_number}
                onChange={(e) => update("parcel_number", e.target.value)}
                className={inputCls("parcel_number")}
                readOnly
              />
            </div>
          )}
        </div>

        {/* ── Brokers on This Deal ── */}
        {allBrokers && allBrokers.length > 0 && (
          <div className="border-t border-border-light pt-4 mb-6">
            <h3 className="font-dm font-semibold text-sm text-charcoal mb-3">Brokers on This Deal</h3>

            {/* Member rows */}
            <div className="space-y-2 mb-3">
              {brokerMembers.map((m) => (
                <div key={m.broker_id} className="flex items-center gap-2">
                  {/* Broker name */}
                  <span className="flex-1 text-sm text-charcoal truncate">
                    {m.broker_name}
                    {m.broker_id === brokerId && (
                      <span className="text-xs text-muted-gray ml-1">(you)</span>
                    )}
                  </span>

                  {/* Split % input */}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="1"
                      value={m.split_percent !== null ? (m.split_percent * 100).toFixed(0) : ""}
                      onChange={(e) => updateMemberSplit(m.broker_id, e.target.value)}
                      placeholder={
                        brokerMembers.length > 1
                          ? (100 / brokerMembers.length).toFixed(0)
                          : "100"
                      }
                      className="w-16 border border-border-light rounded-btn px-2 py-1.5 text-sm text-charcoal text-right"
                    />
                    <span className="text-xs text-muted-gray">%</span>
                  </div>

                  {/* Remove button (can't remove yourself) */}
                  {m.broker_id !== brokerId ? (
                    <button
                      type="button"
                      onClick={() => removeBrokerMember(m.broker_id)}
                      className="text-muted-gray hover:text-red-500 transition-colors p-1"
                      title="Remove broker"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  ) : (
                    // Spacer to keep layout aligned
                    <div className="w-[22px]" />
                  )}
                </div>
              ))}
            </div>

            {/* Even split label */}
            {brokerMembers.length > 1 && !hasExplicitSplits && (
              <p className="text-xs text-muted-gray mb-2">
                Even split — {(100 / brokerMembers.length).toFixed(0)}% each
              </p>
            )}

            {/* Validation warning when splits don't sum to 100% */}
            {hasExplicitSplits && !splitsValid && (
              <p className="text-xs text-red-500 mb-2">
                Splits must total 100% (currently {(brokerMembers.reduce((s, m) => s + (m.split_percent ?? 0) * 100, 0)).toFixed(0)}%)
              </p>
            )}

            {/* Add Broker dropdown */}
            {availableBrokers.length > 0 && (
              <div className="relative" ref={brokerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowBrokerDropdown(!showBrokerDropdown)}
                  className="text-xs text-green hover:text-green/80 transition-colors font-medium"
                >
                  + Add Broker
                </button>

                {showBrokerDropdown && (
                  <div className="absolute z-10 mt-1 w-64 bg-white border border-border-light rounded-btn shadow-lg">
                    {/* Search input */}
                    <input
                      type="text"
                      value={brokerSearch}
                      onChange={(e) => setBrokerSearch(e.target.value)}
                      placeholder="Search brokers..."
                      className="w-full border-b border-border-light px-3 py-2 text-sm text-charcoal"
                      autoFocus
                    />
                    <div className="max-h-36 overflow-y-auto">
                      {filteredAvailBrokers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-gray">No brokers found</div>
                      ) : (
                        filteredAvailBrokers.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => addBrokerMember(b)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-light-gray transition-colors border-b border-border-light last:border-0"
                          >
                            <span className="font-medium text-charcoal">{b.name}</span>
                            <span className="text-muted-gray ml-1 text-xs">{b.email}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Commission ── */}
        <div className="border-t border-border-light pt-4 mb-6">
          <h3 className="font-dm font-semibold text-sm text-charcoal mb-3">Commission</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Price ($)</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                placeholder="2500000"
                className={inputCls("price")}
              />
            </div>
            <div>
              <label className={labelCls}>Commission Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.commission_rate}
                onChange={(e) => update("commission_rate", e.target.value)}
                placeholder="3"
                className={inputCls("commission_rate")}
              />
            </div>
          </div>

          {/* Commission breakdown — shown when price is entered */}
          {previewPrice > 0 && previewRate > 0 && (
            <div className="mt-4 bg-light-gray rounded-btn p-4 space-y-2 text-sm">
              {/* Total commission */}
              <div className="flex justify-between">
                <span className="text-medium-gray">Total Commission ({form.commission_rate}%)</span>
                <span className="font-medium">{formatCurrency(previewCommission)}</span>
              </div>

              {/* House cut */}
              <div className="flex justify-between">
                <span className="text-medium-gray">House (30%)</span>
                <span className="text-medium-gray">−{formatCurrency(previewHouseCut)}</span>
              </div>

              <div className="border-t border-border-light" />

              {/* After house */}
              <div className="flex justify-between">
                <span className="text-medium-gray font-medium">After House</span>
                <span className="font-medium">{formatCurrency(previewAfterHouse)}</span>
              </div>

              {/* Broker splits — show each broker's share */}
              {brokerMembers.length > 1 && (
                <>
                  <div className="border-t border-border-light" />
                  {brokerMembers.map((m) => {
                    const split = m.split_percent !== null ? m.split_percent : 1 / brokerMembers.length;
                    const share = previewAfterHouse * split;
                    const brokerInfo = allBrokers?.find((b) => b.id === m.broker_id);
                    const name = brokerInfo?.name || (m.broker_id === brokerId ? "You" : "Broker");
                    const isYou = m.broker_id === brokerId;
                    return (
                      <div key={m.broker_id} className="flex justify-between">
                        <span className={isYou ? "text-charcoal font-medium" : "text-medium-gray"}>
                          {name} ({(split * 100).toFixed(0)}%)
                        </span>
                        <span className={isYou ? "font-medium" : "text-medium-gray"}>
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
                  <div className="border-t border-border-light" />
                  {additionalSplits
                    .filter((s) => s.label.trim() && s.percent > 0)
                    .map((s, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-medium-gray">{s.label} ({(s.percent * 100).toFixed(0)}%)</span>
                        <span className="text-medium-gray">−{formatCurrency(previewMyShare * s.percent)}</span>
                      </div>
                    ))}
                </>
              )}

              {/* Take-home */}
              <div className="border-t border-border-light pt-1" />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-charcoal">Your Take-Home</span>
                <span className="font-bold text-green text-lg">{formatCurrency(previewTakeHome)}</span>
              </div>
            </div>
          )}

          {/* Additional Splits — editable */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-medium-gray mb-2">Additional Splits</label>
            {additionalSplits.map((split, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={split.label}
                  onChange={(e) => updateSplit(i, { label: e.target.value })}
                  placeholder="e.g. Referral Fee"
                  className="flex-1 border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    value={split.percent ? (split.percent * 100).toFixed(0) : ""}
                    onChange={(e) => updateSplit(i, { percent: (parseFloat(e.target.value) || 0) / 100 })}
                    placeholder="25"
                    className="w-16 border border-border-light rounded-btn px-2 py-1.5 text-sm text-charcoal text-right"
                  />
                  <span className="text-xs text-muted-gray">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeSplit(i)}
                  className="text-muted-gray hover:text-red-500 transition-colors p-1"
                  title="Remove split"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addSplit}
              className="text-xs text-green hover:text-green/80 transition-colors font-medium"
            >
              + Add Split
            </button>
          </div>

          {/* Save as My Defaults button */}
          {userEmail && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={saveDefaults}
                disabled={defaultsSaving}
                className="text-xs text-medium-gray hover:text-green transition-colors font-medium"
              >
                {defaultsSaved ? "Saved!" : defaultsSaving ? "Saving..." : "Save as My Defaults"}
              </button>
            </div>
          )}
        </div>

        {/* ── Critical Dates ── */}
        <div className={`border-t border-border-light pt-4 mb-6 rounded-btn transition-all duration-300 ${
          amberFields.has("deal_dates_section") ? "ring-1 ring-amber-300/50 bg-amber-50/50 p-4 -mx-2" : ""
        }`}>
          <h3 className="font-dm font-semibold text-sm text-charcoal mb-3">Critical Dates</h3>

          {/* Fixed fields: Effective Date + Escrow Open */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Effective Date</label>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => update("effective_date", e.target.value)}
                className={inputCls("effective_date")}
              />
            </div>
            <div>
              <label className={labelCls}>Escrow Open Date</label>
              <input
                type="date"
                value={form.escrow_open_date}
                onChange={(e) => update("escrow_open_date", e.target.value)}
                className={inputCls("escrow_open_date")}
              />
            </div>
          </div>

          {/* Dynamic date rows */}
          <div className="space-y-2">
            {dealDates.map((dd) => (
              <div key={dd.tempId} className="border border-border-light rounded-btn p-3">
                {dd.editing ? (
                  /* ── Inline edit mode ── */
                  <div className="space-y-2">
                    {/* Label with preset dropdown */}
                    <div>
                      <input
                        type="text"
                        value={dd.label}
                        onChange={(e) => updateDateRow(dd.tempId, { label: e.target.value })}
                        placeholder="Date label..."
                        list={`presets-${dd.tempId}`}
                        className="w-full border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal"
                      />
                      <datalist id={`presets-${dd.tempId}`}>
                        {DATE_LABEL_PRESETS.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>

                    {/* Mode toggle */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateDateRow(dd.tempId, { mode: "absolute" })}
                        className={`px-3 py-1 text-xs rounded-btn border transition-colors ${
                          dd.mode === "absolute"
                            ? "bg-green text-black border-green"
                            : "border-border-light text-medium-gray hover:border-green"
                        }`}
                      >
                        Specific date
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDateRow(dd.tempId, { mode: "relative" })}
                        className={`px-3 py-1 text-xs rounded-btn border transition-colors ${
                          dd.mode === "relative"
                            ? "bg-green text-black border-green"
                            : "border-border-light text-medium-gray hover:border-green"
                        }`}
                      >
                        Days after...
                      </button>
                    </div>

                    {/* Date inputs based on mode */}
                    {dd.mode === "absolute" ? (
                      <input
                        type="date"
                        value={dd.date}
                        onChange={(e) => updateDateRow(dd.tempId, { date: e.target.value })}
                        className="w-full border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal"
                      />
                    ) : (
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={dd.offset_days || ""}
                          onChange={(e) =>
                            updateDateRow(dd.tempId, { offset_days: parseInt(e.target.value) || null })
                          }
                          placeholder="30"
                          className="w-20 border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal"
                        />
                        <span className="text-xs text-muted-gray">days after</span>
                        <select
                          value={dd.offset_from || "escrow_open"}
                          onChange={(e) => updateDateRow(dd.tempId, { offset_from: e.target.value })}
                          className="flex-1 border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal"
                        >
                          {getRefOptions(dd.tempId).map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Resolved date preview (for relative mode) */}
                    {dd.mode === "relative" && dd.date && (
                      <p className="text-xs text-muted-gray">
                        Resolves to: <span className="font-medium text-charcoal">{formatPreviewDate(dd.date)}</span>
                      </p>
                    )}

                    {/* Done / Delete buttons */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => updateDateRow(dd.tempId, { editing: false })}
                        className="px-3 py-1 text-xs font-medium bg-green text-black uppercase tracking-wide rounded-btn
                                   hover:bg-green/90 transition-colors"
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDateRow(dd.tempId)}
                        className="px-3 py-1 text-xs font-medium text-red-500 border border-red-200 rounded-btn
                                   hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Display mode ── */
                  <div className="flex items-center gap-3">
                    {/* Urgency dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getUrgencyColor(dd.date)}`} />

                    {/* Label + date */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-charcoal truncate">{dd.label || "Untitled"}</span>
                        <span className="text-sm text-charcoal flex-shrink-0">
                          {formatPreviewDate(dd.date)}
                        </span>
                      </div>
                      {dd.mode === "relative" && dd.offset_days && (
                        <span className="text-xs text-muted-gray">
                          {dd.offset_days} days after {getRefLabel(dd.offset_from)}
                        </span>
                      )}
                    </div>

                    {/* Edit / Delete buttons */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => updateDateRow(dd.tempId, { editing: true })}
                        className="p-1 text-muted-gray hover:text-green transition-colors"
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDateRow(dd.tempId)}
                        className="p-1 text-muted-gray hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add Date button */}
            <button
              type="button"
              onClick={addDateRow}
              className="text-xs text-green hover:text-green/80 transition-colors font-medium mt-1"
            >
              + Add Date
            </button>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="border-t border-border-light pt-4 mb-6">
          <label className={labelCls}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className={`${inputCls("notes")} resize-none`}
            placeholder="Any additional details..."
          />
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-3 justify-end border-t border-border-light pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-medium-gray border border-border-light rounded-btn
                       hover:border-border-medium transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.deal_name.trim() || (hasExplicitSplits && !splitsValid)}
            className="px-6 py-2 text-sm font-semibold bg-green text-black uppercase tracking-wide rounded-btn
                       hover:bg-green/90 transition-colors duration-200 disabled:opacity-50"
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Deal"}
          </button>
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
    </div>
  );
}
