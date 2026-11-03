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
import { Campaign, CampaignKind } from "@/lib/email/types";
import { ListingItem } from "@/lib/admin-constants";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";
import { listingStaysLive, overlayGroupCard, overlayListingOnCampaign } from "@/lib/email/listing-hydrate";
import { useAudience, formatCount, audienceLabel, combineAudience } from "@/lib/email/audience-client";
import InboxFields, { InboxPreview, type Surface, type InboxCampaign } from "./InboxLines";
import ScheduledActions from "./ScheduledActions";
import { Button } from "@/components/ui";
import { Smartphone, Monitor } from "lucide-react";
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
import RichTextEditor, { type RichTextEditorHandle } from "@/components/RichTextEditor";
import { MERGE_TAGS } from "@/lib/email/merge-tags";
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
  subject: "a subject line",
  body: "something in the body",
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
    // Before a listing is picked, show the template defaults so the shape reads.
    // Group and custom emails show exactly what's typed (blank stays blank).
    if (draft.kind !== "group" && draft.kind !== "custom" && !draft.listingId) {
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
  // Which device the left pane imitates. Drives the inbox mock AND the width the
  // email renders at, so Phone shows the notification and the phone layout together.
  const [surface, setSurface] = useState<Surface>("desktop");

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
   * Schedule a custom email at the exact date and time typed in the composer.
   * Custom emails have no listing, so the calendar's priority and spacing rules
   * don't apply — this saves the draft, then books the slot straight away.
   */
  const handleScheduleAt = async () => {
    if (!isValid || saving) return;
    if (!draft.sendDate || !draft.sendTime) {
      setSaveError("Pick a date and a time.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveCampaignDraft(withAudienceNames(formData), userEmail, campaign?.id);
      const res = await fetch(`/api/email/campaigns/${saved.id}/schedule-at`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ send_date: draft.sendDate, send_time: draft.sendTime }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Couldn't schedule the email");
      submittedRef.current = true;
      forgetStored();
      router.push("/marketing/email");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't schedule the email");
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
  // Custom = a free-form email with no listing behind it. Subject + body + audience,
  // then send now or pick an exact date and time right here.
  const isCustom = draft.kind === "custom";
  const needsSendTime = isCustom && (!draft.sendDate || !draft.sendTime);
  // Everything after "Type" shows as soon as the type is chosen (edit mode: always)
  const revealed = isEdit || draft.kind !== "";

  // The two kinds of Body input, so the + menu can insert into whichever is showing
  const bodyEditorRef = useRef<RichTextEditorHandle>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Drop a merge tag in where the caret is.
   * The rich editor keeps its own caret; for the plain textarea we splice the
   * string ourselves and put the caret back after the inserted text.
   */
  const insertIntoBody = useCallback(
    (token: string) => {
      if (draft.kind === "custom") {
        bodyEditorRef.current?.insertText(token);
        return;
      }
      const el = bodyTextareaRef.current;
      const current = draft.bodyText;
      if (!el) {
        set("bodyText", current + token);
        return;
      }
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? start;
      set("bodyText", current.slice(0, start) + token + current.slice(end));
      // After React re-renders, put the caret just past what we inserted
      requestAnimationFrame(() => {
        el.focus();
        const at = start + token.length;
        el.setSelectionRange(at, at);
      });
    },
    [draft.kind, draft.bodyText, set]
  );

  const senderName = EMAIL_SENDERS.find((b) => b.id === draft.brokerIds[0])?.name || "CRE8 Advisors";

  // One object shared by the inbox mock on the left and the inputs on the right.
  // A literal rebuilt in each place would change identity every render and
  // defeat the memos that derive the subject and preview from it.
  const inboxCampaign: InboxCampaign = useMemo(
    () => ({
      campaign_kind: draft.kind,
      email_label: draft.emailLabel,
      listing_name: isGroup ? draft.emailLabel || draft.headingText : draft.listingName,
      heading_text: draft.headingText,
      body_text: draft.bodyText,
      intro_text: draft.introText,
    }),
    [draft.kind, draft.emailLabel, draft.listingName, draft.headingText, draft.bodyText, draft.introText, isGroup]
  );
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
            disabled={isGroup ? draft.groupListings.length < 2 : isCustom ? !canSave : !draft.listingId}
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
          <div
            className={`mx-auto w-full transition-[max-width] duration-300 ${
              surface === "phone" ? "max-w-[390px]" : "max-w-[600px]"
            } ${revealed ? "opacity-100" : "opacity-40"}`}
          >
            {/* Phone / Desktop switches BOTH the notification and the width the
                email renders at — the template stacks its cards under ~600px,
                so this is the real phone layout, not a scaled picture of it. */}
            <div className="flex items-center justify-end mb-3">
              <div className="flex items-center h-control-sm rounded-control bg-white/70 p-0.5 border border-[#C9C9C9]" role="group" aria-label="Preview device">
                {([
                  ["phone", Smartphone, "Phone"],
                  ["desktop", Monitor, "Desktop"],
                ] as const).map(([id, Icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSurface(id)}
                    aria-pressed={surface === id}
                    className={`flex items-center gap-1.5 px-2.5 h-full rounded-[4px] text-xs font-medium transition-colors ${
                      surface === id ? "bg-surface text-text shadow-sm" : "text-text-2 hover:text-text"
                    }`}
                  >
                    <Icon size={14} strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* What lands before it is opened, directly above what opens */}
            <div className="mb-3">
              <InboxPreview
                subject={draft.emailSubject}
                previewText={draft.previewText}
                campaign={inboxCampaign}
                senderName={senderName}
                surface={surface}
              />
            </div>

            <div className="transition-opacity duration-300">
              <LivePreviewFrame
                html={previewHtml}
                activeField={activeField}
                onFieldClick={handleFieldClick}
              />
            </div>
          </div>
          {!revealed && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
              <span className="px-4 py-2 rounded-card bg-white/90 border border-border-light text-sm text-muted-gray shadow-sm">
                Choose an email type to begin
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
              <p className="text-sm text-charcoal">{isGroup ? "Multiple" : isCustom ? "Custom" : "Single"}</p>
            ) : (
              <TypeChoice value={draft.kind} onChange={(v) => set("kind", v)} />
            )}
          </Section>

          {revealed && (
            <div className="space-y-8 composer-reveal">
              {/* Custom emails have no listing at all — straight to the writing. */}
              {!isCustom && (
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
              )}

              {/* What the inbox shows before anyone opens it */}
              <Section title="Subject & preview">
                <InboxFields
                  subject={draft.emailSubject}
                  previewText={draft.previewText}
                  campaign={inboxCampaign}
                  onSubjectChange={(v) => set("emailSubject", v)}
                  onPreviewChange={(v) => set("previewText", v)}
                />
              </Section>

              {/* Same order as the email, top to bottom */}
              <Section title="Heading" note={isGroup || isCustom ? "all optional" : undefined}>
                <div className="space-y-2.5">
                  {/* Placeholders are exactly what the email shows when the field is left blank.
                      Small green top line = listing name (override below); big white line = the heading typed here. */}
                  {/* Same order as the email: small green top line first, big white heading second */}
                  <input
                    {...fieldProps("heading")}
                    value={draft.headingText}
                    onChange={(e) => set("headingText", e.target.value)}
                    placeholder={isGroup ? "TYPE OR LOCATION — e.g. LAND · WEST VALLEY" : isCustom ? "SMALL TOP LINE — e.g. MARKET UPDATE" : (draft.listingName || "Property Name").toUpperCase()}
                    className={`${INPUT} text-xs uppercase tracking-wide`}
                  />
                  <input
                    {...fieldProps("label")}
                    value={draft.emailLabel}
                    onChange={(e) => set("emailLabel", e.target.value)}
                    placeholder={isGroup ? "Heading — e.g. West Valley Land & Retail" : isCustom ? "Heading — the big line at the top" : "Just Listed"}
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

              {!isGroup && !isCustom && (
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

              <Section
                title="Body"
                note={isCustom ? "the whole email" : undefined}
                action={<MergeTagMenu onInsert={insertIntoBody} />}
              >
                <div className="space-y-2.5">
                  {!isGroup && !isCustom && (
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
                  {/* Custom emails get the full editor — paragraphs, bold, lists, links.
                      Listing emails stay plain text: their template escapes the body. */}
                  {isCustom ? (
                    <div
                      {...fieldProps("body")}
                      /* Point the preview's click-to-focus at the editable area itself,
                         not this wrapper — a plain div can't take a caret. */
                      ref={(el) => fieldProps("body").ref((el?.querySelector("[contenteditable]") as HTMLElement | null) ?? null)}
                    >
                      <RichTextEditor
                        ref={bodyEditorRef}
                        value={draft.bodyText}
                        onChange={(html) => {
                          setBodyUndo(null);
                          set("bodyText", html);
                        }}
                        placeholder="Write your email…"
                      />
                    </div>
                  ) : (
                  <textarea
                    {...fieldProps("body")}
                    ref={(el) => {
                      bodyTextareaRef.current = el;
                      fieldProps("body").ref(el);
                    }}
                    value={draft.bodyText}
                    onChange={(e) => {
                      setBodyUndo(null);
                      set("bodyText", e.target.value);
                    }}
                    placeholder={isGroup ? "Optional — a short paragraph under the listings" : "Optional — a short paragraph under the photo"}
                    rows={4}
                    className={`${INPUT} resize-y`}
                  />
                  )}
                </div>
              </Section>

              {!isGroup && !isCustom && (
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

              {!isGroup && !isCustom && (
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

          {/* Custom emails pick their own date and time — there's no listing, so the
              calendar's priority and spacing rules have nothing to work with. */}
          {revealed && isCustom && (
            <div className="pt-8 border-t border-black/[0.05]">
              <Section title="Send" note="Phoenix time">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={draft.sendDate}
                    min={todayInPhoenix()}
                    onChange={(e) => set("sendDate", e.target.value)}
                    className={`${INPUT} flex-1`}
                  />
                  <input
                    type="time"
                    value={draft.sendTime}
                    onChange={(e) => set("sendTime", e.target.value)}
                    className={`${INPUT} w-32`}
                  />
                </div>
                <p className="text-[11px] text-muted-gray mt-1.5">
                  Leave these blank and use Send now to go out straight away.
                </p>
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
                onClick={isCustom ? handleScheduleAt : handleScheduleHandoff}
                disabled={!isValid || submitting || sendingNow || needsSendTime}
                loading={saving}
                title={
                  isCustom
                    ? "Book it for the date and time above"
                    : "Put it on the calendar — you pick frequency and priority there"
                }
              >
                Schedule
              </Button>
            </div>
            {hint && <p className="text-xs text-text-3 text-right">{hint}</p>}
            {!hint && needsSendTime && (
              <p className="text-xs text-text-3 text-right">Pick a date and a time to schedule, or use Send now.</p>
            )}
            {/* The header shows this too, but truncated — a scheduling problem needs the whole sentence */}
            {isCustom && saveError && <p className="text-xs text-red-500 text-right">{saveError}</p>}
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
              <span className="font-medium">{isGroup || isCustom ? formData.listing_name : `${formData.email_label}: ${formData.listing_name}`}</span> goes to{" "}
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

/** Today in Phoenix as "YYYY-MM-DD", so the date box can't offer a day that's gone */
function todayInPhoenix(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Calm label — no numbered chrome. `action` sits right-aligned on the label row. */
function Section({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5">
        <h2 className="text-[12px] font-medium text-medium-gray">{title}</h2>
        {note && <span className="text-[11px] text-muted-gray">{note}</span>}
        {action && <div className="ml-auto self-center">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * The + next to Body: drops a merge tag in at the caret.
 *
 * Resend fills these in per recipient when the broadcast goes out, so the
 * preview shows each tag's fallback rather than a made-up name. A test send to
 * yourself is what shows the real thing.
 */
function MergeTagMenu({ onInsert }: { onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false);

  // Click anywhere else to close
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        /* preventDefault keeps the caret in the body where it was */
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={`w-6 h-6 rounded-btn border flex items-center justify-center text-[15px] leading-none transition-colors ${
          open
            ? "border-green bg-[#F0F9E5] text-charcoal"
            : "border-border-light text-medium-gray hover:bg-subtle-gray hover:text-charcoal"
        }`}
        title="Insert a contact's name or email"
        aria-label="Insert a contact detail"
      >
        +
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-20 w-60 rounded-card border border-border-light bg-white shadow-lg py-1">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-gray">Insert</p>
          {MERGE_TAGS.map((tag) => (
            <button
              key={tag.token}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onInsert(tag.token);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-subtle-gray"
            >
              <span className="block text-sm text-charcoal">{tag.label}</span>
              <span className="block text-[11px] text-muted-gray">{tag.hint}</span>
            </button>
          ))}
          <p className="px-3 pt-2 pb-1.5 mt-1 border-t border-border-light text-[11px] text-muted-gray leading-snug">
            Each person sees their own. Anyone without one has it left out, so write it
            so the line still reads without a name.
          </p>
        </div>
      )}
    </div>
  );
}

/** First choice on a new campaign: one listing, a group of several, or a free-form email */
function TypeChoice({ value, onChange }: { value: CampaignKind | ""; onChange: (v: CampaignKind) => void }) {
  const opts: { id: CampaignKind; label: string; hint: string }[] = [
    { id: "single", label: "Single", hint: "One listing" },
    { id: "group", label: "Multiple", hint: "Several listings in one email" },
    { id: "custom", label: "Custom", hint: "Write a normal email — no listing" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const on = value === o.id;
        return (
          <ChoiceButton key={o.id} selected={on} onClick={() => onChange(o.id)} title={o.hint}>
            {o.label}
          </ChoiceButton>
        );
      })}
    </div>
  );
}

