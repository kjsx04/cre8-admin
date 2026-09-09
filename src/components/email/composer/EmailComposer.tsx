"use client";

/**
 * EmailComposer — full-page campaign builder.
 *
 * Left: the real email, rendered live from the template on every keystroke.
 * Right: short sections in the same top-to-bottom order as the email
 * (Listing → Heading → Photo → Body → Details → Listing Link → Broker),
 * then Audience → Frequency → Priority for the send itself.
 * Click a region in the email and its input focuses; focus an input and the
 * region lights up. One button: Schedule (create) or Update (edit).
 *
 * The payload and API calls are identical to the old modal — only the UI changed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { Campaign, CampaignFrequency, CampaignPriority } from "@/lib/email/types";
import { ListingItem } from "@/lib/admin-constants";
import { buildTemplateVars, renderEmailHtml, EMAIL_SEGMENTS } from "@/lib/email/constants";
import { wrapPreviewHtml, PreviewField } from "@/lib/email/preview-wrapper";
import { buildCmsChips, formatScheduleDate } from "@/lib/email/utils";
import { submitCampaign } from "@/lib/email/submit";
import SchedulingAnimation from "../SchedulingAnimation";
import LivePreviewFrame from "./LivePreviewFrame";
import TestSendControl from "./TestSendControl";
import ListingPicker from "./ListingPicker";
import GroupListingsPicker from "./GroupListingsPicker";
import PhotoPicker from "./PhotoPicker";
import PartnerLogoPicker from "./PartnerLogoPicker";
import BrokerPicker from "./BrokerPicker";
import DetailsEditor from "./DetailsEditor";
import { useCampaignDraft, MissingField } from "./useCampaignDraft";
import { FieldBinding, FieldProps } from "./fieldProps";

interface EmailComposerProps {
  mode: "create" | "edit";
  campaign?: Campaign | null;
  listings: ListingItem[];
  listingsLoading: boolean;
}

const INPUT = "w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal placeholder:text-border-medium focus:outline-none focus:ring-1 focus:ring-green";

const MISSING_COPY: Record<MissingField, string> = {
  listing: "a listing",
  group: "at least 2 listings",
  broker: "a broker",
  partnerLogo: "the partner logo (click Apply)",
};

/** "Add a listing, a broker and a label" */
function missingHint(missing: MissingField[]): string {
  if (missing.length === 0) return "";
  const parts = missing.map((m) => MISSING_COPY[m]);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Add ${list}`;
}

export default function EmailComposer({ mode, campaign, listings, listingsLoading }: EmailComposerProps) {
  const router = useRouter();
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  const {
    draft, set, pickListing,
    addHighlight, updateHighlight, moveHighlight, removeHighlight,
    formData, missing, isValid, dirty,
    restored, restoredAt, discardRestored, forgetStored,
  } = useCampaignDraft({ campaign, userEmail });

  const isEdit = mode === "edit";
  const selectedListing = useMemo(
    () => listings.find((l) => l.id === draft.listingId),
    [listings, draft.listingId]
  );
  const chips = useMemo(
    () => (selectedListing ? buildCmsChips(selectedListing.fieldData) : []),
    [selectedListing]
  );

  // ── Live preview ──
  const previewHtml = useMemo(() => {
    const input: Record<string, unknown> = { ...formData };
    // While a partner logo is being adjusted it's a data: URL — show it in the preview anyway
    if (draft.partnerLogoUrl) {
      input.partner_logo_url = draft.partnerLogoUrl;
      input.partner_logo_width = draft.partnerLogoWidth;
      input.partner_logo_height = draft.partnerLogoHeight;
    }
    // Before a listing is picked, show the template defaults so the shape reads
    if (draft.kind === "group") {
      input.heading_text = draft.headingText || "CRE8 Advisors";
      input.email_label = draft.emailLabel || "Featured Listings";
    } else if (!draft.listingId) {
      input.heading_text = draft.headingText || "Property Name";
    }
    return wrapPreviewHtml(renderEmailHtml(buildTemplateVars(input)));
  }, [formData, draft.kind, draft.listingId, draft.headingText, draft.emailLabel, draft.partnerLogoUrl, draft.partnerLogoWidth, draft.partnerLogoHeight]);

  // ── Focus bridge: preview region ⇄ input ──
  const [activeField, setActiveField] = useState<PreviewField | null>(null);
  const fieldEls = useRef(new Map<PreviewField, HTMLElement>());
  const bindings = useRef(new Map<PreviewField, FieldBinding>());

  const fieldProps: FieldProps = useCallback((field) => {
    let b = bindings.current.get(field);
    if (!b) {
      b = {
        ref: (el) => {
          if (el) fieldEls.current.set(field, el);
          else fieldEls.current.delete(field);
        },
        onFocus: () => setActiveField(field),
        onBlur: () => setActiveField((cur) => (cur === field ? null : cur)),
      };
      bindings.current.set(field, b);
    }
    return b;
  }, []);

  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  const handleFieldClick = useCallback((field: PreviewField) => {
    setMobileTab("edit");
    const el = fieldEls.current.get(field);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setActiveField(field);
  }, []);

  // ── Submit + toast ──
  const [toastVisible, setToastVisible] = useState(false);
  const [toastDone, setToastDone] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const lastPayloadRef = useRef(formData);

  const runSubmit = useCallback(async () => {
    setToastVisible(true);
    setToastDone(false);
    setToastError(null);
    try {
      await submitCampaign(lastPayloadRef.current, userEmail, campaign?.id);
      submittedRef.current = true;
      forgetStored(); // it's saved for real now
      setToastDone(true);
    } catch (err) {
      setToastError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [userEmail, campaign?.id, forgetStored]);

  const handleSubmit = () => {
    if (!isValid || (toastVisible && !toastError)) return;
    lastPayloadRef.current = formData;
    runSubmit();
  };

  // ── Send now: save (create or update) without AI scheduling, then fire immediately ──
  const [sendNowOpen, setSendNowOpen] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [sendNowError, setSendNowError] = useState<string | null>(null);

  const runSendNow = async () => {
    setSendingNow(true);
    setSendNowError(null);
    try {
      // 1. Save the campaign as-is (no auto_schedule)
      const saveRes = await fetch(campaign?.id ? `/api/email/campaigns/${campaign.id}` : "/api/email/campaigns", {
        method: campaign?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ ...formData, auto_schedule: false }),
      });
      const saved = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saved.error || "Couldn't save the campaign");
      // 2. Fire it
      const sendRes = await fetch(`/api/email/campaigns/${saved.id}/send-now`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      const sent = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) throw new Error(sent.error || "Send failed");
      submittedRef.current = true;
      forgetStored();
      router.push("/marketing/email");
    } catch (err) {
      setSendNowError(err instanceof Error ? err.message : "Send failed");
      setSendingNow(false);
    }
  };

  const goBack = () => router.push("/marketing/email");

  // ── Unsaved-changes guard ──
  const handleBack = () => {
    if (dirty && !submittedRef.current) {
      if (!window.confirm("Discard changes?")) return;
      forgetStored();
    }
    goBack();
  };

  useEffect(() => {
    if (!dirty || submittedRef.current) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const submitting = toastVisible && !toastError;
  const isGroup = draft.kind === "group";
  const revealed = isGroup ? draft.groupListings.length > 0 : !!draft.listingId;
  const hint = missingHint(missing);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b border-border-light">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-btn border border-border-light text-charcoal hover:bg-light-gray transition-colors disabled:opacity-40"
            title="Back to campaigns"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="font-bebas text-2xl tracking-wide text-charcoal whitespace-nowrap">
            {isEdit ? "Edit Campaign" : "New Campaign"}
          </h1>
          {isEdit && draft.listingName && (
            <span className="text-sm text-muted-gray truncate hidden sm:inline">{draft.listingName}</span>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden md:flex">
            <TestSendControl campaign={formData} disabled={!draft.listingId} />
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              {/* Send now — skips the AI */}
              <button
                type="button"
                onClick={() => setSendNowOpen(true)}
                disabled={!isValid || submitting || sendingNow}
                className="px-4 py-2 bg-charcoal text-white uppercase tracking-wide text-sm font-semibold rounded-btn hover:bg-black transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Send to the audience right now instead of letting the AI pick a time"
              >
                Send now
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isValid || submitting || sendingNow}
                className="px-5 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
              >
                {isEdit ? "Update" : "Schedule"}
              </button>
            </div>
            {hint && <span className="text-[11px] text-muted-gray mt-1">{hint}</span>}
          </div>
        </div>
      </div>

      {/* ── Mobile tabs ── */}
      <div className="flex lg:hidden border-b border-border-light shrink-0">
        {(["edit", "preview"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
              mobileTab === tab ? "text-charcoal border-green" : "text-medium-gray border-transparent"
            }`}
          >
            {tab === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      {/* Restored-draft notice */}
      {restored && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2 bg-[#f0fce8] border-b border-border-light text-xs text-charcoal">
          <span>
            Restored your unsaved work
            {restoredAt && <span className="text-muted-gray"> from {new Date(restoredAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
          </span>
          <button type="button" onClick={discardRestored} className="text-xs font-medium text-muted-gray hover:text-charcoal underline">
            Start fresh
          </button>
        </div>
      )}

      {/* ── Split panes ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: live email */}
        <div
          data-scroll-pane
          className={`w-full lg:w-[60%] overflow-y-auto bg-light-gray p-6 lg:p-10 relative ${
            mobileTab === "preview" ? "block" : "hidden lg:block"
          }`}
        >
          <div className={`mx-auto w-full max-w-[600px] transition-opacity duration-300 ${revealed ? "opacity-100" : "opacity-40"}`}>
            <LivePreviewFrame
              html={previewHtml}
              activeField={activeField}
              onFieldClick={handleFieldClick}
              className="rounded-card shadow-sm"
            />
          </div>
          {!revealed && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
              <span className="px-4 py-2 rounded-full bg-white/90 border border-border-light text-sm text-muted-gray shadow-sm">
                Choose a listing to begin
              </span>
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div
          className={`w-full lg:w-[40%] shrink-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-border-light px-6 lg:px-8 py-6 space-y-8 ${
            mobileTab === "edit" ? "block" : "hidden lg:block"
          }`}
        >
          {/* Test send lives here on small screens */}
          <div className="md:hidden">
            <TestSendControl campaign={formData} disabled={!draft.listingId} />
          </div>

          <Section n={1} title={isGroup ? "Listings" : "Listing"}>
            <div className="space-y-3">
              {/* One listing, or a group of several in one email (can't switch after creating) */}
              {!isEdit && (
                <Segmented
                  value={draft.kind}
                  options={[
                    { id: "single", label: "One listing" },
                    { id: "group", label: "Group of listings" },
                  ]}
                  onChange={(v) => set("kind", v as "single" | "group")}
                />
              )}
              {isGroup ? (
                <GroupListingsPicker
                  listings={listings}
                  loading={listingsLoading}
                  cards={draft.groupListings}
                  onChange={(cards) => set("groupListings", cards)}
                  fieldProps={fieldProps}
                />
              ) : (
                <ListingPicker
                  listings={listings}
                  loading={listingsLoading}
                  selected={selectedListing}
                  fallbackName={draft.listingName}
                  onPick={pickListing}
                />
              )}
            </div>
          </Section>

          {revealed && (
            <div className="space-y-8 composer-reveal">
              {/* Same order as the email, top to bottom */}
              <Section n={2} title="Heading">
                <div className="space-y-2.5">
                  {/* Placeholders are exactly what the email shows when the field is left blank.
                      Small green top line = listing name (override below); big white line = the heading typed here. */}
                  {/* Same order as the email: small green top line first, big white heading second */}
                  <input
                    {...fieldProps("heading")}
                    value={draft.headingText}
                    onChange={(e) => set("headingText", e.target.value)}
                    placeholder={isGroup ? "CRE8 ADVISORS" : (draft.listingName || "Property Name").toUpperCase()}
                    className={`${INPUT} text-xs uppercase tracking-wide`}
                  />
                  <input
                    {...fieldProps("label")}
                    value={draft.emailLabel}
                    onChange={(e) => set("emailLabel", e.target.value)}
                    placeholder={isGroup ? "Featured Listings — e.g. Land Opportunities in the West Valley" : "Just Listed"}
                    className={INPUT}
                  />
                </div>
              </Section>

              <Section n={3} title="Partner Logo" note="optional">
                <PartnerLogoPicker
                  url={draft.partnerLogoUrl}
                  onPreview={(dataUrl, w, h) => {
                    set("partnerLogoUrl", dataUrl);
                    set("partnerLogoWidth", w);
                    set("partnerLogoHeight", h);
                  }}
                  onApply={({ url, width, height }) => {
                    set("partnerLogoUrl", url);
                    set("partnerLogoWidth", width);
                    set("partnerLogoHeight", height);
                  }}
                  onRemove={() => {
                    set("partnerLogoUrl", "");
                    set("partnerLogoWidth", 0);
                    set("partnerLogoHeight", 0);
                  }}
                  fieldProps={fieldProps}
                />
              </Section>

              {!isGroup && (
              <Section n={4} title="Photo">
                <PhotoPicker
                  gallery={selectedListing?.fieldData.gallery || []}
                  photoUrl={draft.photoUrl}
                  onChange={(url) => set("photoUrl", url)}
                  fieldProps={fieldProps}
                />
              </Section>
              )}

              <Section n={5} title={isGroup ? "Intro" : "Body"}>
                <textarea
                  {...fieldProps("body")}
                  value={draft.bodyText}
                  onChange={(e) => set("bodyText", e.target.value)}
                  placeholder={isGroup ? "Optional — a short intro above the listings" : "Optional — a short paragraph under the photo"}
                  rows={4}
                  className={`${INPUT} resize-y`}
                />
              </Section>

              {!isGroup && (
              <Section n={6} title="Details">
                <DetailsEditor
                  rows={draft.highlights}
                  chips={chips}
                  onUpdate={updateHighlight}
                  onMove={moveHighlight}
                  onRemove={removeHighlight}
                  onAdd={addHighlight}
                  fieldProps={fieldProps}
                />
              </Section>

              )}

              {!isGroup && (
              <Section n={7} title="Listing Link">
                <input
                  {...fieldProps("cta")}
                  value={draft.listingPageUrl}
                  onChange={(e) => set("listingPageUrl", e.target.value)}
                  placeholder="https://cre8advisors.com/listings/…"
                  className={`${INPUT} text-xs`}
                />
              </Section>

              )}

              <Section n={8} title="Broker">
                <BrokerPicker
                  brokerIds={draft.brokerIds}
                  onChange={(ids) => set("brokerIds", ids)}
                  fieldProps={fieldProps}
                />
              </Section>

              <Section n={9} title="Audience">
                <Segmented
                  value={draft.segmentId}
                  options={EMAIL_SEGMENTS.filter((s) => s.enabled).map((s) => ({ id: s.id, label: s.name }))}
                  onChange={(v) => set("segmentId", v)}
                />
              </Section>

              <Section n={10} title="Frequency">
                <div className="space-y-3">
                  <Segmented
                    value={draft.campaignType}
                    options={[
                      { id: "one-time", label: "One-time" },
                      { id: "recurring", label: "Recurring" },
                    ]}
                    onChange={(v) => set("campaignType", v as "one-time" | "recurring")}
                  />
                  {draft.campaignType === "recurring" && (
                    <div className="space-y-3 composer-reveal">
                      <label className="flex items-center gap-2 text-xs text-charcoal cursor-pointer">
                        <input type="checkbox" checked={draft.pinned} onChange={(e) => set("pinned", e.target.checked)} className="accent-[#8CC644]" />
                        Keep this cadence (don&apos;t slow it down as the listing ages)
                      </label>
                      <Segmented
                        value={draft.frequency}
                        options={[
                          { id: "weekly", label: "Weekly" },
                          { id: "bi-weekly", label: "Bi-weekly" },
                          { id: "monthly", label: "Monthly" },
                        ]}
                        onChange={(v) => set("frequency", v as CampaignFrequency)}
                      />
                      <div className="flex items-center gap-3">
                        <label className="text-[11px] font-semibold text-muted-gray uppercase tracking-wide">Ends</label>
                        <input
                          type="date"
                          value={draft.endDate}
                          onChange={(e) => set("endDate", e.target.value)}
                          className={`${INPUT} w-auto`}
                        />
                        {draft.endDate && (
                          <button type="button" onClick={() => set("endDate", "")} className="text-xs text-muted-gray hover:text-charcoal">
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              <Section n={11} title="Priority">
                <div className="space-y-2">
                  <Segmented
                    value={draft.priority}
                    options={[
                      { id: "high", label: "Top of list" },
                      { id: "normal", label: "Normal" },
                    ]}
                    onChange={(v) => set("priority", v as CampaignPriority)}
                  />
                  <p className="text-xs text-muted-gray">
                    {draft.priority === "high"
                      ? "Goes to #1 in the Priorities list — AI grabs the best slot in the next few days, moving others if needed."
                      : "Joins the bottom of the Priorities list — AI fits it into the next open slot. Reorder anytime from the schedule page."}
                    {isEdit && campaign?.scheduled_date && (
                      <> Currently {formatScheduleDate(campaign.scheduled_date)}.</>
                    )}
                  </p>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>

      {/* ── Send now confirm ── */}
      {sendNowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !sendingNow && setSendNowOpen(false)} />
          <div className="relative bg-white rounded-card shadow-lg w-full max-w-md p-6">
            <h3 className="font-bebas text-2xl tracking-wide text-charcoal">Send now?</h3>
            <p className="text-sm text-charcoal mt-2">
              <span className="font-medium">{formData.email_label}: {formData.listing_name}</span> goes to{" "}
              <span className="font-medium">{formData.segment_name}</span> within a couple of minutes, from {formData.broker_name}.
            </p>
            {formData.campaign_type === "recurring" && (
              <p className="text-xs text-muted-gray mt-2">It&apos;s recurring, so the {formData.frequency} cadence starts from today.</p>
            )}
            {sendNowError && <p className="text-xs text-red-500 mt-2">{sendNowError}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setSendNowOpen(false)} disabled={sendingNow} className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal disabled:opacity-40">
                Cancel
              </button>
              <button type="button" onClick={runSendNow} disabled={sendingNow} className="px-5 py-2 bg-charcoal text-white uppercase tracking-wide text-sm font-semibold rounded-btn hover:bg-black disabled:opacity-50">
                {sendingNow ? "Sending…" : "Yes, send now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scheduling toast ── */}
      {toastVisible && (
        <SchedulingAnimation
          apiDone={toastDone}
          apiError={toastError}
          onComplete={goBack}
          onRetry={runSubmit}
          mode={mode}
        />
      )}

      {/* Reveal animation for sections that appear after a listing is picked */}
      <style jsx global>{`
        @keyframes composer-reveal {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .composer-reveal { animation: composer-reveal 250ms ease-out both; }
      `}</style>
    </div>
  );
}

/** Numbered section: badge + two-word title */
function Section({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-charcoal text-white text-[10px] font-bold flex items-center justify-center">
          {n}
        </span>
        <h2 className="text-xs font-semibold text-muted-gray uppercase tracking-wide">{title}</h2>
        {note && <span className="text-[11px] text-muted-gray/70 normal-case tracking-normal">· {note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Segmented toggle (same look as the old form's button pairs) */
function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-4 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150 ${
            value === o.id
              ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
              : "bg-light-gray text-medium-gray hover:text-charcoal border border-transparent"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
