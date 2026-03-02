"use client";

import { useState, useEffect, useCallback } from "react";
import { CampaignFormData, CampaignType, CampaignFrequency, EmailSender, EmailSegment, Campaign } from "@/lib/email/types";
import { EMAIL_LABELS } from "@/lib/email/constants";
import { ListingItem, ListingFieldData, BROKERS, BROKER_CONTACTS } from "@/lib/admin-constants";
import SchedulingAnimation from "./SchedulingAnimation";

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
  if (fd["property-type"]) chips.push({ key: "property-type", label: "Property Type", value: fd["property-type"] });
  if (fd["listing-type-2"]) chips.push({ key: "listing-type-2", label: "Listing Type", value: fd["listing-type-2"] });
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
  const [listingId, setListingId] = useState(existingCampaign?.listing_id || "");
  const [listingName, setListingName] = useState(existingCampaign?.listing_name || "");
  const [campaignType, setCampaignType] = useState<CampaignType>(existingCampaign?.campaign_type || "one-time");
  const [emailLabel, setEmailLabel] = useState(existingCampaign?.email_label || "Just Listed");
  const [customLabel, setCustomLabel] = useState("");
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

  // Scheduling animation state
  const [saving, setSaving] = useState(false);
  const [apiDone, setApiDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Validation state
  const [showErrors, setShowErrors] = useState(false);

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

      // Auto-build highlights from listing fields
      const autoHighlights: string[] = [];
      if (fd["list-price"]) autoHighlights.push(`Price: ${fd["list-price"]}`);
      if (fd["square-feet"]) autoHighlights.push(`${fd["square-feet"]} Acres`);
      if (fd.zoning) autoHighlights.push(`Zoning: ${fd.zoning}`);
      if (fd["city-county"]) autoHighlights.push(fd["city-county"]);
      if (autoHighlights.length > 0) setHighlights([...autoHighlights, ""]);
    }
  };

  // Get selected broker details
  const selectedSender = senders.find((s) => s.id === brokerId);
  const selectedSegment = segments.find((s) => s.id === segmentId);

  // Highlight row management
  const updateHighlight = (idx: number, val: string) => {
    const next = [...highlights];
    next[idx] = val;
    setHighlights(next);
  };
  const addHighlight = () => setHighlights([...highlights, ""]);
  const removeHighlight = (idx: number) => {
    const next = highlights.filter((_, i) => i !== idx);
    setHighlights(next.length > 0 ? next : [""]);
  };

  // Check if a CMS chip value is already in highlights
  const isChipAdded = (chipValue: string) =>
    highlights.some((h) => h.trim() === chipValue.trim());

  // Add a CMS chip value as a new highlight row
  const addChipAsHighlight = (chipValue: string) => {
    if (isChipAdded(chipValue)) return;
    // Replace the trailing empty row or append
    const lastEmpty = highlights.length > 0 && highlights[highlights.length - 1].trim() === "";
    if (lastEmpty) {
      const next = [...highlights];
      next[next.length - 1] = chipValue;
      setHighlights([...next, ""]);
    } else {
      setHighlights([...highlights, chipValue, ""]);
    }
  };

  // Validation: required fields
  const resolvedLabel = emailLabel === "custom" ? customLabel : emailLabel;
  const missingListing = !listingId;
  const missingBroker = !brokerId;
  const missingLabel = !resolvedLabel.trim();

  const handleSubmit = async () => {
    // Check required fields — show errors if missing
    if (missingListing || missingBroker || missingLabel) {
      setShowErrors(true);
      return;
    }

    // Start the scheduling animation
    setSaving(true);
    setApiDone(false);
    setApiError(null);

    const data: CampaignFormData = {
      listing_id: listingId,
      listing_name: listingName,
      campaign_type: campaignType,
      email_label: resolvedLabel,
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

    try {
      await onSubmit(data, true); // always auto-schedule
      setApiDone(true);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to schedule campaign");
    }
  };

  // After animation completes, close modal
  const handleAnimationComplete = useCallback(() => {
    setSaving(false);
    onClose();
  }, [onClose]);

  // Retry after error — reset animation state
  const handleRetry = () => {
    setSaving(false);
    setApiDone(false);
    setApiError(null);
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

        {/* Scheduling animation overlay — replaces form body when saving */}
        {saving ? (
          <SchedulingAnimation
            apiDone={apiDone}
            apiError={apiError}
            onComplete={handleAnimationComplete}
            onRetry={handleRetry}
          />
        ) : (
          <>
            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
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
                          ? "bg-charcoal text-white"
                          : "bg-light-gray text-medium-gray hover:text-charcoal"
                        }`}
                    >
                      {t === "one-time" ? "One-Time" : "Recurring"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email label */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Email Label <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {EMAIL_LABELS.map((label) => (
                    <button
                      key={label}
                      onClick={() => setEmailLabel(label)}
                      className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150
                        ${emailLabel === label
                          ? "bg-charcoal text-white"
                          : "bg-light-gray text-medium-gray hover:text-charcoal"
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => setEmailLabel("custom")}
                    className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150
                      ${emailLabel === "custom"
                        ? "bg-charcoal text-white"
                        : "bg-light-gray text-medium-gray hover:text-charcoal"
                      }`}
                  >
                    Custom
                  </button>
                </div>
                {emailLabel === "custom" && (
                  <input
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Enter custom label..."
                    className={`mt-2 w-full border rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 ${fieldBorder(showErrors && missingLabel)}`}
                  />
                )}
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

              {/* Photo URL */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Photo URL
                </label>
                <input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                />
              </div>

              {/* Highlights */}
              <div>
                <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
                  Highlights
                </label>

                {/* CMS field chips — shown when a listing is selected */}
                {cmsChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {cmsChips.map((chip) => {
                      const added = isChipAdded(chip.value);
                      return (
                        <button
                          key={chip.key}
                          onClick={() => addChipAsHighlight(chip.value)}
                          disabled={added}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150 ${
                            added
                              ? "bg-green/10 text-green/60 cursor-default"
                              : "bg-light-gray text-medium-gray hover:bg-charcoal hover:text-white"
                          }`}
                        >
                          {added && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {chip.label}: {chip.value.replace(`${chip.label}: `, "").substring(0, 30)}
                          {chip.value.replace(`${chip.label}: `, "").length > 30 ? "..." : ""}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  {highlights.map((h, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={h}
                        onChange={(e) => updateHighlight(i, e.target.value)}
                        placeholder={`Highlight ${i + 1} (e.g., "5.2 Acres")`}
                        className="flex-1 border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
                      />
                      {highlights.length > 1 && (
                        <button
                          onClick={() => removeHighlight(i)}
                          className="text-muted-gray hover:text-red-500 text-sm px-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addHighlight}
                    className="text-xs text-green hover:text-charcoal font-medium"
                  >
                    + Add highlight
                  </button>
                </div>
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
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-5 py-2 bg-green text-white text-sm font-semibold rounded-btn hover:brightness-110 transition"
              >
                {isEdit ? "Update & Reschedule" : "Create & Schedule"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
