"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import RichTextEditor from "@/components/RichTextEditor";
import {
  INTERNAL_NOTE_FIELDS,
  EMPTY_INTERNAL_NOTES,
  type InternalNoteValues,
} from "@/lib/listings/internal-notes";

/* ============================================================
   INTERNAL SECTION — private notes at the top of a listing

   Three rich text boxes (Internal Asking Price, Zoning and Allowed
   Uses, Other). They are saved to Supabase only — never to Webflow,
   never to the public site — through an API route that requires a
   signed-in user.

   Saving is automatic: about a second after you stop typing.

   On a brand-new listing there is no listing id until its first
   save, so anything typed here is held on the page and saved as
   soon as the listing itself has been saved.
   ============================================================ */

interface InternalSectionProps {
  /** Webflow item id of the listing — null until a new listing is first saved */
  listingId: string | null;
  /** Listing name — stored next to the notes so the table is readable by hand */
  listingName: string;
}

/** How long to wait after the last keystroke before saving (ms) */
const SAVE_DELAY_MS = 1000;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function InternalSection({ listingId, listingName }: InternalSectionProps) {
  // The three boxes
  const [values, setValues] = useState<InternalNoteValues>({ ...EMPTY_INTERNAL_NOTES });

  // Loading existing notes. A new listing has nothing to load, so it starts ready.
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    listingId ? "loading" : "ready"
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // True when something has been typed that isn't saved yet
  const dirtyRef = useRef(false);
  // Latest values / id / name, readable from timers and the unmount cleanup
  const valuesRef = useRef(values);
  const listingIdRef = useRef(listingId);
  const listingNameRef = useRef(listingName);
  useEffect(() => {
    valuesRef.current = values;
    listingIdRef.current = listingId;
    listingNameRef.current = listingName;
  }, [values, listingId, listingName]);

  // The id this section loaded for. When a new listing gets its id on first
  // save we must NOT re-load (that would wipe what was just typed).
  const loadedForId = useRef<string | null>(null);

  // ---- Load existing notes (edit mode) ----
  const load = useCallback(async (id: string) => {
    setLoadState("loading");
    try {
      const res = await apiFetch(`/api/listings/internal/${id}`);
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      const data = await res.json();
      const notes = data.notes || {};
      setValues({
        asking_price: notes.asking_price || "",
        zoning_uses: notes.zoning_uses || "",
        other: notes.other || "",
      });
      loadedForId.current = id;
      setLoadState("ready");
    } catch (err) {
      // Stay in the error state — showing empty boxes here would let a save
      // overwrite real notes with blanks.
      console.error("[InternalSection] load failed:", err);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // Only load when the page opened on an existing listing
    if (listingId && loadState === "loading" && loadedForId.current !== listingId) {
      load(listingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Save the current boxes ----
  const save = useCallback(async () => {
    const id = listingIdRef.current;
    if (!id || !dirtyRef.current) return;

    const sent = valuesRef.current;
    setSaveStatus("saving");
    try {
      const res = await apiFetch(`/api/listings/internal/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sent, listing_name: listingNameRef.current }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);

      // Only mark clean if nothing was typed while the save was in flight —
      // otherwise the newer text still needs its own save.
      if (valuesRef.current === sent) {
        dirtyRef.current = false;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 3000);
      }
    } catch (err) {
      console.error("[InternalSection] save failed:", err);
      setSaveStatus("error");
    }
  }, []);

  // ---- Auto-save shortly after typing stops ----
  // Also runs when listingId arrives (a new listing's first save), which is
  // what sends notes typed before the listing existed.
  useEffect(() => {
    if (!dirtyRef.current || !listingId) return;
    const timer = setTimeout(save, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, listingId, save]);

  // ---- Leaving the page with unsaved typing: save it on the way out ----
  useEffect(() => {
    return () => {
      if (dirtyRef.current) save();
    };
  }, [save]);

  // ---- A box changed ----
  const handleChange = (key: keyof InternalNoteValues, html: string) => {
    // The editor reports its content once when it first appears; ignore
    // that so opening a listing doesn't count as an edit.
    if (valuesRef.current[key] === html) return;
    dirtyRef.current = true;
    setValues((prev) => ({ ...prev, [key]: html }));
  };

  return (
    <div className="mb-6 border border-[#E5E5E5] rounded-card bg-white">
      {/* ---- Section header ---- */}
      <div className="px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA] rounded-t-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Lock icon — signals this section is private */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider">
            Internal
          </h2>
          <span className="text-xs text-[#777]">
            Team only. Never shown on the website.
          </span>
        </div>

        {/* Save status */}
        <div className="text-xs font-medium whitespace-nowrap">
          {saveStatus === "saving" && <span className="text-[#B8860B]">Saving...</span>}
          {saveStatus === "saved" && <span className="text-[#4A8C1C]">Saved</span>}
          {saveStatus === "error" && (
            <span className="text-[#CC3333]">
              Save failed{" "}
              <button type="button" onClick={save} className="underline">
                Retry
              </button>
            </span>
          )}
        </div>
      </div>

      {/* ---- Section body ---- */}
      <div className="px-5 py-4">
        {/* Loading existing notes */}
        {loadState === "loading" && (
          <div className="flex items-center py-4 text-[#777] text-sm">
            <div className="w-[16px] h-[16px] border-2 border-[#E5E5E5] border-t-green rounded-full animate-spin mr-2.5" />
            Loading internal notes...
          </div>
        )}

        {/* Couldn't load — no boxes shown, so nothing can be overwritten */}
        {loadState === "error" && (
          <div className="py-3 text-sm text-[#CC3333]">
            Couldn&apos;t load the internal notes.{" "}
            <button
              type="button"
              onClick={() => listingId && load(listingId)}
              className="underline font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        {/* The three boxes */}
        {loadState === "ready" && (
          <div className="space-y-5">
            {INTERNAL_NOTE_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-1.5">
                  {field.label}
                </label>
                <RichTextEditor
                  value={values[field.key]}
                  onChange={(html) => handleChange(field.key, html)}
                  placeholder={field.placeholder}
                  compact
                />
              </div>
            ))}

            {/* New listing that hasn't been saved yet */}
            {!listingId && (
              <p className="text-xs text-[#777]">
                These notes save once the listing has a name and its first save.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
