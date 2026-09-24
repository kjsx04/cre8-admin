"use client";

/**
 * EmailComposer — full-page campaign builder.
 *
 * Left: the real email, rendered live from the template on every keystroke.
 * Right: short sections in the same top-to-bottom order as the email
 * (Listing → Heading → Photo/Intro → Body → Details → Listing Link → Broker),
 * then Audience → Frequency → Priority for the send itself.
 * Click a region in the email and its input focuses; focus an input and the
 * region lights up.
 *
 * Toolbar: test (CRE8-broker checkbox modal) + Save campaign (draft, not live).
 * Bottom of the settings column: Send now or Schedule — that's when it goes
 * on the calendar. Save ≠ Schedule.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { Campaign } from "@/lib/email/types";
import { ListingItem } from "@/lib/admin-constants";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";
import { listingStaysLive, overlayGroupCard, overlayListingOnCampaign } from "@/lib/email/listing-hydrate";
import { useAudience, formatCount, audienceLabel, combineAudience } from "@/lib/email/audience-client";
import InboxLines from "./InboxLines";
import ScheduledActions from "./ScheduledActions";
import { Button } from "@/components/ui";
import { EMAIL_SENDERS } from "@/lib/email/constants";
import { wrapPreviewHtml, PreviewField } from "@/lib/email/preview-wrapper";
import { buildCmsChips } from "@/lib/email/utils";
import { saveCampaignDraft } from "@/lib/email/submit";
import LivePreviewFrame from "./LivePreviewFrame";
import TestSendControl from "./TestSendControl";
import ListingPicker from "./ListingPicker";
import GroupListingsPicker from "./GroupListingsPicker";
import PhotoPicker from "./PhotoPicker";
import PartnerLogoPicker from "./PartnerLogoPicker";
import BrokerPicker from "./BrokerPicker";
import AudiencePicker from "./AudiencePicker";
import BodyAiControl from "./BodyAiControl";
import DetailsEditor from "./DetailsEditor";
import { useCampaignDraft, MissingField } from "./useCampaignDraft";
import { FieldBinding, FieldProps } from "./fieldProps";
import { COMPOSER_FIELD, ChoiceButton } from "./composer-ui";

interface EmailComposerProps {
  mode: "create" | "edit";
  campaign?: Campaign | null;
  listings: ListingItem[];
  listingsLoading: boolean;
}

const INPUT = COMPOSER_FIELD;

const MISSING_COPY: Record<MissingField, string> = {
  type: "the email type",
  listing: "a listing",
  group: "at least 2 listings",
  broker: "a broker",
  partnerLogo: "the partner logo (click Apply)",
  audience: "an audience",
  endDate: "a valid end date",
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

  const {
    draft, set, pickListing,
    addHighlight, updateHighlight, moveHighlight, removeHighlight,
    formData, missing, isValid, canSave, dirty,
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
    let input: Record<string, unknown> = { ...formData };
    // Drafts overlay current CMS listing fields. Scheduled campaigns stay frozen.
    if (listingStaysLive(campaign?.status)) {
      if (selectedListing) input = overlayListingOnCampaign(input, selectedListing);
      if (draft.kind === "group" && Array.isArray(formData.group_listings)) {
        input.group_listings = formData.group_listings.map((card) => {
          const item = listings.find((l) => l.id === card.listing_id);
          return item ? overlayGroupCard(card as unknown as Record<string, unknown>, item) : card;
        });
      }
    }
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
  }, [formData, campaign?.status, selectedListing, listings, draft.kind, draft.listingId, draft.headingText, draft.emailLabel, draft.partnerLogoUrl, draft.partnerLogoWidth, draft.partnerLogoHeight]);

  // ── Focus bridge: preview region ⇄ input ──
  const [activeField, setActiveField] = useState<PreviewField | null>(null);
  // Live Resend lists + counts — shown on the audience buttons + confirm dialogs
  const audience = useAudience();
  const selectedAudience = combineAudience(audience.map, draft.segmentIds, draft.extraEmails.length, audience.overlaps);
  const selectedAudienceName = audienceLabel(
    audience.map,
    formData.segment_id,
    formData.segment_name || "the selected audience"
  );

  // Old campaigns stored "test" (renamed to Brokers). Once live lists load, pick Brokers.
  useEffect(() => {
    if (!audience.loaded || draft.segmentIds.length > 0 || draft.extraEmails.length > 0) return;
    const raw = campaign?.segment_id || "";
    if (!/(^|[,;\s])test([,;\s]|$)/i.test(raw)) return;
    const brokers = audience.list.find((s) => /^(brokers|test)$/i.test(s.name));
    if (brokers) set("segmentIds", [brokers.id]);
  }, [audience.loaded, audience.list, campaign?.segment_id, draft.segmentIds.length, draft.extraEmails.length, set]);
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
  const [introUndo, setIntroUndo] = useState<string | null>(null);
  const [bodyUndo, setBodyUndo] = useState<string | null>(null);

  const handleFieldClick = useCallback((field: PreviewField) => {
    setMobileTab("edit");
    const el = fieldEls.current.get(field);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setActiveField(field);
  }, []);

  // Set once we've saved, so the "unsaved work" guard stops firing
  const submittedRef = useRef(false);

  const withAudienceNames = useCallback(
    (data: typeof formData) => ({
      ...data,
      segment_name: audienceLabel(audience.map, data.segment_id, data.segment_name || selectedAudienceName),
    }),
    [audience.map, selectedAudienceName]
  );

  // ── Save campaign: persist a draft. Not live / not on the calendar. ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveCampaignDraft(withAudienceNames(formData), userEmail, campaign?.id);
      submittedRef.current = true;
      forgetStored();
      router.push("/marketing/email");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save");
      setSaving(false);
    }
  };

  /**
   * Schedule — saves the draft, then hands off to the calendar.
   * No AI runs here any more: frequency, priority and the slot are chosen on the
   * schedule page, where you can watch the placement happen.
   */
  const handleScheduleHandoff = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveCampaignDraft(withAudienceNames(formData), userEmail, campaign?.id);
      submittedRef.current = true;
      forgetStored();
      router.push(`/marketing/email?place=${saved.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save");
      setSaving(false);
    }
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
        body: JSON.stringify({ ...withAudienceNames(formData), auto_schedule: false }),
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

  const submitting = false; // scheduling no longer happens here — it lives on the calendar
  const isGroup = draft.kind === "group";
  // Everything after "Type" shows as soon as the type is chosen (edit mode: always)
  const revealed = isEdit || draft.kind !== "";
  const hint = missingHint(missing);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-2.5 border-b border-black/[0.04]">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-card text-medium-gray hover:text-charcoal hover:bg-subtle-gray disabled:opacity-40"
            title="Back to campaigns"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-[17px] font-medium text-charcoal whitespace-nowrap">
            {isEdit ? "Edit campaign" : "New campaign"}
          </h1>
          {isEdit && draft.listingName && (
            <span className="text-sm text-muted-gray truncate hidden sm:inline">{draft.listingName}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <TestSendControl
            campaign={formData}
            disabled={isGroup ? draft.groupListings.length < 2 : !draft.listingId}
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave || submitting || sendingNow}
            loading={saving}
            title={canSave ? "Save a draft — not live until Schedule or Send now" : "Add a listing and a broker to save"}
          >
            Save campaign
          </Button>
          {saveError && (
            <span className="text-xs text-danger-fg max-w-[160px] truncate" title={saveError}>
              {saveError}
            </span>
          )}
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
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2 bg-green/[0.08] text-xs text-charcoal">
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
          className={`w-full lg:w-[60%] overflow-y-auto bg-[#E5E5E5] p-6 lg:p-10 relative ${
            mobileTab === "preview" ? "block" : "hidden lg:block"
          }`}
        >
          <div className={`mx-auto w-full max-w-[600px] transition-opacity duration-300 ${revealed ? "opacity-100" : "opacity-40"}`}>
            <LivePreviewFrame
              html={previewHtml}
              activeField={activeField}
              onFieldClick={handleFieldClick}
            />
          </div>
          {!revealed && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
              <span className="px-4 py-2 rounded-card bg-white/90 border border-border-light text-sm text-muted-gray shadow-sm">
                Choose a listing to begin
              </span>
            </div>
          )}
        </div>

        {/* Right: light tool surface */}
        <div
          className={`w-full lg:w-[40%] shrink-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-black/[0.04] bg-subtle-gray px-7 lg:px-9 py-10 space-y-9 ${
            mobileTab === "edit" ? "block" : "hidden lg:block"
          }`}
        >
          {/* Already on the calendar? Reschedule, sync the template or refresh the
              listing right here, where the preview shows what changed. */}
          {isEdit && campaign && (
            <ScheduledActions campaign={campaign} onChanged={() => router.refresh()} />
          )}

          {/* 1 — what kind of email. Everything else appears once this is chosen. */}
          <Section title="Type" note={isEdit ? "can't change after creating" : undefined}>
            {isEdit ? (
              <p className="text-sm text-charcoal">{isGroup ? "Multiple" : "Single"}</p>
            ) : (
              <TypeChoice value={draft.kind} onChange={(v) => set("kind", v)} />
            )}
          </Section>

          {revealed && (
            <div className="space-y-8 composer-reveal">
              <Section title={isGroup ? "Listings" : "Listing"}>
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

              {/* What the inbox shows before anyone opens it */}
              <Section title="Subject & preview">
                <InboxLines
                  subject={draft.emailSubject}
                  previewText={draft.previewText}
                  senderName={EMAIL_SENDERS.find((b) => b.id === draft.brokerIds[0])?.name || "CRE8 Advisors"}
                  campaign={{
                    campaign_kind: draft.kind,
                    email_label: draft.emailLabel,
                    listing_name: isGroup
                      ? draft.emailLabel || draft.headingText
                      : draft.listingName,
                    heading_text: draft.headingText,
                    body_text: draft.bodyText,
                    intro_text: draft.introText,
                  }}
                  onSubjectChange={(v) => set("emailSubject", v)}
                  onPreviewChange={(v) => set("previewText", v)}
                />
              </Section>

              {/* Same order as the email, top to bottom */}
              <Section title="Heading" note={isGroup ? "all optional" : undefined}>
                <div className="space-y-2.5">
                  {/* Placeholders are exactly what the email shows when the field is left blank.
                      Small green top line = listing name (override below); big white line = the heading typed here. */}
                  {/* Same order as the email: small green top line first, big white heading second */}
                  <input
                    {...fieldProps("heading")}
                    value={draft.headingText}
                    onChange={(e) => set("headingText", e.target.value)}
                    placeholder={isGroup ? "TYPE OR LOCATION — e.g. LAND · WEST VALLEY" : (draft.listingName || "Property Name").toUpperCase()}
                    className={`${INPUT} text-xs uppercase tracking-wide`}
                  />
                  <input
                    {...fieldProps("label")}
                    value={draft.emailLabel}
                    onChange={(e) => set("emailLabel", e.target.value)}
                    placeholder={isGroup ? "Heading — e.g. West Valley Land & Retail" : "Just Listed"}
                    className={INPUT}
                  />
                </div>
              </Section>

              <Section title="Partner logo" note="optional">
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
              <Section title="Photo">
                <PhotoPicker
                  gallery={selectedListing?.fieldData.gallery || []}
                  photoUrl={draft.photoUrl}
                  onChange={(url) => set("photoUrl", url)}
                  fieldProps={fieldProps}
                />
              </Section>
              )}

              {isGroup && (
              <Section title="Intro">
                <div className="space-y-2.5">
                  <BodyAiControl
                    listingIds={draft.groupListings.map((c) => c.listing_id)}
                    kind="group"
                    userEmail={userEmail}
                    onInsert={(text) => {
                      setIntroUndo(draft.introText);
                      set("introText", text);
                    }}
                    onUndo={() => {
                      if (introUndo == null) return;
                      set("introText", introUndo);
                      setIntroUndo(null);
                    }}
                    canUndo={introUndo != null}
                  />
                  <textarea
                    {...fieldProps("intro")}
                    value={draft.introText}
                    onChange={(e) => {
                      setIntroUndo(null);
                      set("introText", e.target.value);
                    }}
                    placeholder="Optional — a short intro above the listings"
                    rows={3}
                    className={`${INPUT} resize-y`}
                  />
                </div>
              </Section>
              )}

              <Section title="Body">
                <div className="space-y-2.5">
                  {!isGroup && (
                  <BodyAiControl
                    listingIds={draft.listingId ? [draft.listingId] : []}
                    kind="single"
                    userEmail={userEmail}
                    onInsert={(text) => {
                      setBodyUndo(draft.bodyText);
                      set("bodyText", text);
                    }}
                    onUndo={() => {
                      if (bodyUndo == null) return;
                      set("bodyText", bodyUndo);
                      setBodyUndo(null);
                    }}
                    canUndo={bodyUndo != null}
                  />
                  )}
                  <textarea
                    {...fieldProps("body")}
                    value={draft.bodyText}
                    onChange={(e) => {
                      setBodyUndo(null);
                      set("bodyText", e.target.value);
                    }}
                    placeholder={isGroup ? "Optional — a short paragraph under the listings" : "Optional — a short paragraph under the photo"}
                    rows={4}
                    className={`${INPUT} resize-y`}
                  />
                </div>
              </Section>

              {!isGroup && (
              <Section title="Details">
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
              <Section title="Listing link">
                <input
                  {...fieldProps("cta")}
                  value={draft.listingPageUrl}
                  onChange={(e) => set("listingPageUrl", e.target.value)}
                  placeholder="https://cre8advisors.com/listings/…"
                  className={`${INPUT} text-xs`}
                />
              </Section>

              )}

              <Section title="Broker">
                <BrokerPicker
                  brokerIds={draft.brokerIds}
                  onChange={(ids) => set("brokerIds", ids)}
                  fieldProps={fieldProps}
                />
              </Section>
            </div>
          )}

          {revealed && (
            <div className="pt-8 border-t border-black/[0.05] space-y-8 composer-reveal">
              <Section title="Audience">
                <AudiencePicker
                  list={audience.list}
                  map={audience.map}
                  overlaps={audience.overlaps}
                  loaded={audience.loaded}
                  error={audience.error}
                  segmentIds={draft.segmentIds}
                  extraEmails={draft.extraEmails}
                  extraContactNames={draft.extraContactNames}
                  onSegmentsChange={(ids) => set("segmentIds", ids)}
                  onEmailsChange={(emails, names) => {
                    set("extraEmails", emails);
                    if (names) set("extraContactNames", names);
                  }}
                />
              </Section>

            </div>
          )}

          {/* Save parks it below the calendar. Schedule hands off to the calendar,
              where frequency and priority are chosen. Send now skips both. */}
          <div className="pt-8 border-t border-black/[0.05] space-y-2">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSendNowOpen(true)}
                disabled={!isValid || submitting || sendingNow || saving}
                title="Send to the audience right now instead of putting it on the schedule"
              >
                Send now
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSave}
                disabled={!canSave || submitting || sendingNow}
                loading={saving}
                title="Save without scheduling — it waits below the calendar"
              >
                Save
              </Button>
              <Button
                size="sm"
                onClick={handleScheduleHandoff}
                disabled={!isValid || submitting || sendingNow}
                loading={saving}
                title="Put it on the calendar — you pick frequency and priority there"
              >
                Schedule
              </Button>
            </div>
            {hint && <p className="text-xs text-text-3 text-right">{hint}</p>}
          </div>
        </div>
      </div>

      {/* ── Send now confirm ── */}
      {sendNowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !sendingNow && setSendNowOpen(false)} />
          <div className="relative bg-white rounded-card shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-medium text-charcoal">Send now?</h3>
            <p className="text-sm text-charcoal mt-2">
              <span className="font-medium">{isGroup ? formData.listing_name : `${formData.email_label}: ${formData.listing_name}`}</span> goes to{" "}
              <span className="font-medium">
                {selectedAudienceName}
                {selectedAudience ? ` (${formatCount(selectedAudience.subscribed)} people)` : ""}
              </span>{" "}
              within a couple of minutes, from {formData.broker_name}.
            </p>
            {formData.campaign_type === "recurring" && (
              <p className="text-xs text-muted-gray mt-2">It&apos;s recurring, so the {formData.frequency} cadence starts from today.</p>
            )}
            {sendNowError && <p className="text-xs text-red-500 mt-2">{sendNowError}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setSendNowOpen(false)} disabled={sendingNow} className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal disabled:opacity-40">
                Cancel
              </button>
              <button type="button" onClick={runSendNow} disabled={sendingNow} className="px-4 py-1.5 bg-charcoal text-white text-sm font-medium rounded-btn hover:bg-black disabled:opacity-50">
                {sendingNow ? "Sending…" : "Yes, send now"}
              </button>
            </div>
          </div>
        </div>
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

/** Calm label — no numbered chrome */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5">
        <h2 className="text-[12px] font-medium text-medium-gray">{title}</h2>
        {note && <span className="text-[11px] text-muted-gray">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** First choice on a new campaign: one listing, or a group of several */
function TypeChoice({ value, onChange }: { value: "single" | "group" | ""; onChange: (v: "single" | "group") => void }) {
  const opts: { id: "single" | "group"; label: string }[] = [
    { id: "single", label: "Single" },
    { id: "group", label: "Multiple" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const on = value === o.id;
        return (
          <ChoiceButton key={o.id} selected={on} onClick={() => onChange(o.id)}>
            {o.label}
          </ChoiceButton>
        );
      })}
    </div>
  );
}

