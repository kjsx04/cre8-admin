"use client";

import { useState, useEffect } from "react";
import { CampaignFormData, CampaignType, CampaignFrequency, EmailSender, EmailSegment, Campaign } from "@/lib/email/types";
import { ListingItem, ListingFieldData, BROKERS, BROKER_CONTACTS } from "@/lib/admin-constants";
import EmailPreview from "./EmailPreview";

interface CampaignFormProps {
  onSubmit: (data: CampaignFormData, autoSchedule: boolean) => Promise<void>;
  onClose: () => void;
  existingCampaign?: Campaign | null;
  listings?: ListingItem[];
}

// CMS fields that can be turned into highlight chips
interface CmsChip {
  key: string;
  label: string;
  value: string; // formatted display value to insert as highlight
}

/** Build available CMS chips from listing field data */
function buildCmsChips(fd: ListingFieldData): CmsChip[] {
  const chips: CmsChip[] = [];
  if (fd["list-price"]) chips.push({ key: "list-price", label: "Price", value: `Price: ${fd["list-price"]}` });
  if (fd["square-feet"]) chips.push({ key: "square-feet", label: "Acreage", value: `${fd["square-feet"]} Acres` });
  if (fd["building-sqft"]) chips.push({ key: "building-sqft", label: "Building SF", value: `${fd["building-sqft"].toLocaleString()} SF Building` });
  if (fd.zoning) chips.push({ key: "zoning", label: "Zoning", value: `Zoning: ${fd.zoning}` });
  if (fd["city-county"]) chips.push({ key: "city-county", label: "Location", value: fd["city-county"] });
  if (fd["cross-streets"]) chips.push({ key: "cross-streets", label: "Cross Streets", value: `Cross Streets: ${fd["cross-streets"]}` });
  if (fd["traffic-count"]) chips.push({ key: "traffic-count", label: "Traffic", value: `Traffic Count: ${fd["traffic-count"]}` });
  // Intentionally excluded: property-type and listing-type-2 store Webflow reference IDs (hex), not display text
  return chips;
}

/** Create/edit campaign modal — listing selector, type/label, content fields, broker, segment */
export default function CampaignForm({
  onSubmit,
  onClose,
  existingCampaign,
  listings,
}: CampaignFormProps) {
  const isEdit = !!existingCampaign;

  // Config from API
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [segments, setSegments] = useState<EmailSegment[]>([]);

  // Form state
  const [campaignCategory, setCampaignCategory] = useState<"listing" | "tenant_rep">("listing");
  const [listingId, setListingId] = useState(existingCampaign?.listing_id || "");
  const [listingName, setListingName] = useState(existingCampaign?.listing_name || "");
  const [campaignType, setCampaignType] = useState<CampaignType>(existingCampaign?.campaign_type || "one-time");
  const [templateStyle, setTemplateStyle] = useState<"new_listing" | "broker_blast">("new_listing");
  const [emailLabel, setEmailLabel] = useState(existingCampaign?.email_label || "");
  const [headingText, setHeadingText] = useState(existingCampaign?.heading_text || "");
  const [bodyText, setBodyText] = useState(existingCampaign?.body_text || "");
  const [photoUrl, setPhotoUrl] = useState(existingCampaign?.photo_url || "");
  const [highlights, setHighlights] = useState<string[]>(existingCampaign?.highlights || [""]);
  const [listingPageUrl, setListingPageUrl] = useState(existingCampaign?.listing_page_url || "");
  const [brokerId, setBrokerId] = useState(existingCampaign?.broker_id || "");
  const [segmentId, setSegmentId] = useState(existingCampaign?.segment_id || "all");
  const [frequency, setFrequency] = useState<CampaignFrequency>(
    (existingCampaign?.frequency as CampaignFrequency) || "one-time"
  );
  const [endDate, setEndDate] = useState(existingCampaign?.end_date?.substring(0, 10) || "");

  // Validation state
  const [showErrors, setShowErrors] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);

  // CMS chips — computed from selected listing's field data
  const selectedListing = listings?.find((l) => l.id === listingId);
  const cmsChips = selectedListing ? buildCmsChips(selectedListing.fieldData) : [];

  // Fetch config on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/config");
        if (res.ok) {
          const data = await res.json();
          setSenders(data.senders || []);
          setSegments(data.segments || []);

          // Default to first broker if none set
          if (!brokerId && data.senders?.length > 0) {
            setBrokerId(data.senders[0].id);
          }
        }
      } catch {
        // Config will fall back to empty arrays
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When listing selection changes, auto-fill fields
  const handleListingChange = (id: string) => {
    setListingId(id);
    const listing = listings?.find((l) => l.id === id);
    if (listing) {
      const fd = listing.fieldData;
      setListingName(fd.name || "");
      setPhotoUrl(fd.gallery?.[0]?.url || "");
      setListingPageUrl(fd.slug ? `https://cre8advisors.com/listings/${fd.slug}` : "");

      // Auto-build highlights from listing fields (no trailing empty row)
      const autoHighlights: string[] = [];
      if (fd["list-price"]) autoHighlights.push(`Price: ${fd["list-price"]}`);
      if (fd["square-feet"]) autoHighlights.push(`${fd["square-feet"]} Acres`);
      if (fd.zoning) autoHighlights.push(`Zoning: ${fd.zoning}`);
      if (fd["city-county"]) autoHighlights.push(fd["city-county"]);
      if (autoHighlights.length > 0) setHighlights(autoHighlights);
    }
  };

  // Get selected broker details
  const selectedSender = senders.find((s) => s.id === brokerId);
  const selectedSegment = segments.find((s) => s.id === segmentId);

  // Show More Fields toggle for CMS chip expander
  const [showMoreFields, setShowMoreFields] = useState(false);

  // Highlight row management
  const updateHighlight = (idx: number, val: string) => {
    const next = [...highlights];
    next[idx] = val;
    setHighlights(next);
  };
  const removeHighlight = (idx: number) => {
    const next = highlights.filter((_, i) => i !== idx);
    setHighlights(next.length > 0 ? next : []);
  };
  const moveHighlight = (idx: number, direction: "up" | "down") => {
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= highlights.length) return;
    const next = [...highlights];
    [next[idx], next[target]] = [next[target], next[idx]];
    setHighlights(next);
  };
  const addCustomHighlight = () => setHighlights([...highlights, ""]);

  // Check if a CMS chip value is already in highlights
  const isChipAdded = (chipValue: string) =>
    highlights.some((h) => h.trim() === chipValue.trim());

  // Add a CMS chip value as a new highlight row
  const addChipAsHighlight = (chipValue: string) => {
    if (isChipAdded(chipValue)) return;
    setHighlights([...highlights, chipValue]);
  };

  // CMS chips not already in highlights (for "Show More Fields" panel)
  const availableChips = cmsChips.filter((chip) => !isChipAdded(chip.value));

  // Validation: required fields
  const missingListing = !listingId;
  const missingBroker = !brokerId;
  const missingLabel = !emailLabel.trim();

  const handleSubmit = () => {
    // Check required fields — show errors if missing
    if (missingListing || missingBroker || missingLabel) {
      setShowErrors(true);
      return;
    }

    const data: CampaignFormData = {
      listing_id: listingId,
      listing_name: listingName,
      campaign_type: campaignType,
      email_label: emailLabel.trim(),
      heading_text: headingText || undefined,
      body_text: bodyText || undefined,
      photo_url: photoUrl || undefined,
      highlights: highlights.filter((h) => h.trim()),
      listing_page_url: listingPageUrl || undefined,
      broker_id: brokerId,
      broker_name: selectedSender?.name || BROKERS[brokerId] || "",
      broker_email: selectedSender?.email || BROKER_CONTACTS[brokerId]?.email || "",
      broker_phone: selectedSender?.phone || BROKER_CONTACTS[brokerId]?.phone || "",
      segment_id: segmentId,
      segment_name: selectedSegment?.name || "All Contacts",
      frequency: campaignType === "recurring" ? frequency : "one-time",
      end_date: endDate || undefined,
    };

    // Fire the callback and close immediately — parent manages the toast animation
    onSubmit(data, true);
    onClose();
  };

  // Helper: border class for a field with validation
  const fieldBorder = (hasError: boolean) =>
    hasError
      ? "border-red-400 focus:ring-red-400"
      : "border-border-light focus:ring-green";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-card shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
          <h3 className="font-bebas text-xl tracking-wide text-charcoal">
            {isEdit ? "Edit Campaign" : "New Campaign"}
          </h3>
          <button onClick={onClose} className="text-muted-gray hover:text-charcoal text-lg">
            &times;
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Campaign category toggle */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Campaign Category
                </label>
                <div className="flex gap-2">
                  {([{ id: "listing", label: "Listing" }, { id: "tenant_rep", label: "Tenant Rep" }] as const).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCampaignCategory(cat.id)}
                      className={`px-4 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150
                        ${campaignCategory === cat.id
                          ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                          : "bg-light-gray text-medium-gray hover:text-charcoal border border-transparent"
                        }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tenant Rep — Coming Soon placeholder */}
              {campaignCategory === "tenant_rep" ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-lg font-semibold text-charcoal">Coming Soon</p>
                  <p className="text-sm text-muted-gray mt-1">Tenant rep campaigns are not yet available.</p>
                </div>
              ) : (
              <>
              {/* Listing selector */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Listing <span className="text-red-400">*</span>
                </label>
                {listings && listings.length > 0 ? (
                  <select
                    value={listingId}
                    onChange={(e) => handleListingChange(e.target.value)}
                    className={`w-full border rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 ${fieldBorder(showErrors && missingListing)}`}
                  >
                    <option value="">Select a listing...</option>
                    {listings.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.fieldData.name || l.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={listingName}
                    onChange={(e) => { setListingName(e.target.value); setListingId(e.target.value); }}
                    placeholder="Listing name"
                    className={`w-full border rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 ${fieldBorder(showErrors && missingListing)}`}
                  />
                )}
                {showErrors && missingListing && (
                  <p className="text-xs text-red-400 mt-1">Required</p>
                )}
              </div>

              {/* Campaign type toggle */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Campaign Type
                </label>
                <div className="flex gap-2">
                  {(["one-time", "recurring"] as CampaignType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCampaignType(t)}
                      className={`px-4 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150
                        ${campaignType === t
                          ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                          : "bg-light-gray text-medium-gray hover:text-charcoal border border-transparent"
                        }`}
                    >
                      {t === "one-time" ? "One-Time" : "Recurring"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template style toggle */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Template Style
                </label>
                <div className="flex gap-2">
                  {([{ id: "new_listing", label: "New Listing" }, { id: "broker_blast", label: "Broker Blast" }] as const).map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setTemplateStyle(style.id)}
                      className={`px-4 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150
                        ${templateStyle === style.id
                          ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                          : "bg-light-gray text-medium-gray hover:text-charcoal border border-transparent"
                        }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Heading — short description (replaces old Email Label button group) */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Heading - Short Description <span className="text-red-400">*</span>
                </label>
                <input
                  value={emailLabel}
                  onChange={(e) => setEmailLabel(e.target.value)}
                  placeholder="e.g. Just Listed, Price Reduced, New to Market..."
                  className={`w-full border rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 ${fieldBorder(showErrors && missingLabel)}`}
                />
                {showErrors && missingLabel && (
                  <p className="text-xs text-red-400 mt-1">Required</p>
                )}
              </div>

              {/* Heading */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Email Heading
                </label>
                <input
                  value={headingText}
                  onChange={(e) => setHeadingText(e.target.value)}
                  placeholder={listingName || "Property headline..."}
                  className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                />
              </div>

              {/* Body text */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Body Text
                </label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={3}
                  placeholder="Optional body paragraph..."
                  className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green resize-none"
                />
              </div>

              {/* Photo selector — gallery thumbnails when listing has photos, text input fallback */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Hero Photo
                </label>
                {/* Gallery thumbnail strip — shown when selected listing has multiple photos */}
                {selectedListing?.fieldData.gallery && selectedListing.fieldData.gallery.length > 0 ? (
                  <div>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selectedListing.fieldData.gallery.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoUrl(img.url)}
                          className={`flex-shrink-0 rounded-md overflow-hidden transition-all duration-150 ${
                            photoUrl === img.url
                              ? "ring-2 ring-green ring-offset-1 opacity-100"
                              : "opacity-60 hover:opacity-90"
                          }`}
                          title={img.alt || `Photo ${i + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={img.alt || `Listing photo ${i + 1}`}
                            className="w-20 h-14 object-cover"
                          />
                        </button>
                      ))}
                    </div>
                    {/* Show selected URL so they can see/override */}
                    <input
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      placeholder="Or paste a custom URL..."
                      className="mt-2 w-full border border-border-light rounded-btn px-3 py-1.5 text-xs text-muted-gray focus:outline-none focus:ring-1 focus:ring-green"
                    />
                  </div>
                ) : (
                  /* Fallback text input when no listing selected or no gallery */
                  <input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                  />
                )}
              </div>

              {/* Highlights */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Highlights
                </label>

                {/* Selected/added highlights as styled rows */}
                {highlights.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {highlights.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 bg-light-gray rounded-btn px-2.5 py-1.5 group"
                      >
                        {/* Inline-editable text */}
                        <input
                          value={h}
                          onChange={(e) => updateHighlight(i, e.target.value)}
                          placeholder={`Highlight ${i + 1}...`}
                          className="flex-1 bg-transparent text-sm text-charcoal focus:outline-none placeholder:text-border-medium"
                        />

                        {/* Reorder arrows */}
                        <button
                          onClick={() => moveHighlight(i, "up")}
                          disabled={i === 0}
                          className={`p-0.5 rounded text-xs leading-none ${
                            i === 0 ? "text-border-medium cursor-default" : "text-muted-gray hover:text-charcoal"
                          }`}
                          title="Move up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveHighlight(i, "down")}
                          disabled={i === highlights.length - 1}
                          className={`p-0.5 rounded text-xs leading-none ${
                            i === highlights.length - 1 ? "text-border-medium cursor-default" : "text-muted-gray hover:text-charcoal"
                          }`}
                          title="Move down"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Remove */}
                        <button
                          onClick={() => removeHighlight(i)}
                          className="p-0.5 text-muted-gray hover:text-red-500 text-sm leading-none"
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  {/* Show More Fields toggle — only when listing has available chips */}
                  {cmsChips.length > 0 && (
                    <button
                      onClick={() => setShowMoreFields(!showMoreFields)}
                      className="text-xs text-muted-gray hover:text-charcoal font-medium flex items-center gap-1"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform duration-150 ${showMoreFields ? "rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      {showMoreFields ? "Hide Fields" : "Show More Fields"}
                    </button>
                  )}
                  <button
                    onClick={addCustomHighlight}
                    className="text-xs text-green hover:text-charcoal font-medium"
                  >
                    + Add Custom
                  </button>
                </div>

                {/* Expandable CMS chip panel */}
                {showMoreFields && availableChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 p-2.5 bg-white border border-border-light rounded-btn">
                    {availableChips.map((chip) => (
                      <button
                        key={chip.key}
                        onClick={() => addChipAsHighlight(chip.value)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-light-gray text-medium-gray hover:bg-charcoal hover:text-white transition-colors duration-150"
                      >
                        + {chip.label}
                      </button>
                    ))}
                  </div>
                )}
                {showMoreFields && availableChips.length === 0 && cmsChips.length > 0 && (
                  <p className="text-xs text-border-medium mt-2">All fields added</p>
                )}
              </div>

              {/* Listing page URL */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Listing Page URL
                </label>
                <input
                  value={listingPageUrl}
                  onChange={(e) => setListingPageUrl(e.target.value)}
                  placeholder="https://cre8advisors.com/listings/..."
                  className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                />
              </div>

              {/* Broker selector */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Sending Broker <span className="text-red-400">*</span>
                </label>
                <select
                  value={brokerId}
                  onChange={(e) => setBrokerId(e.target.value)}
                  className={`w-full border rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 ${fieldBorder(showErrors && missingBroker)}`}
                >
                  <option value="">Select broker...</option>
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {showErrors && missingBroker && (
                  <p className="text-xs text-red-400 mt-1">Required</p>
                )}
              </div>

              {/* Segment selector */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Contact Segment
                </label>
                <select
                  value={segmentId}
                  onChange={(e) => setSegmentId(e.target.value)}
                  className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                >
                  {segments.filter((s) => s.enabled).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Frequency (recurring only) */}
              {campaignType === "recurring" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                      Frequency
                    </label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as CampaignFrequency)}
                      className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="bi-weekly">Bi-Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                      End Date (optional)
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                    />
                  </div>
                </>
              )}
              </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal transition-colors"
              >
                Cancel
              </button>
              {campaignCategory === "listing" && (
                <>
                  <button
                    onClick={() => setShowPreview(true)}
                    className="px-4 py-2 text-sm font-medium text-charcoal bg-white border border-border-light rounded-btn hover:bg-light-gray transition-colors"
                  >
                    Preview Email
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="px-5 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition"
                  >
                    {isEdit ? "Update & Reschedule" : "Create & Schedule"}
                  </button>
                </>
              )}
            </div>

            {/* Email preview modal — uses current form state */}
            {showPreview && (
              <EmailPreview
                campaign={{
                  listing_id: listingId,
                  listing_name: listingName,
                  campaign_type: campaignType,
                  email_label: emailLabel.trim(),
                  heading_text: headingText || undefined,
                  body_text: bodyText || undefined,
                  photo_url: photoUrl || undefined,
                  highlights: highlights.filter((h) => h.trim()),
                  listing_page_url: listingPageUrl || undefined,
                  broker_id: brokerId,
                  broker_name: selectedSender?.name || BROKERS[brokerId] || "",
                  broker_email: selectedSender?.email || BROKER_CONTACTS[brokerId]?.email || "",
                  broker_phone: selectedSender?.phone || BROKER_CONTACTS[brokerId]?.phone || "",
                }}
                onClose={() => setShowPreview(false)}
              />
            )}
      </div>
    </div>
  );
}
