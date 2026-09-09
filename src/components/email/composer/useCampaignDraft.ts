"use client";

/**
 * useCampaignDraft — all composer state in one place.
 *
 * The draft mirrors CampaignFormData but keeps highlight rows as
 * { title, value } pairs with stable ids (so reordering keeps the caret).
 * `formData` is the exact payload the API expects — same shape the old modal
 * produced — so nothing downstream changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Campaign, CampaignFormData, CampaignType, CampaignFrequency, CampaignPriority, CampaignKind, GroupListing } from "@/lib/email/types";
import { EMAIL_SENDERS, EMAIL_SEGMENTS } from "@/lib/email/constants";
import { BROKERS, BROKER_CONTACTS, brokerIdForEmail, ListingItem } from "@/lib/admin-constants";
import { buildAutoHighlights, splitHighlight, joinHighlight } from "@/lib/email/utils";

export interface HighlightRow {
  id: number;
  title: string;
  value: string;
}

export interface CampaignDraft {
  kind: CampaignKind;           // "single" listing email or a "group" of several
  groupListings: GroupListing[]; // cards for group emails, in order
  listingId: string;
  listingName: string;
  campaignType: CampaignType;
  emailLabel: string;
  headingText: string;
  bodyText: string;
  photoUrl: string;
  partnerLogoUrl: string;       // hosted URL, or a data: URL while adjusting (blocks submit)
  partnerLogoWidth: number;
  partnerLogoHeight: number;
  listingPageUrl: string;
  highlights: HighlightRow[];
  brokerIds: string[];          // ordered — the first one is the sender
  priority: CampaignPriority;   // "high" = fight for a great slot, "normal" = fit anywhere
  segmentId: string;
  frequency: CampaignFrequency; // only used when campaignType === "recurring"
  endDate: string;              // "YYYY-MM-DD" or ""
  pinned: boolean;              // exempt from freshness decay
}

export type MissingField = "listing" | "group" | "broker" | "partnerLogo";

// Stable ids for highlight rows (module-level counter is fine — ids only need to be unique per session)
let nextRowId = 1;
const newRow = (title = "", value = ""): HighlightRow => ({ id: nextRowId++, title, value });

// ── Draft persistence (survives refresh / reload) ──
// Saved in localStorage per campaign ("new" for a fresh one). A partner logo that is
// still a data: URL (chosen but not applied) is not saved — it can be huge and isn't final.
const STORAGE_PREFIX = "cre8-email-draft:";
const storageKey = (campaignId?: string | null) => `${STORAGE_PREFIX}${campaignId || "new"}`;

interface StoredDraft {
  draft: CampaignDraft;
  savedAt: string; // ISO
}

function readStoredDraft(campaignId?: string | null): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed?.draft || !parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredDraft(campaignId: string | null | undefined, draft: CampaignDraft) {
  if (typeof window === "undefined") return;
  try {
    const safe: CampaignDraft = draft.partnerLogoUrl.startsWith("data:")
      ? { ...draft, partnerLogoUrl: "", partnerLogoWidth: 0, partnerLogoHeight: 0 }
      : draft;
    window.localStorage.setItem(storageKey(campaignId), JSON.stringify({ draft: safe, savedAt: new Date().toISOString() }));
  } catch {
    // Storage full or blocked — the composer still works, it just won't survive a refresh
  }
}

export function clearStoredDraft(campaignId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(campaignId));
  } catch {
    /* ignore */
  }
}

/** Make sure new highlight rows never reuse an id from a restored draft */
function bumpRowIds(draft: CampaignDraft) {
  const max = draft.highlights.reduce((m, r) => Math.max(m, r.id), 0);
  if (max >= nextRowId) nextRowId = max + 1;
}

/** Blank draft for a new campaign — broker defaults to the signed-in user when they're a broker */
function emptyDraft(userEmail: string): CampaignDraft {
  return {
    kind: "single",
    groupListings: [],
    listingId: "",
    listingName: "",
    campaignType: "one-time",
    emailLabel: "",
    headingText: "",
    bodyText: "",
    photoUrl: "",
    partnerLogoUrl: "",
    partnerLogoWidth: 0,
    partnerLogoHeight: 0,
    listingPageUrl: "",
    highlights: [],
    brokerIds: [brokerIdForEmail(userEmail) || EMAIL_SENDERS[0]?.id || ""].filter(Boolean),
    priority: "normal",
    segmentId: "all",
    frequency: "weekly",
    endDate: "",
    pinned: false,
  };
}

/** Preload a draft from an existing campaign (edit mode) */
function fromCampaign(c: Campaign): CampaignDraft {
  return {
    kind: c.campaign_kind === "group" ? "group" : "single",
    groupListings: c.campaign_kind === "group" ? c.group_listings || [] : [],
    listingId: c.listing_id || "",
    listingName: c.listing_name || "",
    campaignType: c.campaign_type || "one-time",
    emailLabel: c.email_label || "",
    headingText: c.heading_text || "",
    bodyText: c.body_text || "",
    photoUrl: c.photo_url || "",
    partnerLogoUrl: c.partner_logo_url || "",
    partnerLogoWidth: c.partner_logo_width || 0,
    partnerLogoHeight: c.partner_logo_height || 0,
    listingPageUrl: c.listing_page_url || "",
    highlights: (c.highlights || []).map((h) => {
      const { title, value } = splitHighlight(h);
      return newRow(title, value);
    }),
    // Primary first, then any extra brokers stored on the campaign
    brokerIds: Array.from(new Set([c.broker_id, ...(c.broker_ids || [])].filter(Boolean))),
    priority: c.priority === "high" ? "high" : "normal",
    segmentId: c.segment_id || "all",
    frequency: c.frequency && c.frequency !== "one-time" ? c.frequency : "weekly",
    endDate: c.end_date ? c.end_date.slice(0, 10) : "",
    pinned: !!c.pinned,
  };
}

export function useCampaignDraft({ campaign, userEmail }: { campaign?: Campaign | null; userEmail: string }) {
  const campaignId = campaign?.id ?? null;

  // Start from the campaign (edit) or blank (create), then prefer a saved draft from a
  // previous session if there is one that's newer than the campaign itself.
  const [initial] = useState(() => {
    const base = campaign ? fromCampaign(campaign) : emptyDraft(userEmail);
    const stored = readStoredDraft(campaignId);
    const storedIsNewer = stored && (!campaign?.updated_at || stored.savedAt > campaign.updated_at);
    if (stored && storedIsNewer && JSON.stringify(stored.draft) !== JSON.stringify(base)) {
      bumpRowIds(stored.draft);
      return { draft: stored.draft, base, restored: true, restoredAt: stored.savedAt };
    }
    return { draft: base, base, restored: false, restoredAt: null as string | null };
  });

  const [draft, setDraft] = useState<CampaignDraft>(initial.draft);
  const [restored, setRestored] = useState(initial.restored);
  // Snapshot for the dirty check — the campaign/blank baseline, not the restored draft
  const initialJsonRef = useRef(JSON.stringify(initial.base));

  // Save as you type (lightly debounced). Cleared on submit or discard.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (JSON.stringify(draft) === initialJsonRef.current) {
        clearStoredDraft(campaignId); // back to baseline — nothing worth keeping
      } else {
        writeStoredDraft(campaignId, draft);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [draft, campaignId]);

  /** Throw away the restored draft and go back to the campaign / blank form */
  const discardRestored = useCallback(() => {
    clearStoredDraft(campaignId);
    setDraft(initial.base);
    setRestored(false);
  }, [campaignId, initial.base]);

  /** Forget the saved copy (after a successful submit) */
  const forgetStored = useCallback(() => clearStoredDraft(campaignId), [campaignId]);

  /** Set one field */
  const set = useCallback(<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  /** Pick a listing → auto-fill everything listing-derived (same rules as the old form) */
  const pickListing = useCallback((listing: ListingItem) => {
    const fd = listing.fieldData;
    setDraft((d) => {
      const auto = buildAutoHighlights(fd).map((h) => {
        const { title, value } = splitHighlight(h);
        return newRow(title, value);
      });
      return {
        ...d,
        listingId: listing.id,
        listingName: fd.name || "",
        photoUrl: fd.gallery?.[0]?.url || "",
        listingPageUrl: fd.slug ? `https://cre8advisors.com/listings/${fd.slug}` : "",
        highlights: auto.length > 0 ? auto : d.highlights,
      };
    });
  }, []);

  // ── Highlight row actions ──
  const addHighlight = useCallback((title = "", value = ""): number => {
    const row = newRow(title, value);
    setDraft((d) => ({ ...d, highlights: [...d.highlights, row] }));
    return row.id;
  }, []);

  const updateHighlight = useCallback((id: number, patch: Partial<Pick<HighlightRow, "title" | "value">>) => {
    setDraft((d) => ({
      ...d,
      highlights: d.highlights.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }, []);

  const moveHighlight = useCallback((id: number, direction: "up" | "down") => {
    setDraft((d) => {
      const idx = d.highlights.findIndex((r) => r.id === id);
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= d.highlights.length) return d;
      const next = [...d.highlights];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...d, highlights: next };
    });
  }, []);

  const removeHighlight = useCallback((id: number) => {
    setDraft((d) => ({ ...d, highlights: d.highlights.filter((r) => r.id !== id) }));
  }, []);

  // ── Derived: the API payload ──
  const formData: CampaignFormData = useMemo(() => {
    const primaryId = draft.brokerIds[0] || "";
    const sender = EMAIL_SENDERS.find((s) => s.id === primaryId);
    const segment = EMAIL_SEGMENTS.find((s) => s.id === draft.segmentId);
    const isRecurring = draft.campaignType === "recurring";
    const isGroup = draft.kind === "group";
    return {
      // Groups carry a synthetic listing id (assigned by the API on create) and use the heading as the name
      listing_id: isGroup ? (draft.listingId.startsWith("group:") ? draft.listingId : "") : draft.listingId,
      // Group: the internal name (schedule cards, subject) = big heading, else the eyebrow, else a generic name
      listing_name: isGroup ? (draft.emailLabel.trim() || draft.headingText.trim() || "Group email") : draft.listingName,
      campaign_kind: draft.kind,
      group_listings: isGroup ? draft.groupListings : [],
      campaign_type: draft.campaignType,
      // Blank label → the email's default, exactly what the placeholder shows
      email_label: isGroup ? draft.emailLabel.trim() : (draft.emailLabel.trim() || "Just Listed"),
      heading_text: draft.headingText || undefined,
      body_text: draft.bodyText || undefined,
      photo_url: isGroup ? draft.groupListings[0]?.photo_url || undefined : draft.photoUrl || undefined,
      partner_logo_url: draft.partnerLogoUrl && !draft.partnerLogoUrl.startsWith("data:") ? draft.partnerLogoUrl : undefined,
      partner_logo_width: draft.partnerLogoWidth || undefined,
      partner_logo_height: draft.partnerLogoHeight || undefined,
      // Rows without a value are incomplete — drop them
      highlights: draft.highlights
        .filter((r) => r.value.trim())
        .map((r) => joinHighlight(r.title, r.value)),
      listing_page_url: draft.listingPageUrl || undefined,
      broker_id: primaryId,
      broker_name: sender?.name || BROKERS[primaryId] || "",
      broker_email: sender?.email || BROKER_CONTACTS[primaryId]?.email || "",
      broker_phone: sender?.phone || BROKER_CONTACTS[primaryId]?.phone || "",
      broker_ids: draft.brokerIds,
      priority: draft.priority,
      segment_id: draft.segmentId,
      segment_name: segment?.name || "All Contacts",
      frequency: isRecurring ? draft.frequency : "one-time",
      end_date: isRecurring && draft.endDate ? draft.endDate : undefined,
      pinned: isRecurring ? draft.pinned : false,
    };
  }, [draft]);

  // ── Validation: a listing and at least one broker (label defaults to "Just Listed") ──
  const missing: MissingField[] = useMemo(() => {
    const m: MissingField[] = [];
    if (draft.kind === "group") {
      if (draft.groupListings.length < 2) m.push("group");
    } else if (!draft.listingId) m.push("listing");
    if (draft.brokerIds.length === 0) m.push("broker");
    if (draft.partnerLogoUrl.startsWith("data:")) m.push("partnerLogo"); // chosen but not applied
    return m;
  }, [draft.kind, draft.groupListings.length, draft.listingId, draft.brokerIds, draft.partnerLogoUrl]);

  const isValid = missing.length === 0;
  const dirty = JSON.stringify(draft) !== initialJsonRef.current;

  return {
    draft,
    set,
    pickListing,
    addHighlight,
    updateHighlight,
    moveHighlight,
    removeHighlight,
    formData,
    missing,
    isValid,
    dirty,
    restored,
    restoredAt: initial.restoredAt,
    discardRestored,
    forgetStored,
  };
}
