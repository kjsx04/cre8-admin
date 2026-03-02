"use client";

import { useState, useEffect } from "react";
import { CampaignFormData, CampaignType, CampaignFrequency, EmailSender, EmailSegment, Campaign } from "@/lib/email/types";
import { EMAIL_LABELS } from "@/lib/email/constants";
import { ListingItem, BROKERS, BROKER_CONTACTS } from "@/lib/admin-constants";

interface CampaignFormProps {
  onSubmit: (data: CampaignFormData, autoSchedule: boolean) => Promise<void>;
  onClose: () => void;
  existingCampaign?: Campaign | null;
  listings?: ListingItem[];
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
  const [saving, setSaving] = useState(false);

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

  const handleSubmit = async () => {
    if (!listingId || !listingName || !brokerId) return;
    setSaving(true);

    const label = emailLabel === "custom" ? customLabel : emailLabel;

    const data: CampaignFormData = {
      listing_id: listingId,
      listing_name: listingName,
      campaign_type: campaignType,
      email_label: label,
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

    await onSubmit(data, true); // always auto-schedule
    setSaving(false);
  };

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
          {/* Listing selector */}
          <div>
            <label className="block text-xs font-semibold text-muted-gray uppercase tracking-wide mb-1">
              Listing
            </label>
            {listings && listings.length > 0 ? (
              <select
                value={listingId}
                onChange={(e) => handleListingChange(e.target.value)}
                className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
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
                className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
              />
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
              Email Label
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
                className="mt-2 w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
              />
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
              Sending Broker
            </label>
            <select
              value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
              className="w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green"
            >
              <option value="">Select broker...</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
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
            disabled={saving || !listingId || !brokerId}
            className="px-5 py-2 bg-green text-white text-sm font-semibold rounded-btn hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Scheduling..." : isEdit ? "Update & Reschedule" : "Create & Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
