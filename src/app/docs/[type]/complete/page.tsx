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
// Design-system primitives + lucide icons (UI refresh)
import {
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Spinner,
  cn,
} from "@/components/ui";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Download,
  MapPin,
  Upload,
  X,
  XCircle,
} from "lucide-react";
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
    // Card primitive (flush padding — the header row is a full-width toggle)
    <Card
      ref={(el) => sectionRef?.(section.title, el)}
      padding="none"
      className="overflow-hidden"
    >
      {/* Section header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <span className="text-text text-sm font-semibold">{section.title}</span>
        <div className="flex items-center gap-2">
          <span className="text-text-3 text-xs tabular-nums">
            {filledCount}/{editableTokens.length}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn("text-text-2 transition-transform duration-200", expanded && "rotate-180")}
          />
        </div>
      </button>

      {/* Fields — shown when expanded */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
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
                {/* Field primitive — the dollar hint rides in its `action` slot */}
                <Field
                  label={label}
                  action={
                    /* Small hint for dollar fields: formatting happens when you leave the input */
                    isDollar ? "Type a number — formats on exit" : undefined
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      value={fieldValues[token] || ""}
                      onChange={(e) => onFieldChange(token, e.target.value)}
                      onBlur={() => onFieldBlur(token)}
                      placeholder={isDollar ? "e.g. 2500000" : ""}
                      className={cn(
                        "flex-1 text-sm transition-all duration-300",
                        // Green ring while the AI is filling this field (status)
                        isFilling && "border-accent ring-2 ring-accent/30"
                      )}
                    />
                    {/* Verification checkmark — strict mode only.
                        grey = empty · yellow = needs verifying · green = verified (status colors) */}
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
                        className={cn(
                          "flex-shrink-0 w-control h-control rounded-control flex items-center justify-center transition-colors duration-200",
                          !hasFillValue
                            ? "text-text-3 cursor-not-allowed"
                            : isVerified
                              ? "text-accent-strong hover:bg-accent-soft"
                              : "text-warning-fg hover:bg-warning-bg"
                        )}
                      >
                        {!hasFillValue ? (
                          <Circle size={18} strokeWidth={1.75} />
                        ) : isVerified ? (
                          <CheckCircle2 size={18} strokeWidth={1.75} />
                        ) : (
                          <CircleDot size={18} strokeWidth={1.75} />
                        )}
                      </button>
                    )}
                  </div>
                </Field>
              </div>
            );
          })}
        </div>
      )}
    </Card>
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
        {/* Input primitive — same ref/value/handlers as before */}
        <Input
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
          className="pr-9 text-sm"
        />
        {/* Clear button (X) — only shows when there's text */}
        {query && (
          <IconButton
            label="Clear"
            size="sm"
            icon={<X size={16} strokeWidth={1.75} />}
            onClick={clearSelection}
            className="absolute right-1 top-1/2 -translate-y-1/2"
          />
        )}
      </div>

      {/* Dropdown results — floating layer, so it gets the popover shadow */}
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-surface border border-border rounded-card shadow-popover max-h-64 overflow-y-auto p-1">
          {filtered.map((broker, idx) => (
            <button
              key={`${broker.name}-${broker.company}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectBroker(broker)}
              onMouseEnter={() => setHighlightIdx(idx)}
              className={cn(
                "w-full flex items-center justify-between rounded-control px-3 py-2 text-sm text-text text-left transition-colors hover:bg-surface-2",
                idx === highlightIdx && "bg-surface-2"
              )}
            >
              <span className="truncate">{broker.name}</span>
              <span className="text-text-3 text-xs ml-2 truncate max-w-[45%] text-right">{broker.company}</span>
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
    // Card primitive (flush padding — the header row is a full-width toggle)
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <span className="text-text text-sm font-semibold">Brokers & listing</span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={cn("text-text-2 transition-transform duration-200", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* CRE8 Broker — Field + Select primitives */}
          <Field label="CRE8 broker (you)">
            <Select
              value={selectedCre8Broker}
              onChange={(e) => onCre8BrokerChange(e.target.value)}
              disabled={loadingCms}
              className="text-sm"
            >
              <option value="">Select broker...</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>

          {/* Seller Broker — searchable typeahead */}
          <Field label="Seller broker" action="Optional">
            <SellerBrokerTypeahead onSelect={onSellerBrokerChange} />
          </Field>

          {/* CRE8 Listing */}
          <Field label="CRE8 listing" action="Pre-fills address">
            <Select
              value={selectedListing}
              onChange={(e) => onListingChange(e.target.value)}
              disabled={loadingCms}
              className="text-sm"
            >
              <option value="">None</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>{l.name || l.address}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </Card>
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
    <div className="space-y-4 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 180px)" }}>
      {/* AI Assist Bar */}
      <AIAssistBar
        docTypeId={docTypeId}
        cmsContext={cmsContext}
        onExtracted={onExtracted}
        onExtracting={onExtracting}
      />

      {/* Status line while AI is extracting — shared Spinner */}
      {isAiExtracting && (
        <div className="text-center py-2">
          <div className="inline-flex items-center gap-2 text-text-2 text-xs">
            <Spinner size="sm" />
            AI is analyzing...
          </div>
        </div>
      )}

      {/* Verification reminder banner — strict mode only (warning tint) */}
      {strictMode && (
        <div className="bg-warning-bg text-warning-fg rounded-control px-3 py-2 text-xs">
          Verify all filled fields before saving
        </div>
      )}

      {/* Section header */}
      <h2 className="text-sm font-semibold text-text mb-1">
        Edit fields
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
            <div className="mb-3 space-y-3">
              {/* Secondary Button primitive — opens the map parcel picker */}
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenParcelPicker}
                icon={<MapPin size={18} strokeWidth={1.75} />}
              >
                Select from map
              </Button>
              {/* Toggle: include parcel map image in document — only visible when an image exists */}
              {hasParcelMapImage && onToggleParcelMap && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    {/* Switch — green when on (selected state) */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includeParcelMap}
                      onClick={onToggleParcelMap}
                      className={cn(
                        "relative w-8 h-[18px] rounded-pill transition-colors duration-200",
                        includeParcelMap ? "bg-accent" : "bg-border-strong"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-pill bg-white transition-transform duration-200",
                          includeParcelMap && "translate-x-[14px]"
                        )}
                      />
                    </button>
                    <span className="text-xs text-text-2 group-hover:text-text transition-colors">
                      Attach parcel map to document
                    </span>
                  </label>
                  <p className="text-xs text-text-3 leading-tight pl-10">
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
  const [isExporting] = useState(false); // Kept for button disabled state (always false now — parcel map downloads separately)
  const [showMapPreview, setShowMapPreview] = useState(false); // Parcel map preview modal
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
  // Refs that mirror parcel map state — avoids stale closures in debounced regen
  const parcelMapImageRef = useRef<string>("");
  const includeParcelMapRef = useRef<boolean>(true);

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
      // Restore field values from sessionStorage and trigger a fresh preview generation.
      const parsedDoc = JSON.parse(storedDoc);
      const parsedPayload = JSON.parse(storedPayload);
      setFileName(parsedDoc.fileName);
      setFieldValues(parsedPayload.variables || {});
      fieldValuesRef.current = parsedPayload.variables || {};
      setClausePayload(parsedPayload.clauses || []);
      // Generate a clean preview (no parcel map image) from the restored values
      if (!initialGenTriggered.current) {
        initialGenTriggered.current = true;
        generateInitialPreview(parsedPayload.variables || {}, parsedPayload.clauses || []);
      }
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
  async function generateInitialPreview(defaults: Record<string, string>, clauses: { id: string; title: string; text: string }[] = []) {
    if (!docType) return;

    try {
      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docType.id,
          variables: defaults,
          clauses,
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
          JSON.stringify({ variables: defaults, clauses })
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
          // Parcel map image is downloaded as a separate .jpg file — not embedded in the .docx.
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
  }, [docType, clausePayload, buildFileName, varDefs]);

  // ── Helper: download a data URL as a file (used for parcel map image) ──
  function downloadDataUrl(dataUrl: string, filename: string) {
    const base64 = dataUrl.split(",")[1];
    const mime = dataUrl.match(/^data:([^;]+)/)?.[1] || "image/jpeg";
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 1000);
  }

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
      // Store the captured map image — sync ref immediately so debounced regen picks it up
      if (selection.mapImage) {
        parcelMapImageRef.current = selection.mapImage;
        includeParcelMapRef.current = true;
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

  // Download .docx locally (always fast path) + separate parcel map .jpg if enabled
  const downloadFile = useCallback(() => {
    if (!fileBase64 || !fileName) return;

    // Download the .docx — convert base64 data URL to Blob for clean download
    const base64Data = fileBase64.split(",")[1];
    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 1000);

    // If parcel map is enabled, show a preview modal instead of auto-downloading
    if (includeParcelMapRef.current && parcelMapImageRef.current) {
      setShowMapPreview(true);
    }
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

      // Upload the .docx (always from preview base64 — parcel map is a separate file)
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

      // If parcel map is enabled, also upload the .jpg image to the same SharePoint folder
      if (includeParcelMapRef.current && parcelMapImageRef.current) {
        try {
          const imgBase64 = parcelMapImageRef.current.split(",")[1];
          const imgBytes = atob(imgBase64);
          const imgArray = new Uint8Array(imgBytes.length);
          for (let i = 0; i < imgBytes.length; i++) imgArray[i] = imgBytes.charCodeAt(i);
          const imgBuffer = imgArray.buffer;
          const baseName = fileName.replace(/\.docx$/i, "");
          await uploadToSharePoint(
            token,
            siteId,
            drive,
            saveFolder,
            `${baseName}_Parcel_Map.jpg`,
            imgBuffer
          );
        } catch (imgErr) {
          // Non-fatal — .docx already saved, just log the image upload failure
          console.warn("Parcel map image upload failed:", imgErr);
        }
      }

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
        <p className="text-text-2 text-sm">Document type not found.</p>
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
            <span className="text-text-2 text-sm flex-shrink-0">Save to:</span>
            <SharePointBreadcrumb folderPath={saveFolder} />
            {/* Ghost Button primitive — opens the folder picker */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFolderPicker(true)}
              disabled={!driveId || !accessToken}
              className="flex-shrink-0"
            >
              {driveId && accessToken ? "Change" : "Loading..."}
            </Button>
          </div>

          {/* Action buttons — secondary Download, primary (black) Save */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Button
              variant="secondary"
              onClick={downloadFile}
              disabled={!fileBase64 || isExporting}
              loading={isExporting}
              icon={<Download size={18} strokeWidth={1.75} />}
            >
              {isExporting ? "Exporting..." : "Download"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isRegenerating || isExporting || !fileBase64 || !allFieldsVerified}
              title={!allFieldsVerified ? "Verify all filled fields before saving" : ""}
              icon={<Upload size={18} strokeWidth={1.75} />}
            >
              Save to SharePoint
            </Button>
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
            {/* Green check = success status */}
            <CheckCircle2 size={18} strokeWidth={1.75} className="text-accent-strong flex-shrink-0" />
            <span className="text-accent-strong text-sm font-semibold flex-shrink-0">Saved</span>
            <SharePointBreadcrumb folderPath={saveFolder} />
          </div>

          {/* Post-save actions — plain anchors styled like the Button primitive (external links) */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={getWordUrl(sharePointUrl)}
              className="inline-flex items-center justify-center h-control px-3.5 text-base font-medium rounded-control bg-ink text-white hover:bg-ink-hover transition-colors duration-150"
            >
              Open in Word
            </a>
            <a
              href={sharePointUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-control px-3.5 text-base font-medium rounded-control bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong transition-colors duration-150"
            >
              Word Online
            </a>
            <Button variant="ghost" onClick={() => router.push("/docs")}>
              New
            </Button>
          </div>
        </div>
      );
    }

    // ERROR state
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Red x = error status */}
          <XCircle size={18} strokeWidth={1.75} className="text-danger flex-shrink-0" />
          <span className="text-danger-fg text-sm">{errorMessage}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            onClick={() => {
              setPageState("preview");
              setErrorMessage("");
            }}
          >
            Try again
          </Button>
          <Button variant="secondary" onClick={downloadFile} icon={<Download size={18} strokeWidth={1.75} />}>
            Download instead
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // ── Render ──
  // ══════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-canvas">
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
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* IconButton primitive — back to the documents list */}
          <IconButton
            label="Back to documents"
            size="sm"
            icon={<ArrowLeft size={18} strokeWidth={1.75} />}
            onClick={() => router.push("/docs")}
          />
          <h1 className="text-lg font-semibold text-text">Document editor</h1>
        </div>
        <span className="text-text-2 text-sm">{docType.name}</span>
      </div>

      {/* ── Mobile tab bar — only visible on small screens ──
           Lets users switch between the edit form and the document preview.
           On desktop (lg+) both panes are always visible side by side. */}
      <div className="flex lg:hidden border-b border-border bg-surface flex-shrink-0">
        {/* Underline tabs — green underline marks the active tab (status) */}
        <button
          type="button"
          onClick={() => setMobileTab("form")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors border-b-2",
            mobileTab === "form" ? "text-text border-accent" : "text-text-2 border-transparent"
          )}
        >
          Edit fields
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors border-b-2",
            mobileTab === "preview" ? "text-text border-accent" : "text-text-2 border-transparent"
          )}
        >
          Preview doc
          {/* Show a subtle indicator when a regen is in progress */}
          {isRegenerating && (
            <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-accent rounded-pill animate-pulse" />
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
            <div className="absolute inset-0 bg-surface/60 z-20 flex items-center justify-center rounded-card">
              {/* Floating status pill — popover shadow is allowed on floating layers */}
              <div className="flex items-center gap-3 bg-surface px-5 py-3 rounded-card border border-border shadow-popover">
                <Spinner size="sm" />
                <span className="text-text text-sm">Updating...</span>
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

          {/* Parcel map placeholder — shown when a map image is captured and toggle is on */}
          {fileBase64 && parcelMapImage && includeParcelMap && (
            <div className="mt-3 border border-dashed border-border-strong rounded-card px-4 py-3 flex items-center gap-3 bg-surface-2">
              {/* Map pin icon */}
              <MapPin size={20} strokeWidth={1.75} className="text-text-2 flex-shrink-0" />
              <div>
                <p className="text-text text-xs font-medium">Parcel map image will be included at the end of the document</p>
                <p className="text-text-2 text-xs leading-tight mt-0.5">
                  Not shown in preview — appears in downloaded and saved files only.
                </p>
              </div>
            </div>
          )}

          {/* Helper note for mobile users */}
          {fileBase64 && (
            <p className="text-text-3 text-xs mt-2 lg:hidden">
              Pinch to zoom · scroll sideways if needed
            </p>
          )}

          {/* Preview background note */}
          <p className="text-text-3 text-xs mt-2 hidden lg:block">
            Template backgrounds will appear in the downloaded file.
          </p>

          {/* File name below preview */}
          {fileName && (
            <p className="text-text-3 text-xs mt-2 truncate">{fileName}</p>
          )}
        </div>

        {/* ── Right — Sidebar: AI bar + CMS dropdowns + field sections ──
             On mobile: only visible when mobileTab === "form"
             On desktop: always visible */}
        <div
          className={`lg:w-[35%] w-full border-t lg:border-t-0 lg:border-l border-border overflow-y-auto p-4
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
              const newVal = !includeParcelMapRef.current;
              includeParcelMapRef.current = newVal;
              setIncludeParcelMap(newVal);
              // No regen needed — parcel map downloads as a separate .jpg file.
            }}
          />
        </div>
      </div>

      {/* Bottom bar — full width, always visible */}
      <div className="border-t border-border px-6 py-3 flex-shrink-0 bg-surface">
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
      {/* Parcel map preview modal — 80% of screen, shows captured map image */}
      {/* Modal primitive — shows the captured map image with a Download action */}
      <Modal
        open={!!(showMapPreview && parcelMapImageRef.current)}
        onClose={() => setShowMapPreview(false)}
        title="Parcel map preview"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowMapPreview(false)}>
              Close
            </Button>
            <Button
              icon={<Download size={18} strokeWidth={1.75} />}
              onClick={() => {
                const baseName = fileName.replace(/\.docx$/i, "");
                downloadDataUrl(parcelMapImageRef.current!, `${baseName}_Parcel_Map.jpg`);
              }}
            >
              Download
            </Button>
          </>
        }
      >
        {/* Image container */}
        {parcelMapImageRef.current && (
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={parcelMapImageRef.current}
              alt="Parcel map"
              className="max-w-full max-h-[70vh] object-contain rounded-control"
            />
          </div>
        )}
      </Modal>

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
