"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import {
  getDocTypeBySlug,
  getVariableMap,
  getFieldSections,
  SP_DRAFTS_FOLDER,
  CMS_API_BASE,
  CRE8_TEAM,
  FieldSection,
} from "@/lib/constants";
import { VariableDef, CmsTeamMember, CmsListing } from "@/lib/types";
import { BrokerEntry, BROKER_DIRECTORY } from "@/lib/broker-directory";
import { graphScopes } from "@/lib/msal-config";
import {
  getSiteId,
  getDriveId,
  uploadToSharePoint,
  getWordUrl,
} from "@/lib/graph";
import {
  numberToWritten,
  dollarToWritten,
  formatCurrency,
} from "@/lib/number-to-words";
import LoadingSpinner from "@/components/LoadingSpinner";
import DocPreview from "@/components/DocPreview";
import FolderPicker from "@/components/FolderPicker";
import SharePointBreadcrumb from "@/components/SharePointBreadcrumb";
import AIAssistBar from "@/components/AIAssistBar";
import dynamic from "next/dynamic";
import type { ParcelSelection, SelectedParcel } from "@/components/ParcelPickerModal";

// Dynamic import — mapbox-gl accesses `window` so it can't render on the server
const ParcelPickerModal = dynamic(() => import("@/components/ParcelPickerModal"), {
  ssr: false,
});

type PageState = "preview" | "saving" | "saved" | "error";
// Mobile tabs: "form" shows the edit sidebar, "preview" shows the doc
type MobileTab = "form" | "preview";

// localStorage key for remembering the user's chosen folder
const LS_FOLDER_KEY = "cre8_docs_save_folder";

// Helper — is this token a dollar-amount field?
// Currency formatting is deferred to onBlur for these fields so typing isn't disrupted.
function isDollarToken(token: string): boolean {
  if (token === "price_per_unit") return false; // Display-only token, not a dollar input
  if (token === "listing_price_display") return false; // Auto-computed display token
  if (token === "commission_pct_display") return false; // Auto-computed commission display
  if (token === "commission_reduced_pct_display") return false; // Auto-computed commission display
  return (
    token.includes("money") ||
    token.includes("deposit") ||
    token.includes("price") ||
    token === "base_rent_psf" ||
    token === "ti_allowance_psf"
  );
}

// ── Collapsible section card for the field sidebar ──
function CollapsibleSection({
  section,
  varMap,
  writtenTokens,
  fieldValues,
  onFieldChange,
  onFieldBlur,
  aiFillingTokens,
  sectionRef,
  strictMode,
  verifiedFields,
  onToggleVerify,
}: {
  section: FieldSection;
  varMap: Map<string, VariableDef>;
  writtenTokens: Set<string>;
  fieldValues: Record<string, string>;
  onFieldChange: (token: string, value: string) => void;
  onFieldBlur: (token: string) => void;
  aiFillingTokens: Set<string>;
  sectionRef?: (title: string, el: HTMLDivElement | null) => void;
  strictMode?: boolean;
  verifiedFields?: Set<string>;
  onToggleVerify?: (token: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // Filter out written variant tokens and auto-computed tokens — they're not editable
  const editableTokens = section.tokens.filter((t) => {
    if (writtenTokens.has(t)) return false;
    const def = varMap.get(t);
    if (def?.source === "auto") return false;
    return true;
  });

  // Count filled fields
  const filledCount = editableTokens.filter(
    (t) => fieldValues[t] && fieldValues[t].trim() !== ""
  ).length;

  // Auto-expand if any token in this section is being AI-filled
  useEffect(() => {
    const hasFillingToken = editableTokens.some((t) => aiFillingTokens.has(t));
    if (hasFillingToken && !expanded) {
      setExpanded(true);
    }
  }, [aiFillingTokens, editableTokens, expanded]);

  return (
    <div
      ref={(el) => sectionRef?.(section.title, el)}
      className="bg-dark-gray border border-border-gray rounded-card overflow-hidden"
    >
      {/* Section header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-charcoal transition-colors"
      >
        <span className="text-white text-sm font-semibold">{section.title}</span>
        <div className="flex items-center gap-2">
          <span className="text-medium-gray text-xs">
            {filledCount}/{editableTokens.length}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-medium-gray transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Fields — shown when expanded */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {editableTokens.map((token) => {
            const def = varMap.get(token);
            const label = def?.label || token.replace(/_/g, " ");
            const isFilling = aiFillingTokens.has(token);
            const isDollar = !!(def?.numberField && isDollarToken(token));
            const hasFillValue = !!(fieldValues[token] && fieldValues[token].trim());
            const isVerified = verifiedFields?.has(token) ?? false;

            return (
              <div
                key={token}
                className={`transition-all duration-300 ${
                  isFilling ? "ai-filling" : ""
                }`}
              >
                <label className="block text-medium-gray text-xs mb-1">
                  {label}
                  {/* Small hint for dollar fields: formatting happens when you leave the input */}
                  {isDollar && (
                    <span className="text-border-gray ml-1 font-normal">
                      — type number, formats on exit
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={fieldValues[token] || ""}
                    onChange={(e) => onFieldChange(token, e.target.value)}
                    onBlur={() => onFieldBlur(token)}
                    placeholder={isDollar ? "e.g. 2500000" : ""}
                    className={`flex-1 bg-charcoal border rounded px-3 py-1.5
                               text-white text-sm transition-all duration-300
                               focus:border-green
                               ${isFilling
                                 ? "border-green shadow-[0_0_8px_rgba(140,198,68,0.3)]"
                                 : "border-border-gray"
                               }`}
                  />
                  {/* Verification checkmark — strict mode only */}
                  {strictMode && onToggleVerify && (
                    <button
                      type="button"
                      onClick={() => onToggleVerify(token)}
                      disabled={!hasFillValue}
                      title={
                        !hasFillValue ? "Fill field first" :
                        isVerified ? "Verified — click to un-verify" :
                        "Click to verify this field"
                      }
                      className={`flex-shrink-0 w-7 h-7 rounded flex items-center justify-center transition-all duration-200
                        ${!hasFillValue
                          ? "bg-charcoal border border-border-gray text-border-gray cursor-not-allowed"
                          : isVerified
                            ? "bg-green/15 border border-green text-green hover:bg-green/25"
                            : "bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/20"
                        }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17L4 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Seller Broker Typeahead — searchable input with dropdown results ──
function SellerBrokerTypeahead({
  onSelect,
}: {
  onSelect: (broker: BrokerEntry | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [selectedBroker, setSelectedBroker] = useState<BrokerEntry | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter brokers by case-insensitive substring match on name or company, cap at 12
  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return BROKER_DIRECTORY.filter((b) =>
      b.name.toLowerCase().includes(q) || b.company.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Pick a broker from the dropdown
  function selectBroker(broker: BrokerEntry) {
    setSelectedBroker(broker);
    setQuery(broker.name);
    setIsOpen(false);
    setHighlightIdx(-1);
    onSelect(broker);
  }

  // Clear the selection
  function clearSelection() {
    setSelectedBroker(null);
    setQuery("");
    setIsOpen(false);
    setHighlightIdx(-1);
    onSelect(null);
    inputRef.current?.focus();
  }

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || filtered.length === 0) {
      if (e.key === "Escape") setIsOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      selectBroker(filtered[highlightIdx]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  // On blur: if user typed a name not in the list, still use it as seller_broker_name
  function handleBlur() {
    // Small delay so click on dropdown item registers before blur closes it
    setTimeout(() => {
      if (!selectedBroker && query.trim()) {
        onSelect({ name: query.trim(), company: "", email: "", phone: "" });
      }
    }, 200);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIdx(-1);
            // If they edit after selecting, clear the selection
            if (selectedBroker) setSelectedBroker(null);
          }}
          onFocus={() => { if (query.trim()) setIsOpen(true); }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search seller broker..."
          className="w-full bg-charcoal border border-border-gray rounded px-3 py-1.5 pr-7
                     text-white text-sm focus:border-green transition-colors
                     placeholder:text-border-gray"
        />
        {/* Clear button (X) — only shows when there's text */}
        {query && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-medium-gray hover:text-white transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-charcoal border border-border-gray rounded shadow-lg max-h-64 overflow-y-auto">
          {filtered.map((broker, idx) => (
            <button
              key={`${broker.name}-${broker.company}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectBroker(broker)}
              onMouseEnter={() => setHighlightIdx(idx)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                idx === highlightIdx ? "bg-dark-gray" : "hover:bg-dark-gray"
              }`}
            >
              <span className="text-white truncate">{broker.name}</span>
              <span className="text-medium-gray text-xs ml-2 truncate max-w-[45%] text-right">{broker.company}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CMS Dropdowns section (collapsible) ──
function CmsDropdowns({
  teamMembers,
  listings,
  loadingCms,
  selectedCre8Broker,
  selectedListing,
  onCre8BrokerChange,
  onSellerBrokerChange,
  onListingChange,
}: {
  teamMembers: CmsTeamMember[];
  listings: CmsListing[];
  loadingCms: boolean;
  selectedCre8Broker: string;
  selectedListing: string;
  onCre8BrokerChange: (id: string) => void;
  onSellerBrokerChange: (broker: BrokerEntry | null) => void;
  onListingChange: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-dark-gray border border-border-gray rounded-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-charcoal transition-colors"
      >
        <span className="text-white text-sm font-semibold">Brokers & Listing</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-medium-gray transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* CRE8 Broker */}
          <div>
            <label className="block text-medium-gray text-xs mb-1">CRE8 Broker (you)</label>
            <select
              value={selectedCre8Broker}
              onChange={(e) => onCre8BrokerChange(e.target.value)}
              disabled={loadingCms}
              className="w-full bg-charcoal border border-border-gray rounded px-3 py-1.5
                         text-white text-sm focus:border-green transition-colors
                         disabled:opacity-50"
            >
              <option value="">Select broker...</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Seller Broker — searchable typeahead */}
          <div>
            <label className="block text-medium-gray text-xs mb-1">
              Seller Broker <span className="text-border-gray">(optional)</span>
            </label>
            <SellerBrokerTypeahead onSelect={onSellerBrokerChange} />
          </div>

          {/* CRE8 Listing */}
          <div>
            <label className="block text-medium-gray text-xs mb-1">
              CRE8 Listing <span className="text-border-gray">(pre-fills address)</span>
            </label>
            <select
              value={selectedListing}
              onChange={(e) => onListingChange(e.target.value)}
              disabled={loadingCms}
              className="w-full bg-charcoal border border-border-gray rounded px-3 py-1.5
                         text-white text-sm focus:border-green transition-colors
                         disabled:opacity-50"
            >
              <option value="">None</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>{l.name || l.address}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Field Sidebar — AI bar + CMS dropdowns + field sections ──
function FieldSidebar({
  docTypeId,
  sections,
  writtenTokens,
  varMap,
  fieldValues,
  onFieldChange,
  onFieldBlur,
  aiFillingTokens,
  sectionRefs,
  cmsContext,
  onExtracted,
  onExtracting,
  teamMembers,
  listings,
  loadingCms,
  selectedCre8Broker,
  selectedListing,
  onCre8BrokerChange,
  onSellerBrokerChange,
  onListingChange,
  isAiExtracting,
  onOpenParcelPicker,
  strictMode,
  verifiedFields,
  onToggleVerify,
  hasParcelMapImage,
  includeParcelMap,
  onToggleParcelMap,
}: {
  docTypeId: string;
  sections: FieldSection[];
  writtenTokens: Set<string>;
  varMap: Map<string, VariableDef>;
  fieldValues: Record<string, string>;
  onFieldChange: (token: string, value: string) => void;
  onFieldBlur: (token: string) => void;
  aiFillingTokens: Set<string>;
  sectionRefs: (title: string, el: HTMLDivElement | null) => void;
  cmsContext: {
    sellerBroker: { name: string; email: string; phone: string } | null;
    cre8Broker: { name: string; email: string; phone: string } | null;
    listing: { name: string; address: string } | null;
  };
  onExtracted: (variables: Record<string, string>) => void;
  onExtracting: (isExtracting: boolean) => void;
  teamMembers: CmsTeamMember[];
  listings: CmsListing[];
  loadingCms: boolean;
  selectedCre8Broker: string;
  selectedListing: string;
  onCre8BrokerChange: (id: string) => void;
  onSellerBrokerChange: (broker: BrokerEntry | null) => void;
  onListingChange: (id: string) => void;
  isAiExtracting: boolean;
  onOpenParcelPicker: () => void;
  strictMode?: boolean;
  verifiedFields?: Set<string>;
  onToggleVerify?: (token: string) => void;
  /** Whether a parcel map image is available */
  hasParcelMapImage?: boolean;
  /** Whether the "include parcel map" toggle is on */
  includeParcelMap?: boolean;
  /** Toggle handler for including the parcel map in the document */
  onToggleParcelMap?: () => void;
}) {
  return (
    <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 180px)" }}>
      {/* AI Assist Bar */}
      <AIAssistBar
        docTypeId={docTypeId}
        cmsContext={cmsContext}
        onExtracted={onExtracted}
        onExtracting={onExtracting}
      />

      {/* Shimmer overlay when AI is extracting */}
      {isAiExtracting && (
        <div className="text-center py-2">
          <div className="inline-flex items-center gap-2 text-green text-xs">
            <div className="w-3 h-3 border-2 border-green border-t-transparent rounded-full animate-spin" />
            AI is analyzing...
          </div>
        </div>
      )}

      {/* Verification reminder banner — strict mode only */}
      {strictMode && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2 text-yellow-500 text-xs">
          Verify all filled fields before saving
        </div>
      )}

      {/* Section header */}
      <h2 className="font-bebas text-lg tracking-wide text-medium-gray mb-1">
        EDIT FIELDS
      </h2>

      {/* Field sections — inject helpers before Property and Date & Brokers sections */}
      {sections.map((section) => (
        <div key={section.title}>
          {/* CMS Dropdowns right before the Date & Brokers section — flexible mode only */}
          {!strictMode && section.title === "Date & Brokers" && (
            <CmsDropdowns
              teamMembers={teamMembers}
              listings={listings}
              loadingCms={loadingCms}
              selectedCre8Broker={selectedCre8Broker}
              selectedListing={selectedListing}
              onCre8BrokerChange={onCre8BrokerChange}
              onSellerBrokerChange={onSellerBrokerChange}
              onListingChange={onListingChange}
            />
          )}
          {/* "Select from Map" button + parcel map toggle at the top of the Property section */}
          {section.title === "Property" && (
            <div className="mb-2 space-y-2">
              <button
                onClick={onOpenParcelPicker}
                className="flex items-center gap-1.5 text-green text-xs font-medium hover:brightness-125 transition-all"
              >
                {/* Map pin icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Select from Map
              </button>
              {/* Toggle: include parcel map image in document — only visible when an image exists */}
              {hasParcelMapImage && onToggleParcelMap && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includeParcelMap}
                      onClick={onToggleParcelMap}
                      className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                        includeParcelMap ? "bg-green" : "bg-dark-gray border border-border-gray"
                      }`}
                    >
                      <span
                        className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-200 ${
                          includeParcelMap ? "translate-x-[14px]" : ""
                        }`}
                      />
                    </button>
                    <span className="text-xs text-medium-gray group-hover:text-white transition-colors">
                      Attach parcel map to document
                    </span>
                  </label>
                  <p className="text-[10px] text-border-gray leading-tight pl-10">
                    Satellite image of the selected parcel(s) will appear at the end of the downloaded document.
                  </p>
                </div>
              )}
            </div>
          )}
          <CollapsibleSection
            section={section}
            varMap={varMap}
            writtenTokens={writtenTokens}
            fieldValues={fieldValues}
            onFieldChange={onFieldChange}
            onFieldBlur={onFieldBlur}
            aiFillingTokens={aiFillingTokens}
            sectionRef={sectionRefs}
            strictMode={strictMode}
            verifiedFields={verifiedFields}
            onToggleVerify={onToggleVerify}
          />
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════
// ── Main Complete Page Component ──
// ══════════════════════════════════════════════════
export default function CompletePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;
  const docType = getDocTypeBySlug(slug);
  const { instance, accounts } = useMsal();

  // Page state
  const [pageState, setPageState] = useState<PageState>("preview");
  const [sharePointUrl, setSharePointUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  // Mobile tab — "form" shows the edit sidebar, "preview" shows the document
  // Defaults to "form" so users start on the edit fields screen on mobile
  const [mobileTab, setMobileTab] = useState<MobileTab>("form");

  // Field editing state
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [clausePayload, setClausePayload] = useState<
    { id: string; included: boolean; variables: Record<string, string>; customText?: string }[]
  >([]);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isAiExtracting, setIsAiExtracting] = useState(false);

  // AI animation state — tracks which tokens are currently being animated
  const [aiFillingTokens, setAiFillingTokens] = useState<Set<string>>(new Set());

  // Strict mode: is this a listing agreement (legal doc requiring field verification)?
  const isStrictMode = docType?.mode === "strict";

  // Verification state — tracks which fields the user has explicitly confirmed (strict mode only)
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());

  // Track which per-unit price was last manually entered (for LOI Land display)
  // "per_acre" | "per_sqft" | null — determines what shows in {{price_per_unit}}
  const lastPriceModeRef = useRef<string | null>(null);

  // Team members (hardcoded) + CMS listings
  const teamMembers = CRE8_TEAM;
  const [listings, setListings] = useState<CmsListing[]>([]);
  const [loadingCms, setLoadingCms] = useState(true);
  const [selectedCre8Broker, setSelectedCre8Broker] = useState("");
  const [selectedListing, setSelectedListing] = useState("");

  // Ref that mirrors fieldValues — the debounced callback reads from here
  // to always get the latest values (avoids stale closure)
  const fieldValuesRef = useRef<Record<string, string>>({});

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Track if initial generation has been triggered
  const initialGenTriggered = useRef(false);

  // Section element refs for scrolling during AI animation
  const sectionElRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sectionRefCallback = useCallback((title: string, el: HTMLDivElement | null) => {
    if (el) {
      sectionElRefs.current.set(title, el);
    } else {
      sectionElRefs.current.delete(title);
    }
  }, []);

  // Save folder — check localStorage first, then fall back to constant
  const [saveFolder, setSaveFolder] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_FOLDER_KEY) || SP_DRAFTS_FOLDER;
    }
    return SP_DRAFTS_FOLDER;
  });

  // Folder picker modal state
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Parcel picker modal state
  const [showParcelPicker, setShowParcelPicker] = useState(false);
  // Store selected parcels so re-opening the picker zooms back to them
  const [storedParcels, setStoredParcels] = useState<SelectedParcel[]>([]);
  // Base64 PNG of the map canvas captured when parcels are confirmed
  const [parcelMapImage, setParcelMapImage] = useState<string>("");
  // Toggle — whether to include the parcel map image in the generated document
  const [includeParcelMap, setIncludeParcelMap] = useState(true);

  // Graph API IDs (fetched once when needed)
  const [driveId, setDriveId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  // Variable metadata for the field sidebar (memoized so hooks don't re-fire)
  const varDefs = useMemo(
    () => (docType ? getVariableMap(docType.id) : []),
    [docType]
  );
  const sections = useMemo(
    () => (docType ? getFieldSections(docType.id) : []),
    [docType]
  );
  const varMap = useMemo(
    () => new Map(varDefs.map((v) => [v.token, v])),
    [varDefs]
  );
  const writtenTokens = useMemo(
    () => new Set(varDefs.filter((v) => v.writtenVariant).map((v) => v.writtenVariant!)),
    [varDefs]
  );

  // ── Build CMS context for AI bar (derived from selected dropdowns + field values) ──
  const cmsContext = useMemo(() => {
    const cre8Broker = teamMembers.find((m) => m.id === selectedCre8Broker);
    const listing = listings.find((l) => l.id === selectedListing);
    // Seller broker comes from field values (populated by typeahead)
    const sbName = fieldValues.seller_broker_name;
    return {
      cre8Broker: cre8Broker ? { name: cre8Broker.name, email: cre8Broker.email, phone: cre8Broker.phone } : null,
      sellerBroker: sbName ? { name: sbName, email: fieldValues.seller_broker_email || "", phone: "" } : null,
      listing: listing ? { name: listing.name, address: listing.address } : null,
    };
  }, [teamMembers, listings, selectedCre8Broker, selectedListing, fieldValues]);

  // ── Build default field values from variable definitions ──
  const buildDefaultValues = useCallback(() => {
    const defaults: Record<string, string> = {};

    // Today's date formatted
    const today = new Date();
    const dateFormatted = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    for (const varDef of varDefs) {
      if (varDef.token === "date") {
        defaults[varDef.token] = dateFormatted;
      } else if (varDef.defaultValue) {
        defaults[varDef.token] = varDef.defaultValue;
      } else {
        defaults[varDef.token] = "";
      }
    }

    // Set defaults for listing docs (sale + sale/lease have price display)
    if (docType?.id === "listing_sale" || docType?.id === "listing_sale_lease") {
      defaults.listing_price_display = "The proposed sale price to be determined.";

      // Auto-populate term_start = today, term_end = 1 year from today
      const termStart = new Date();
      const termEnd = new Date();
      termEnd.setFullYear(termEnd.getFullYear() + 1);
      defaults.term_start = termStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      defaults.term_end = termEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }

    // Set defaults for lease-only listing agreement (commission display auto-computed)
    if (docType?.id === "listing_lease") {
      // Auto-populate term_start = today, term_end = 1 year from today
      const termStart = new Date();
      const termEnd = new Date();
      termEnd.setFullYear(termEnd.getFullYear() + 1);
      defaults.term_start = termStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      defaults.term_end = termEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

      // Commission display defaults — "Five percent (5%)" / "Three percent (3%)"
      const pct = parseInt(defaults.commission_pct || "5") || 5;
      const reducedPct = parseInt(defaults.commission_reduced_pct || "3") || 3;
      defaults.commission_pct_display = `${numberToWritten(String(pct))} percent (${pct}%)`;
      defaults.commission_reduced_pct_display = `${numberToWritten(String(reducedPct))} percent (${reducedPct}%)`;
      // Capitalize first letter
      defaults.commission_pct_display = defaults.commission_pct_display.charAt(0).toUpperCase() + defaults.commission_pct_display.slice(1);
      defaults.commission_reduced_pct_display = defaults.commission_reduced_pct_display.charAt(0).toUpperCase() + defaults.commission_reduced_pct_display.slice(1);
    }

    // Format currency and compute written variants for defaulted number fields
    for (const varDef of varDefs) {
      if (varDef.numberField && defaults[varDef.token]) {
        const isDollar = isDollarToken(varDef.token);
        if (isDollar) {
          defaults[varDef.token] = formatCurrency(defaults[varDef.token]);
          if (varDef.writtenVariant) {
            defaults[varDef.writtenVariant] = dollarToWritten(defaults[varDef.token]);
          }
        } else if (varDef.writtenVariant) {
          defaults[varDef.writtenVariant] = numberToWritten(defaults[varDef.token]);
        }
      }
    }

    return defaults;
  }, [varDefs]);

  // ── Generate a file name from current field values ──
  // Prefix varies by doc type: LOI_ for LOIs, Listing_Agreement_Sale_ for listing sale, etc.
  const buildFileName = useCallback((values: Record<string, string>) => {
    const address = (values.property_address || "Draft")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
    const dateStr = new Date().toISOString().split("T")[0];
    let prefix = "LOI_";
    if (docType?.id === "listing_sale") prefix = "Listing_Agreement_Sale_";
    else if (docType?.id === "listing_sale_lease") prefix = "Listing_Agreement_Sale_Lease_";
    else if (docType?.id === "listing_lease") prefix = "Listing_Agreement_Lease_";
    return `${prefix}${address}_${dateStr}.docx`;
  }, [docType]);

  // ── Initialize: load from sessionStorage OR build defaults ──
  useEffect(() => {
    if (!docType) return;

    // Check sessionStorage for existing payload (back-navigation or refresh case)
    const storedDoc = sessionStorage.getItem(`generated_${docType.id}`);
    const storedPayload = sessionStorage.getItem(`generate_payload_${docType.id}`);

    if (storedDoc && storedPayload) {
      // Restore from sessionStorage
      const parsedDoc = JSON.parse(storedDoc);
      const parsedPayload = JSON.parse(storedPayload);
      setFileName(parsedDoc.fileName);
      setFileBase64(parsedDoc.fileBase64);
      setFieldValues(parsedPayload.variables || {});
      fieldValuesRef.current = parsedPayload.variables || {};
      setClausePayload(parsedPayload.clauses || []);
      setInitialLoading(false);
    } else {
      // Fresh visit — build defaults and generate initial preview
      const defaults = buildDefaultValues();
      setFieldValues(defaults);
      fieldValuesRef.current = defaults;
      setFileName(buildFileName(defaults));

      // Generate the initial preview with defaults
      if (!initialGenTriggered.current) {
        initialGenTriggered.current = true;
        generateInitialPreview(defaults);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  // ── Generate the first preview on mount ──
  async function generateInitialPreview(defaults: Record<string, string>) {
    if (!docType) return;

    try {
      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docType.id,
          variables: defaults,
          clauses: [],
        }),
      });

      if (!res.ok) throw new Error("Initial generation failed");

      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setFileBase64(base64);
        setInitialLoading(false);

        // Cache in sessionStorage
        const fName = buildFileName(defaults);
        setFileName(fName);
        sessionStorage.setItem(
          `generated_${docType.id}`,
          JSON.stringify({ fileBase64: base64, fileName: fName, docType: docType.id })
        );
        sessionStorage.setItem(
          `generate_payload_${docType.id}`,
          JSON.stringify({ variables: defaults, clauses: [] })
        );
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Initial preview generation error:", err);
      setInitialLoading(false);
    }
  }

  // ── Fetch CMS listings (team members are hardcoded in constants.ts) ──
  useEffect(() => {
    async function fetchListings() {
      try {
        const listingsRes = await fetch(`${CMS_API_BASE}/listings`);

        if (listingsRes.ok) {
          const listingsData = await listingsRes.json();
          const items: CmsListing[] = (listingsData.items || []).map(
            (item: Record<string, unknown>) => ({
              id: item.id || (item as Record<string, unknown>)._id,
              name: (item as Record<string, Record<string, string>>).fieldData?.name || (item as Record<string, string>).name || "",
              address: (item as Record<string, Record<string, string>>).fieldData?.["property-address"] ||
                       (item as Record<string, string>)["property-address"] || "",
              slug: (item as Record<string, Record<string, string>>).fieldData?.slug || (item as Record<string, string>).slug || "",
            })
          );
          setListings(items);
        }
      } catch (err) {
        console.error("Error fetching CMS listings:", err);
      } finally {
        setLoadingCms(false);
      }
    }

    fetchListings();
  }, []);

  // ── Auto-detect logged-in broker from MSAL account ──
  useEffect(() => {
    if (teamMembers.length === 0) return;

    const account = instance.getActiveAccount() || accounts[0];
    if (!account?.username) return;

    // Match the MSAL email against team members
    const email = account.username.toLowerCase();
    const match = teamMembers.find((m) => m.email.toLowerCase() === email);

    if (match && !selectedCre8Broker) {
      setSelectedCre8Broker(match.id);
      // Auto-fill broker fields
      setFieldValues((prev) => {
        const updated = {
          ...prev,
          broker_names: match.name,
          cre8_agent_email: match.email,
          cre8_agent_phone: match.phone,
        };
        fieldValuesRef.current = updated;
        return updated;
      });
      // Trigger a regen so the preview shows the broker info
      triggerDebouncedRegen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMembers, accounts]);

  // ── Pre-fetch Graph API token and drive ID ──
  useEffect(() => {
    const account = accounts[0];
    if (!account) return;

    async function fetchGraphIds() {
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          ...graphScopes,
          account: accounts[0],
        });
        setAccessToken(tokenResponse.accessToken);

        const siteId = await getSiteId(tokenResponse.accessToken);
        const drive = await getDriveId(tokenResponse.accessToken, siteId);
        setDriveId(drive);
      } catch (err) {
        console.error("Failed to pre-fetch Graph IDs:", err);
      }
    }

    fetchGraphIds();
  }, [instance, accounts]);

  // Persist folder choice to localStorage
  function updateSaveFolder(folder: string) {
    setSaveFolder(folder);
    localStorage.setItem(LS_FOLDER_KEY, folder);
  }

  // Convert base64 data URL to ArrayBuffer
  function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
    const base64Data = dataUrl.split(",")[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // ── Regenerate the document with updated field values ──
  const regenerateDocument = useCallback(async () => {
    if (!docType) return;
    setIsRegenerating(true);

    try {
      // Read latest values from the ref (not state — avoids stale closure)
      const currentValues = { ...fieldValuesRef.current };

      // Auto-format dollar fields before sending to the template.
      // Blur normally triggers formatting, but the debounce can fire while
      // the user is still typing (before blur). This ensures the generated
      // doc always shows "$X,XXX" even if the field hasn't been blurred yet.
      for (const varDef of varDefs) {
        if (varDef.numberField && isDollarToken(varDef.token) && currentValues[varDef.token]) {
          const raw = currentValues[varDef.token];
          // PSF fields keep 2 decimal places: "38" → "$38.00"
          const isPsf = varDef.token === "base_rent_psf" || varDef.token === "ti_allowance_psf";
          if (isPsf) {
            const cleaned = raw.replace(/[$,]/g, "").trim();
            const n = parseFloat(cleaned);
            currentValues[varDef.token] = isNaN(n) ? raw : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          } else {
            currentValues[varDef.token] = formatCurrency(raw);
          }
          if (varDef.writtenVariant) {
            currentValues[varDef.writtenVariant] = dollarToWritten(raw);
          }
        }
      }

      // Ensure listing_price_display is up-to-date before generation
      const isListingDoc = docType.id === "listing_sale" || docType.id === "listing_sale_lease";
      if (isListingDoc) {
        const finalPrice = parseFloat((currentValues.listing_price || "").replace(/[$,]/g, "")) || 0;
        const finalPerAcre = parseFloat((currentValues.price_per_acre || "").replace(/[$,]/g, "")) || 0;
        if (finalPrice > 0 && finalPerAcre > 0) {
          currentValues.listing_price_display = `${formatCurrency(String(finalPrice))} (${formatCurrency(String(finalPerAcre))} per acre)`;
        } else if (finalPrice > 0) {
          currentValues.listing_price_display = formatCurrency(String(finalPrice));
        } else {
          currentValues.listing_price_display = "The proposed sale price to be determined.";
        }
      }

      // Ensure commission display strings are up-to-date for lease listing agreement
      if (docType.id === "listing_lease") {
        const pctVal = parseInt((currentValues.commission_pct || "").replace(/[^0-9]/g, "")) || 0;
        const reducedVal = parseInt((currentValues.commission_reduced_pct || "").replace(/[^0-9]/g, "")) || 0;
        if (pctVal > 0) {
          const pctDisplay = `${numberToWritten(String(pctVal))} percent (${pctVal}%)`;
          currentValues.commission_pct_display = pctDisplay.charAt(0).toUpperCase() + pctDisplay.slice(1);
        }
        if (reducedVal > 0) {
          const reducedDisplay = `${numberToWritten(String(reducedVal))} percent (${reducedVal}%)`;
          currentValues.commission_reduced_pct_display = reducedDisplay.charAt(0).toUpperCase() + reducedDisplay.slice(1);
        }
      }

      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docType.id,
          variables: currentValues,
          clauses: clausePayload,
          // Include parcel map image if toggle is on and we have a capture
          ...(includeParcelMap && parcelMapImage ? { parcelMapImage } : {}),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Regeneration failed");
      }

      // Convert the response blob to base64 for DocPreview
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setFileBase64(base64);
        setIsRegenerating(false);

        // Update filename based on current address
        const fName = buildFileName(currentValues);
        setFileName(fName);

        // Also update sessionStorage so a page refresh keeps the latest version
        sessionStorage.setItem(
          `generated_${docType.id}`,
          JSON.stringify({
            fileBase64: base64,
            fileName: fName,
            docType: docType.id,
          })
        );
        sessionStorage.setItem(
          `generate_payload_${docType.id}`,
          JSON.stringify({ variables: currentValues, clauses: clausePayload })
        );
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Regeneration error:", err);
      setIsRegenerating(false);
    }
  }, [docType, clausePayload, buildFileName, varDefs, includeParcelMap, parcelMapImage]);

  // ── Helper to trigger a debounced regen ──
  const triggerDebouncedRegen = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      regenerateDocument();
    }, 1500);
  }, [regenerateDocument]);

  // ── Handle a field value change (with debounced regen) ──
  // NOTE: Dollar fields (price, money, deposit) are NOT formatted here —
  // formatting is deferred to onBlur so the user can type freely.
  const handleFieldChange = useCallback(
    (token: string, value: string) => {
      setFieldValues((prev) => {
        const updated = { ...prev, [token]: value };

        const def = varMap.get(token);
        if (def?.numberField) {
          const isDollar = isDollarToken(token);
          // For non-dollar number fields (e.g. day counts): compute writtenVariant live
          // Dollar fields skip formatting here — handled in handleFieldBlur instead
          if (!isDollar && def.writtenVariant) {
            updated[def.writtenVariant] = numberToWritten(value);
          }
        }

        // ── LOI Land: auto-calc between total price, per acre, and per SF ──
        // Strip "$" and commas to get raw number for math
        const stripCurrency = (v: string) => parseFloat((v || "").replace(/[$,]/g, "")) || 0;
        const priceTokens = ["purchase_price", "price_per_acre", "price_per_sqft"];

        if (priceTokens.includes(token) || token === "acreage") {
          const acreage = stripCurrency(token === "acreage" ? value : (updated.acreage || ""));
          const totalSqft = acreage * 43560; // 1 acre = 43,560 SF

          if (token === "price_per_acre" && acreage > 0) {
            // User typed per acre → calc total and per SF
            lastPriceModeRef.current = "per_acre";
            const perAcre = stripCurrency(value);
            if (perAcre > 0) {
              updated.purchase_price = formatCurrency(String(Math.round(perAcre * acreage)));
              updated.price_per_sqft = formatCurrency(String(Math.round((perAcre * acreage) / totalSqft * 100) / 100));
            }
          } else if (token === "price_per_sqft" && totalSqft > 0) {
            // User typed per SF → calc total and per acre
            lastPriceModeRef.current = "per_sqft";
            const perSqft = stripCurrency(value);
            if (perSqft > 0) {
              updated.purchase_price = formatCurrency(String(Math.round(perSqft * totalSqft)));
              updated.price_per_acre = formatCurrency(String(Math.round(perSqft * 43560)));
            }
          } else if (token === "purchase_price" && acreage > 0) {
            // User typed total → calc per acre and per SF (but don't set display mode)
            const total = stripCurrency(value);
            if (total > 0) {
              updated.price_per_acre = formatCurrency(String(Math.round(total / acreage)));
              // PSF: keep 2 decimals for precision (e.g. "$5.75")
              const psf = total / totalSqft;
              updated.price_per_sqft = "$" + psf.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          } else if (token === "acreage") {
            // Acreage changed — recalc per-unit from total if available
            const total = stripCurrency(updated.purchase_price || "");
            if (total > 0 && acreage > 0) {
              updated.price_per_acre = formatCurrency(String(Math.round(total / acreage)));
              const psf = total / totalSqft;
              updated.price_per_sqft = "$" + psf.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          }

          // Compute the display token for the template
          // Only shows if user explicitly entered per acre or per SF
          const mode = lastPriceModeRef.current;
          if (mode === "per_acre" && updated.price_per_acre) {
            updated.price_per_unit = `(${updated.price_per_acre} per acre)`;
          } else if (mode === "per_sqft" && updated.price_per_sqft) {
            updated.price_per_unit = `(${updated.price_per_sqft} PSF)`;
          } else {
            updated.price_per_unit = "";
          }
        }

        // ── Listing Agreement: auto-compute listing_price_display ──
        // Shows formatted price (+ optional per-acre) or default text when empty
        if (token === "listing_price" || token === "price_per_acre" || token === "acreage") {
          const isListingDoc = docType?.id === "listing_sale" || docType?.id === "listing_sale_lease";
          if (isListingDoc) {
            const rawPrice = (updated.listing_price || "").replace(/[$,]/g, "").trim();
            const rawPerAcre = (updated.price_per_acre || "").replace(/[$,]/g, "").trim();
            const priceNum = parseFloat(rawPrice) || 0;
            const perAcreNum = parseFloat(rawPerAcre) || 0;

            // Auto-calc between listing_price and price_per_acre using acreage
            const acreageVal = parseFloat((updated.acreage || "").replace(/,/g, "")) || 0;
            if (token === "listing_price" && priceNum > 0 && acreageVal > 0) {
              updated.price_per_acre = formatCurrency(String(Math.round(priceNum / acreageVal)));
            } else if (token === "price_per_acre" && perAcreNum > 0 && acreageVal > 0) {
              updated.listing_price = formatCurrency(String(Math.round(perAcreNum * acreageVal)));
            } else if (token === "acreage" && acreageVal > 0) {
              // Acreage changed — recalc per-acre from listing price
              const lp = parseFloat((updated.listing_price || "").replace(/[$,]/g, "")) || 0;
              if (lp > 0) {
                updated.price_per_acre = formatCurrency(String(Math.round(lp / acreageVal)));
              }
            }

            // Build the display string
            const finalPrice = parseFloat((updated.listing_price || "").replace(/[$,]/g, "")) || 0;
            const finalPerAcre = parseFloat((updated.price_per_acre || "").replace(/[$,]/g, "")) || 0;
            if (finalPrice > 0 && finalPerAcre > 0) {
              updated.listing_price_display = `${formatCurrency(String(finalPrice))} (${formatCurrency(String(finalPerAcre))} per acre)`;
            } else if (finalPrice > 0) {
              updated.listing_price_display = formatCurrency(String(finalPrice));
            } else {
              updated.listing_price_display = "The proposed sale price to be determined.";
            }
          }
        }

        // ── Lease Listing Agreement: auto-compute commission display strings ──
        // "Five percent (5%)" / "Three percent (3%)" from numeric inputs
        if (token === "commission_pct" || token === "commission_reduced_pct") {
          if (docType?.id === "listing_lease") {
            const pctVal = parseInt((updated.commission_pct || "").replace(/[^0-9]/g, "")) || 0;
            const reducedVal = parseInt((updated.commission_reduced_pct || "").replace(/[^0-9]/g, "")) || 0;
            if (pctVal > 0) {
              const pctDisplay = `${numberToWritten(String(pctVal))} percent (${pctVal}%)`;
              updated.commission_pct_display = pctDisplay.charAt(0).toUpperCase() + pctDisplay.slice(1);
            } else {
              updated.commission_pct_display = "";
            }
            if (reducedVal > 0) {
              const reducedDisplay = `${numberToWritten(String(reducedVal))} percent (${reducedVal}%)`;
              updated.commission_reduced_pct_display = reducedDisplay.charAt(0).toUpperCase() + reducedDisplay.slice(1);
            } else {
              updated.commission_reduced_pct_display = "";
            }
          }
        }

        // Mirror to the ref so the debounced callback gets the latest
        fieldValuesRef.current = updated;
        return updated;
      });

      // Strict mode: changing a field resets its verification
      if (isStrictMode) {
        setVerifiedFields((prev) => {
          if (!prev.has(token)) return prev;
          const next = new Set(prev);
          next.delete(token);
          return next;
        });
      }

      // Start/reset the 1.5s debounce timer for regeneration
      triggerDebouncedRegen();
    },
    [varMap, triggerDebouncedRegen, docType]
  );

  // ── Handle blur on a field — formats dollar amounts and triggers regen ──
  // This fires when the user leaves (tabs out of) a dollar-amount input.
  const handleFieldBlur = useCallback(
    (token: string) => {
      const def = varMap.get(token);
      if (!def?.numberField) return;
      if (!isDollarToken(token)) return; // Non-dollar number fields are handled in onChange

      setFieldValues((prev) => {
        const raw = prev[token] || "";
        if (!raw.trim()) return prev; // Empty — nothing to format

        const updated = { ...prev };
        // PSF fields keep 2 decimal places: "38" → "$38.00"
        const isPsf = token === "base_rent_psf" || token === "ti_allowance_psf";
        if (isPsf) {
          const cleaned = raw.replace(/[$,]/g, "").trim();
          const n = parseFloat(cleaned);
          updated[token] = isNaN(n) ? raw : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
          // Format: "2500000" → "$2,500,000"
          updated[token] = formatCurrency(raw);
        }
        // Compute written variant: "two million five hundred thousand dollars"
        if (def.writtenVariant) {
          updated[def.writtenVariant] = dollarToWritten(raw);
        }

        // Update price_per_unit display after formatting
        const mode = lastPriceModeRef.current;
        if (mode === "per_acre" && updated.price_per_acre) {
          updated.price_per_unit = `(${updated.price_per_acre} per acre)`;
        } else if (mode === "per_sqft" && updated.price_per_sqft) {
          updated.price_per_unit = `(${updated.price_per_sqft} PSF)`;
        }

        // Recompute listing_price_display after formatting
        const isListingDoc = docType?.id === "listing_sale" || docType?.id === "listing_sale_lease";
        if (isListingDoc && (token === "listing_price" || token === "price_per_acre")) {
          const finalPrice = parseFloat((updated.listing_price || "").replace(/[$,]/g, "")) || 0;
          const finalPerAcre = parseFloat((updated.price_per_acre || "").replace(/[$,]/g, "")) || 0;
          if (finalPrice > 0 && finalPerAcre > 0) {
            updated.listing_price_display = `${formatCurrency(String(finalPrice))} (${formatCurrency(String(finalPerAcre))} per acre)`;
          } else if (finalPrice > 0) {
            updated.listing_price_display = formatCurrency(String(finalPrice));
          } else {
            updated.listing_price_display = "The proposed sale price to be determined.";
          }
        }

        // fieldValuesRef is synced here so regenerateDocument picks up formatted value
        fieldValuesRef.current = updated;
        return updated;
      });

      // Trigger a regen with the now-formatted value
      triggerDebouncedRegen();
    },
    [varMap, triggerDebouncedRegen, docType]
  );

  // ── Handle CRE8 Broker dropdown change ──
  const handleCre8BrokerChange = useCallback(
    (id: string) => {
      setSelectedCre8Broker(id);
      const member = teamMembers.find((m) => m.id === id);
      if (member) {
        setFieldValues((prev) => {
          const updated = {
            ...prev,
            broker_names: member.name,
            cre8_agent_email: member.email,
            cre8_agent_phone: member.phone,
          };
          fieldValuesRef.current = updated;
          return updated;
        });
        triggerDebouncedRegen();
      } else {
        // Cleared selection
        setFieldValues((prev) => {
          const updated = {
            ...prev,
            broker_names: "",
            cre8_agent_email: "",
            cre8_agent_phone: "",
          };
          fieldValuesRef.current = updated;
          return updated;
        });
        triggerDebouncedRegen();
      }
    },
    [teamMembers, triggerDebouncedRegen]
  );

  // ── Handle Seller Broker typeahead selection ──
  const handleSellerBrokerChange = useCallback(
    (broker: BrokerEntry | null) => {
      if (broker && broker.name) {
        setFieldValues((prev) => {
          const updated = {
            ...prev,
            seller_broker_name: broker.name,
            seller_broker_company: broker.company,
            seller_broker_email: broker.email,
          };
          fieldValuesRef.current = updated;
          return updated;
        });
        triggerDebouncedRegen();
      } else {
        setFieldValues((prev) => {
          const updated = {
            ...prev,
            seller_broker_name: "",
            seller_broker_company: "",
            seller_broker_email: "",
          };
          fieldValuesRef.current = updated;
          return updated;
        });
        triggerDebouncedRegen();
      }
    },
    [triggerDebouncedRegen]
  );

  // ── Handle Listing dropdown change ──
  const handleListingChange = useCallback(
    (id: string) => {
      setSelectedListing(id);
      const listing = listings.find((l) => l.id === id);
      if (listing) {
        setFieldValues((prev) => {
          const updated = { ...prev, property_address: listing.address };
          fieldValuesRef.current = updated;
          return updated;
        });
        triggerDebouncedRegen();
      } else {
        setFieldValues((prev) => {
          const updated = { ...prev, property_address: "" };
          fieldValuesRef.current = updated;
          return updated;
        });
        triggerDebouncedRegen();
      }
    },
    [listings, triggerDebouncedRegen]
  );

  // ── Handle parcel picker confirm — merge selected parcel data into fields ──
  const handleParcelConfirm = useCallback(
    (selection: ParcelSelection) => {
      setShowParcelPicker(false);
      // Store selected parcels so re-opening the picker restores the selection
      if (selection.selectedParcels) {
        setStoredParcels(selection.selectedParcels);
      }
      // Store the captured map image (if any)
      if (selection.mapImage) {
        setParcelMapImage(selection.mapImage);
        setIncludeParcelMap(true);
      }
      const isListingDoc = docType?.id === "listing_sale" || docType?.id === "listing_sale_lease" || docType?.id === "listing_lease";
      setFieldValues((prev) => {
        const updated = { ...prev };
        if (selection.property_address) updated.property_address = selection.property_address;
        if (selection.parcel_number) updated.parcel_number = selection.parcel_number;
        // Listing docs use owner_entity instead of seller_entity
        if (selection.seller_entity) {
          if (isListingDoc) {
            updated.owner_entity = selection.seller_entity;
          } else {
            updated.seller_entity = selection.seller_entity;
          }
        }
        if (selection.acreage) updated.acreage = selection.acreage;
        fieldValuesRef.current = updated;
        return updated;
      });
      // Trigger doc regeneration so the preview updates immediately
      triggerDebouncedRegen();
    },
    [triggerDebouncedRegen]
  );

  // ── Handle AI extraction result — staggered field animation ──
  const handleAiExtracted = useCallback(
    (extractedVars: Record<string, string>) => {
      // Build list of fields that have non-empty values from AI
      const fieldsToAnimate = Object.entries(extractedVars).filter(
        ([, value]) => value && value.trim() !== ""
      );

      if (fieldsToAnimate.length === 0) return;

      // Format currency and compute written variants for extracted number fields
      const allVars: Record<string, string> = { ...extractedVars };
      for (const varDef of varDefs) {
        if (varDef.numberField && allVars[varDef.token]) {
          const isDollar = isDollarToken(varDef.token);
          if (isDollar) {
            // PSF fields keep 2 decimal places: "38" → "$38.00"
            const isPsf = varDef.token === "base_rent_psf" || varDef.token === "ti_allowance_psf";
            if (isPsf) {
              const cleaned = allVars[varDef.token].replace(/[$,]/g, "").trim();
              const n = parseFloat(cleaned);
              allVars[varDef.token] = isNaN(n) ? allVars[varDef.token] : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
              allVars[varDef.token] = formatCurrency(allVars[varDef.token]);
            }
            if (varDef.writtenVariant) {
              allVars[varDef.writtenVariant] = dollarToWritten(extractedVars[varDef.token]);
            }
          } else if (varDef.writtenVariant) {
            allVars[varDef.writtenVariant] = numberToWritten(extractedVars[varDef.token]);
          }
        }
      }

      // Staggered animation: set each field one by one with a delay
      let delay = 0;
      const STAGGER_MS = 120;
      const GLOW_DURATION_MS = 500;

      for (const [token, value] of fieldsToAnimate) {
        setTimeout(() => {
          // Add to the "filling" set for the green glow
          setAiFillingTokens((prev) => new Set(prev).add(token));

          // Set the field value
          setFieldValues((prev) => {
            const updated = { ...prev, [token]: allVars[token] || value };

            // Also set written variant if it exists
            const def = varMap.get(token);
            if (def?.writtenVariant && allVars[def.writtenVariant]) {
              updated[def.writtenVariant] = allVars[def.writtenVariant];
            }

            fieldValuesRef.current = updated;
            return updated;
          });

          // Remove the glow after a short time
          setTimeout(() => {
            setAiFillingTokens((prev) => {
              const next = new Set(prev);
              next.delete(token);
              return next;
            });
          }, GLOW_DURATION_MS);
        }, delay);

        delay += STAGGER_MS;
      }

      // After all fields are animated, trigger one document regeneration
      setTimeout(() => {
        regenerateDocument();
      }, delay + 200);
    },
    [varDefs, varMap, regenerateDocument]
  );

  // ── Toggle field verification (strict mode) ──
  const handleToggleVerify = useCallback((token: string) => {
    setVerifiedFields((prev) => {
      const next = new Set(prev);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  }, []);

  // ── Check if all filled, non-auto fields are verified (strict mode gate for Save) ──
  const allFieldsVerified = useMemo(() => {
    if (!isStrictMode) return true; // Flexible mode — no verification needed
    // Get all editable tokens (not auto-computed, not written variants)
    for (const varDef of varDefs) {
      if (varDef.source === "auto") continue;
      if (writtenTokens.has(varDef.token)) continue;
      const val = fieldValues[varDef.token];
      // If the field is filled, it must be verified
      if (val && val.trim() !== "" && !verifiedFields.has(varDef.token)) {
        return false;
      }
    }
    return true;
  }, [isStrictMode, varDefs, writtenTokens, fieldValues, verifiedFields]);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Download file locally
  const downloadFile = useCallback(() => {
    if (!fileBase64 || !fileName) return;
    const link = document.createElement("a");
    link.href = fileBase64;
    link.download = fileName;
    link.click();
  }, [fileBase64, fileName]);

  // Upload to SharePoint
  async function handleSave() {
    setPageState("saving");

    try {
      const account = accounts[0];
      if (!account) throw new Error("Not authenticated");

      // Use cached token/drive or fetch fresh ones
      let token = accessToken;
      let drive = driveId;

      if (!token || !drive) {
        const tokenResponse = await instance.acquireTokenSilent({
          ...graphScopes,
          account,
        });
        token = tokenResponse.accessToken;
        const siteId = await getSiteId(token);
        drive = await getDriveId(token, siteId);
        setAccessToken(token);
        setDriveId(drive);
      }

      const arrayBuffer = base64ToArrayBuffer(fileBase64);
      const siteId = await getSiteId(token);

      const webUrl = await uploadToSharePoint(
        token,
        siteId,
        drive,
        saveFolder,
        fileName,
        arrayBuffer
      );

      setSharePointUrl(webUrl);
      setPageState("saved");

      // Clean up sessionStorage
      sessionStorage.removeItem(`extraction_${docType!.id}`);
      sessionStorage.removeItem(`generated_${docType!.id}`);
      sessionStorage.removeItem(`generate_payload_${docType!.id}`);
    } catch (err) {
      console.error("SharePoint upload error:", err);
      setPageState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save to SharePoint"
      );
    }
  }

  // ── Guards ──
  if (!docType) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-medium-gray">Document type not found.</p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // ── Bottom Bar — renders different content per state ──
  // ══════════════════════════════════════════════════
  function BottomBar() {
    // PREVIEW state — save controls
    if (pageState === "preview") {
      return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Save-to location + change button */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-medium-gray text-sm flex-shrink-0">Save to:</span>
            <SharePointBreadcrumb folderPath={saveFolder} />
            <button
              onClick={() => setShowFolderPicker(true)}
              disabled={!driveId || !accessToken}
              className="text-green text-sm hover:underline disabled:text-border-gray disabled:cursor-not-allowed flex-shrink-0"
            >
              {driveId && accessToken ? "Change" : "Loading..."}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={downloadFile}
              disabled={!fileBase64}
              className="bg-dark-gray border border-border-gray text-white font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:border-green transition-colors duration-200
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </button>
            <button
              onClick={handleSave}
              disabled={isRegenerating || !fileBase64 || !allFieldsVerified}
              title={!allFieldsVerified ? "Verify all filled fields before saving" : ""}
              className="bg-green text-black font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:brightness-110 transition-all duration-200
                         flex items-center gap-2
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Save to SharePoint
            </button>
          </div>
        </div>
      );
    }

    // SAVING state
    if (pageState === "saving") {
      return (
        <div className="flex items-center justify-center py-2">
          <LoadingSpinner message="Saving to SharePoint..." />
        </div>
      );
    }

    // SAVED state
    if (pageState === "saved") {
      return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Saved confirmation + breadcrumb */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17L4 12" />
              </svg>
            </div>
            <span className="text-green text-sm font-semibold flex-shrink-0">Saved</span>
            <SharePointBreadcrumb folderPath={saveFolder} />
          </div>

          {/* Post-save actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={getWordUrl(sharePointUrl)}
              className="bg-green text-black font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:brightness-110 transition-all duration-200
                         flex items-center gap-2"
            >
              Open in Word
            </a>
            <a
              href={sharePointUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-dark-gray border border-border-gray text-white font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:border-green transition-colors duration-200
                         flex items-center gap-2"
            >
              Word Online
            </a>
            <button
              onClick={() => router.push("/docs")}
              className="text-medium-gray text-sm hover:text-white transition-colors px-3 py-2.5"
            >
              New
            </button>
          </div>
        </div>
      );
    }

    // ERROR state
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <span className="text-red-400 text-sm">{errorMessage}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              setPageState("preview");
              setErrorMessage("");
            }}
            className="bg-green text-black font-semibold text-sm px-5 py-2.5 rounded-btn
                       hover:brightness-110 transition-all duration-200"
          >
            Try Again
          </button>
          <button
            onClick={downloadFile}
            className="bg-dark-gray border border-border-gray text-white font-semibold text-sm px-5 py-2.5 rounded-btn
                       hover:border-green transition-colors duration-200"
          >
            Download Instead
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // ── Render ──
  // ══════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-black">
      {/* AI fill animation styles */}
      <style jsx global>{`
        .ai-filling input {
          animation: aiRevealText 0.4s ease-out;
        }
        @keyframes aiRevealText {
          from { clip-path: inset(0 100% 0 0); }
          to { clip-path: inset(0 0 0 0); }
        }
      `}</style>

      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-gray flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/docs")}
            className="text-medium-gray hover:text-white transition-colors"
            title="Back to documents"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 12L6 8L10 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="font-bebas text-2xl tracking-wide text-white">
            DOCUMENT <span className="text-green">EDITOR</span>
          </h1>
        </div>
        <span className="text-medium-gray text-sm">{docType.name}</span>
      </div>

      {/* ── Mobile tab bar — only visible on small screens ──
           Lets users switch between the edit form and the document preview.
           On desktop (lg+) both panes are always visible side by side. */}
      <div className="flex lg:hidden border-b border-border-gray flex-shrink-0">
        <button
          onClick={() => setMobileTab("form")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
            mobileTab === "form"
              ? "text-white border-green"
              : "text-medium-gray border-transparent"
          }`}
        >
          Edit Fields
        </button>
        <button
          onClick={() => setMobileTab("preview")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
            mobileTab === "preview"
              ? "text-white border-green"
              : "text-medium-gray border-transparent"
          }`}
        >
          Preview Doc
          {/* Show a subtle indicator when a regen is in progress */}
          {isRegenerating && (
            <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
          )}
        </button>
      </div>

      {/* Split pane: preview (left) + sidebar (right) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left — Doc Preview ──
             On mobile: only visible when mobileTab === "preview"
             On desktop: always visible (lg:block overrides the hidden) */}
        <div
          className={`lg:w-[65%] w-full relative overflow-y-auto p-4
            ${mobileTab === "preview" ? "block" : "hidden lg:block"}`}
        >
          {/* Regenerating overlay */}
          {isRegenerating && (
            <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center rounded-lg">
              <div className="flex items-center gap-3 bg-charcoal px-5 py-3 rounded-card border border-border-gray">
                <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin" />
                <span className="text-white text-sm">Updating...</span>
              </div>
            </div>
          )}

          {/* Initial loading state */}
          {initialLoading && !fileBase64 && (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner message="Generating preview..." />
            </div>
          )}

          {/* Doc preview — wrapped in overflow-x-auto so it's scrollable on mobile
               if the Word document width exceeds the screen width */}
          {fileBase64 && (
            <div className="overflow-x-auto">
              <DocPreview fileBase64={fileBase64} />
            </div>
          )}

          {/* Helper note for mobile users */}
          {fileBase64 && (
            <p className="text-medium-gray text-xs mt-2 lg:hidden">
              Pinch to zoom · scroll sideways if needed
            </p>
          )}

          {/* Preview background note */}
          <p className="text-medium-gray text-xs mt-2 hidden lg:block">
            Template backgrounds will appear in the downloaded file.
          </p>

          {/* File name below preview */}
          {fileName && (
            <p className="text-medium-gray text-xs mt-2 truncate">{fileName}</p>
          )}
        </div>

        {/* ── Right — Sidebar: AI bar + CMS dropdowns + field sections ──
             On mobile: only visible when mobileTab === "form"
             On desktop: always visible */}
        <div
          className={`lg:w-[35%] w-full border-t lg:border-t-0 lg:border-l border-border-gray overflow-y-auto p-4
            ${mobileTab === "form" ? "block" : "hidden lg:block"}`}
        >
          <FieldSidebar
            docTypeId={docType.id}
            sections={sections}
            writtenTokens={writtenTokens}
            varMap={varMap}
            fieldValues={fieldValues}
            onFieldChange={handleFieldChange}
            onFieldBlur={handleFieldBlur}
            aiFillingTokens={aiFillingTokens}
            sectionRefs={sectionRefCallback}
            cmsContext={cmsContext}
            onExtracted={handleAiExtracted}
            onExtracting={setIsAiExtracting}
            teamMembers={teamMembers}
            listings={listings}
            loadingCms={loadingCms}
            selectedCre8Broker={selectedCre8Broker}
            selectedListing={selectedListing}
            onCre8BrokerChange={handleCre8BrokerChange}
            onSellerBrokerChange={handleSellerBrokerChange}
            onListingChange={handleListingChange}
            isAiExtracting={isAiExtracting}
            onOpenParcelPicker={() => setShowParcelPicker(true)}
            strictMode={isStrictMode}
            verifiedFields={verifiedFields}
            onToggleVerify={handleToggleVerify}
            hasParcelMapImage={!!parcelMapImage}
            includeParcelMap={includeParcelMap}
            onToggleParcelMap={() => {
              setIncludeParcelMap((prev) => !prev);
              // Trigger regeneration so the document updates with/without the map image
              triggerDebouncedRegen();
            }}
          />
        </div>
      </div>

      {/* Bottom bar — full width, always visible */}
      <div className="border-t border-border-gray px-6 py-3 flex-shrink-0 bg-charcoal">
        <BottomBar />
      </div>

      {/* Folder Picker Modal */}
      {showFolderPicker && driveId && accessToken && (
        <FolderPicker
          accessToken={accessToken}
          driveId={driveId}
          currentPath={saveFolder}
          onSelect={updateSaveFolder}
          onClose={() => setShowFolderPicker(false)}
        />
      )}

      {/* Parcel Picker Modal — map-based parcel selection */}
      {showParcelPicker && (
        <ParcelPickerModal
          onConfirm={handleParcelConfirm}
          onClose={() => setShowParcelPicker(false)}
          includeAcreage={docType.id === "loi_land" || docType.id === "listing_sale" || docType.id === "listing_sale_lease"}
          mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""}
          initialParcels={storedParcels.length > 0 ? storedParcels : undefined}
        />
      )}
    </div>
  );
}
