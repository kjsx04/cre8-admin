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
import PhotoPicker from "./PhotoPicker";
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
  broker: "a broker",
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
    // Before a listing is picked, show the template defaults so the shape reads
    if (!draft.listingId) {
      input.heading_text = draft.headingText || "Property Name";
    }
    return wrapPreviewHtml(renderEmailHtml(buildTemplateVars(input)));
  }, [formData, draft.listingId, draft.headingText]);

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
      setToastDone(true);
    } catch (err) {
      setToastError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [userEmail, campaign?.id]);

  const handleSubmit = () => {
    if (!isValid || (toastVisible && !toastError)) return;
    lastPayloadRef.current = formData;
    runSubmit();
  };

  const goBack = () => router.push("/marketing/email");

  // ── Unsaved-changes guard ──
  const handleBack = () => {
    if (dirty && !submittedRef.current && !window.confirm("Discard changes?")) return;
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
  const revealed = !!draft.listingId;
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
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
            >
              {isEdit ? "Update" : "Schedule"}
            </button>
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

          <Section n={1} title="Listing">
            <ListingPicker
              listings={listings}
              loading={listingsLoading}
              selected={selectedListing}
              fallbackName={draft.listingName}
              onPick={pickListing}
            />
          </Section>

          {revealed && (
            <div className="space-y-8 composer-reveal">
              {/* Same order as the email, top to bottom */}
              <Section n={2} title="Heading">
                <div className="space-y-2.5">
                  {/* Placeholders are exactly what the email shows when the field is left blank.
                      Small green top line = listing name (override below); big white line = the heading typed here. */}
                  <input
                    {...fieldProps("label")}
                    value={draft.emailLabel}
                    onChange={(e) => set("emailLabel", e.target.value)}
                    placeholder="Just Listed"
                    className={INPUT}
                  />
                  <input
                    {...fieldProps("heading")}
                    value={draft.headingText}
                    onChange={(e) => set("headingText", e.target.value)}
                    placeholder={(draft.listingName || "Property Name").toUpperCase()}
                    className={`${INPUT} text-xs uppercase tracking-wide`}
                  />
                </div>
              </Section>

              <Section n={3} title="Photo">
                <PhotoPicker
                  gallery={selectedListing?.fieldData.gallery || []}
                  photoUrl={draft.photoUrl}
                  onChange={(url) => set("photoUrl", url)}
                  fieldProps={fieldProps}
                />
              </Section>

              <Section n={4} title="Body">
                <textarea
                  {...fieldProps("body")}
                  value={draft.bodyText}
                  onChange={(e) => set("bodyText", e.target.value)}
                  placeholder="Optional — a short paragraph under the photo"
                  rows={4}
                  className={`${INPUT} resize-y`}
                />
              </Section>

              <Section n={5} title="Details">
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

              <Section n={6} title="Listing Link">
                <input
                  {...fieldProps("cta")}
                  value={draft.listingPageUrl}
                  onChange={(e) => set("listingPageUrl", e.target.value)}
                  placeholder="https://cre8advisors.com/listings/…"
                  className={`${INPUT} text-xs`}
                />
              </Section>

              <Section n={7} title="Broker">
                <BrokerPicker
                  brokerIds={draft.brokerIds}
                  onChange={(ids) => set("brokerIds", ids)}
                  fieldProps={fieldProps}
                />
              </Section>

              <Section n={8} title="Audience">
                <Segmented
                  value={draft.segmentId}
                  options={EMAIL_SEGMENTS.filter((s) => s.enabled).map((s) => ({ id: s.id, label: s.name }))}
                  onChange={(v) => set("segmentId", v)}
                />
              </Section>

              <Section n={9} title="Frequency">
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

              <Section n={10} title="Priority">
                <div className="space-y-2">
                  <Segmented
                    value={draft.priority}
                    options={[
                      { id: "high", label: "Highest" },
                      { id: "normal", label: "Normal" },
                    ]}
                    onChange={(v) => set("priority", v as CampaignPriority)}
                  />
                  <p className="text-xs text-muted-gray">
                    {draft.priority === "high"
                      ? "AI grabs the best slot in the next few days, moving others if needed."
                      : "AI fits it into the next open slot."}
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
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-charcoal text-white text-[10px] font-bold flex items-center justify-center">
          {n}
        </span>
        <h2 className="text-xs font-semibold text-muted-gray uppercase tracking-wide">{title}</h2>
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
