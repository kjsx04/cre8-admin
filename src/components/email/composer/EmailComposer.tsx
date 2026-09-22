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
import { ChevronLeft } from "lucide-react";
import { Campaign, CampaignFrequency, CampaignPriority } from "@/lib/email/types";
import { ListingItem } from "@/lib/admin-constants";
import { buildTemplateVars, renderEmailHtml, EMAIL_SEGMENTS } from "@/lib/email/constants";
import { useAudienceCounts, formatCount, recipientLine } from "@/lib/email/audience-client";
import { wrapPreviewHtml, PreviewField } from "@/lib/email/preview-wrapper";
import { buildCmsChips, formatScheduleDate } from "@/lib/email/utils";
import { submitCampaign } from "@/lib/email/submit";
import { Button, Card, Field, IconButton, Input, Modal, Section, Tabs, Textarea, useConfirm } from "@/components/ui";
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

const MISSING_COPY: Record<MissingField, string> = {
  type: "the email type",
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
  return missing[0] === "type" ? "Choose the email type" : `Add ${list}`;
}

export default function EmailComposer({ mode, campaign, listings, listingsLoading }: EmailComposerProps) {
  const router = useRouter();
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  // Shared confirm dialog — replaces the browser's native confirm on "Discard changes?"
  const confirmDialog = useConfirm();

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
    // Group emails show exactly what's typed (blank stays blank), so no defaults there
    if (draft.kind !== "group" && !draft.listingId) {
      input.heading_text = draft.headingText || "Property Name";
    }
    return wrapPreviewHtml(renderEmailHtml(buildTemplateVars(input)));
  }, [formData, draft.kind, draft.listingId, draft.headingText, draft.emailLabel, draft.partnerLogoUrl, draft.partnerLogoWidth, draft.partnerLogoHeight]);

  // ── Focus bridge: preview region ⇄ input ──
  const [activeField, setActiveField] = useState<PreviewField | null>(null);
  // Who each audience goes to and how many — shown on the audience buttons + confirm dialogs
  const audience = useAudienceCounts();
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
  const handleBack = async () => {
    if (dirty && !submittedRef.current) {
      const ok = await confirmDialog({ title: "Discard changes?", confirmLabel: "Discard", tone: "danger" });
      if (!ok) return;
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
  // Everything after "Type" shows as soon as the type is chosen (edit mode: always)
  const revealed = isEdit || draft.kind !== "";
  const hint = missingHint(missing);

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <IconButton
            variant="secondary"
            size="sm"
            label="Back to campaigns"
            icon={<ChevronLeft size={18} strokeWidth={1.75} />}
            onClick={handleBack}
            disabled={submitting}
          />
          <h1 className="text-lg font-semibold text-text whitespace-nowrap">
            {isEdit ? "Edit campaign" : "New campaign"}
          </h1>
          {isEdit && draft.listingName && (
            <span className="text-sm text-text-3 truncate hidden sm:inline">{draft.listingName}</span>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden md:flex">
            <TestSendControl campaign={formData} disabled={!draft.listingId} />
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              {/* Send now — skips the AI. Secondary so Schedule/Update stays the one primary action. */}
              <Button
                variant="secondary"
                onClick={() => setSendNowOpen(true)}
                disabled={!isValid || submitting || sendingNow}
                title="Send to the audience right now instead of letting the AI pick a time"
              >
                Send now
              </Button>
              <Button onClick={handleSubmit} disabled={!isValid || submitting || sendingNow}>
                {isEdit ? "Update" : "Schedule"}
              </Button>
            </div>
            {hint && <span className="text-xs text-text-3 mt-1">{hint}</span>}
          </div>
        </div>
      </div>

      {/* ── Mobile tabs (Edit | Preview) ── */}
      <div className="flex lg:hidden px-4 py-2 border-b border-border shrink-0">
        <Tabs
          items={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
          value={mobileTab}
          onChange={setMobileTab}
          className="w-full [&>button]:flex-1"
        />
      </div>

      {/* Restored-draft notice — green tint = a good thing happened */}
      {restored && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-2 bg-accent-soft border-b border-border text-xs text-text">
          <span>
            Restored your unsaved work
            {restoredAt && <span className="text-text-3"> from {new Date(restoredAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
          </span>
          <Button variant="ghost" size="sm" onClick={discardRestored}>
            Start fresh
          </Button>
        </div>
      )}

      {/* ── Split panes ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: live email */}
        <div
          data-scroll-pane
          className={`w-full lg:w-[60%] overflow-y-auto bg-canvas p-6 lg:p-10 relative ${
            mobileTab === "preview" ? "block" : "hidden lg:block"
          }`}
        >
          <div className={`mx-auto w-full max-w-[600px] transition-opacity duration-300 ${revealed ? "opacity-100" : "opacity-40"}`}>
            <LivePreviewFrame
              html={previewHtml}
              activeField={activeField}
              onFieldClick={handleFieldClick}
              className="rounded-card"
            />
          </div>
          {!revealed && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
              <span className="px-4 py-2 rounded-pill bg-surface/90 border border-border text-sm text-text-3">
                Choose a listing to begin
              </span>
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div
          className={`w-full lg:w-[40%] shrink-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-border px-6 lg:px-8 py-6 space-y-8 ${
            mobileTab === "edit" ? "block" : "hidden lg:block"
          }`}
        >
          {/* Test send lives here on small screens */}
          <div className="md:hidden">
            <TestSendControl campaign={formData} disabled={!draft.listingId} />
          </div>

          {/* 1 — what kind of email. Everything else appears once this is chosen. */}
          <Section step={1} title="Type" description={isEdit ? "can't change after creating" : undefined}>
            {isEdit ? (
              <p className="text-sm text-text">{isGroup ? "Multiple" : "Single"}</p>
            ) : (
              <TypeChoice value={draft.kind} onChange={(v) => set("kind", v)} />
            )}
          </Section>

          {revealed && (
            <div className="space-y-8 animate-slide-up">
              {/* 2 — the listing(s). Search box first; results drop down as you type. */}
              <Section step={2} title={isGroup ? "Listings" : "Listing"}>
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
              </Section>

              {/* Same order as the email, top to bottom */}
              <Section step={3} title="Heading" description={isGroup ? "all optional" : undefined}>
                <div className="space-y-4">
                  {/* Placeholders are exactly what the email shows when the field is left blank.
                      Small green top line = listing name (override below); big white line = the heading typed here. */}
                  {/* Same order as the email: small green top line first, big white heading second */}
                  <Field label={isGroup ? "Type or location" : "Top line"}>
                    <Input
                      {...fieldProps("heading")}
                      value={draft.headingText}
                      onChange={(e) => set("headingText", e.target.value)}
                      placeholder={isGroup ? "TYPE OR LOCATION — e.g. LAND · WEST VALLEY" : (draft.listingName || "Property Name").toUpperCase()}
                    />
                  </Field>
                  <Field label="Heading">
                    <Input
                      {...fieldProps("label")}
                      value={draft.emailLabel}
                      onChange={(e) => set("emailLabel", e.target.value)}
                      placeholder={isGroup ? "Heading — e.g. West Valley Land & Retail" : "Just Listed"}
                    />
                  </Field>
                </div>
              </Section>

              <Section step={4} title="Partner logo" description="optional">
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
              <Section step={5} title="Photo">
                <PhotoPicker
                  gallery={selectedListing?.fieldData.gallery || []}
                  photoUrl={draft.photoUrl}
                  onChange={(url) => set("photoUrl", url)}
                  fieldProps={fieldProps}
                />
              </Section>
              )}

              <Section step={6} title={isGroup ? "Intro" : "Body"}>
                <Field>
                  <Textarea
                    {...fieldProps("body")}
                    value={draft.bodyText}
                    onChange={(e) => set("bodyText", e.target.value)}
                    placeholder={isGroup ? "Optional — a short intro above the listings" : "Optional — a short paragraph under the photo"}
                    rows={4}
                  />
                </Field>
              </Section>

              {!isGroup && (
              <Section step={7} title="Details">
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
              <Section step={8} title="Listing link">
                <Field>
                  <Input
                    {...fieldProps("cta")}
                    value={draft.listingPageUrl}
                    onChange={(e) => set("listingPageUrl", e.target.value)}
                    placeholder="https://cre8advisors.com/listings/…"
                  />
                </Field>
              </Section>

              )}

              <Section step={9} title="Broker">
                <BrokerPicker
                  brokerIds={draft.brokerIds}
                  onChange={(ids) => set("brokerIds", ids)}
                  fieldProps={fieldProps}
                />
              </Section>

              <Section step={10} title="Audience">
                {/* Segmented choice — the recipient count rides along as the tab count */}
                <Tabs
                  value={draft.segmentId}
                  onChange={(v) => set("segmentId", v)}
                  items={EMAIL_SEGMENTS.filter((s) => s.enabled).map((s) => ({
                    value: s.id,
                    label: s.name,
                    // count appears once /api/email/audience has answered
                    count: audience[s.id] ? audience[s.id].subscribed : undefined,
                  }))}
                />
                {/* "860 recipients · 2 unsubscribed won't receive it" */}
                <p className="mt-2 text-xs text-text-3 min-h-[1rem]">
                  {audience[draft.segmentId] ? recipientLine(audience[draft.segmentId]) : "Counting recipients…"}
                </p>
              </Section>

              <Section step={11} title="Frequency">
                <div className="space-y-4">
                  <Tabs
                    value={draft.campaignType}
                    items={[
                      { value: "one-time", label: "One-time" },
                      { value: "recurring", label: "Recurring" },
                    ]}
                    onChange={(v) => set("campaignType", v as "one-time" | "recurring")}
                  />
                  {draft.campaignType === "recurring" && (
                    <div className="space-y-4 animate-slide-up">
                      <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                        <input type="checkbox" checked={draft.pinned} onChange={(e) => set("pinned", e.target.checked)} className="accent-accent" />
                        Keep this cadence (don&apos;t slow it down as the listing ages)
                      </label>
                      <Tabs
                        value={draft.frequency}
                        items={[
                          { value: "weekly", label: "Weekly" },
                          { value: "bi-weekly", label: "Bi-weekly" },
                          { value: "monthly", label: "Monthly" },
                        ]}
                        onChange={(v) => set("frequency", v as CampaignFrequency)}
                      />
                      <Field
                        label="Ends"
                        action={
                          draft.endDate ? (
                            <Button variant="ghost" size="sm" onClick={() => set("endDate", "")}>
                              Clear
                            </Button>
                          ) : undefined
                        }
                      >
                        <div className="w-44">
                          <Input
                            type="date"
                            value={draft.endDate}
                            onChange={(e) => set("endDate", e.target.value)}
                          />
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              </Section>

              <Section step={12} title="Priority">
                <div className="space-y-2">
                  <Tabs
                    value={draft.priority}
                    items={[
                      { value: "high", label: "Top of list" },
                      { value: "normal", label: "Normal" },
                    ]}
                    onChange={(v) => set("priority", v as CampaignPriority)}
                  />
                  <p className="text-xs text-text-3">
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

      {/* ── Send now confirm — shared Modal ── */}
      <Modal
        open={sendNowOpen}
        onClose={() => !sendingNow && setSendNowOpen(false)}
        size="sm"
        title="Send now?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendNowOpen(false)} disabled={sendingNow}>
              Cancel
            </Button>
            <Button onClick={runSendNow} loading={sendingNow}>
              {sendingNow ? "Sending…" : "Yes, send now"}
            </Button>
          </>
        }
      >
        <p className="text-text">
          <span className="font-medium">{isGroup ? formData.listing_name : `${formData.email_label}: ${formData.listing_name}`}</span> goes to{" "}
          <span className="font-medium">
            {formData.segment_name}
            {audience[draft.segmentId] ? ` (${formatCount(audience[draft.segmentId].subscribed)} people)` : ""}
          </span>{" "}
          within a couple of minutes, from {formData.broker_name}.
        </p>
        {formData.campaign_type === "recurring" && (
          <p className="text-xs text-text-3 mt-2">It&apos;s recurring, so the {formData.frequency} cadence starts from today.</p>
        )}
        {sendNowError && <p className="text-xs text-danger-fg mt-2">{sendNowError}</p>}
      </Modal>

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
    </div>
  );
}

/** First choice on a new campaign: one listing, or a group of several — two descriptive cards */
function TypeChoice({ value, onChange }: { value: "single" | "group" | ""; onChange: (v: "single" | "group") => void }) {
  const opts: { id: "single" | "group"; label: string; desc: string }[] = [
    { id: "single", label: "Single", desc: "One property — hero photo and details" },
    { id: "group", label: "Multiple", desc: "Several properties as cards under one heading" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {opts.map((o) => {
        const on = value === o.id;
        return (
          // Interactive Card — green border + tint = selected (status)
          <Card
            key={o.id}
            interactive
            padding="sm"
            role="button"
            tabIndex={0}
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(o.id);
              }
            }}
            className={on ? "border-accent-strong bg-accent-soft/40 hover:border-accent-strong" : ""}
          >
            <div className={`text-sm font-medium ${on ? "text-text" : "text-text-2"}`}>{o.label}</div>
            <div className="text-xs text-text-3 mt-0.5">{o.desc}</div>
          </Card>
        );
      })}
    </div>
  );
}
