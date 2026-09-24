"use client";

/**
 * Audience — multi-select live Resend segments + optional extra contact emails.
 */

import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { EMAIL_RE } from "@/lib/email/audience-tokens";
import { lookalikeWarning } from "@/lib/email/lookalike-domain";
import { contactChipLabel, formatContactPrimaryLine } from "@/lib/email/contact-match";
import { AudienceCount } from "@/lib/email/types";
import { combineAudience, duplicateCount, formatCount, recipientLine } from "@/lib/email/audience-client";
import type { AudienceOverlap } from "@/lib/email/audience-overlap";
import { COMPOSER_FIELD, ChoiceButton } from "./composer-ui";

interface AudiencePickerProps {
  list: AudienceCount[];
  map: Record<string, AudienceCount>;
  /** Contacts grouped by the lists they're on — makes a multi-list count exact */
  overlaps?: AudienceOverlap[];
  loaded: boolean;
  error: boolean;
  segmentIds: string[];
  extraEmails: string[];
  extraContactNames?: Record<string, string>;
  onSegmentsChange: (ids: string[]) => void;
  onEmailsChange: (emails: string[], names?: Record<string, string>) => void;
}

type ContactHit = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  unsubscribed?: boolean;
  company?: string | null;
};

export default function AudiencePicker({
  list,
  map,
  overlaps,
  loaded,
  error,
  segmentIds,
  extraEmails,
  extraContactNames = {},
  onSegmentsChange,
  onEmailsChange,
}: AudiencePickerProps) {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const combined = useMemo(
    () => combineAudience(map, segmentIds, extraEmails.length, overlaps),
    [map, segmentIds, extraEmails.length, overlaps]
  );

  // People on more than one of the picked lists. They get one email, not two.
  const onBothLists = useMemo(
    () => duplicateCount(map, segmentIds, overlaps),
    [map, segmentIds, overlaps]
  );

  const toggle = (id: string) => {
    if (segmentIds.includes(id)) onSegmentsChange(segmentIds.filter((s) => s !== id));
    else onSegmentsChange([...segmentIds, id]);
  };

  const addContact = (raw: string, label?: string) => {
    const email = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return false;
    const chip = (label || "").trim() || email;
    const names = { ...extraContactNames, [email]: chip };
    if (!extraEmails.includes(email)) onEmailsChange([...extraEmails, email], names);
    else onEmailsChange(extraEmails, names);
    setQuery("");
    setHits([]);
    return true;
  };

  const addHit = (hit: ContactHit) => addContact(hit.email, contactChipLabel(hit));

  const removeEmail = (email: string) => {
    const names = { ...extraContactNames };
    delete names[email];
    onEmailsChange(extraEmails.filter((e) => e !== email), names);
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearchError(null);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/email/contacts?q=${encodeURIComponent(q)}`, {
          headers: { "x-user-email": userEmail },
        });
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) throw new Error(body.error || `search ${res.status}`);
        setHits((body.data || []) as ContactHit[]);
      } catch (err) {
        if (!alive) return;
        setHits([]);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (alive) setSearching(false);
      }
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query, userEmail]);

  return (
    <div className="space-y-3">
      {!loaded && <p className="text-xs text-muted-gray">Loading lists from Resend…</p>}
      {loaded && error && (
        <p className="text-xs text-red-500">Couldn&apos;t load Resend lists. You can still add individual emails below.</p>
      )}
      {loaded && !error && list.length === 0 && (
        <p className="text-xs text-muted-gray">No Resend segments found. Add Brokers / Buyers / Sellers in Resend, or add emails below.</p>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.map((s) => {
            const on = segmentIds.includes(s.id);
            return (
              <ChoiceButton key={s.id} selected={on} onClick={() => toggle(s.id)}>
                {s.name}
                <span className="ml-1.5 text-xs tabular-nums text-muted-gray">
                  · {formatCount(s.subscribed || s.total)}
                </span>
              </ChoiceButton>
            );
          })}
        </div>
      )}

      <div>
        <label className="text-[12px] font-medium text-medium-gray">Add contacts</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (hits[0]) addHit(hits[0]);
              else addContact(query);
            }
          }}
          placeholder="Search or type an email"
          className={`mt-1.5 ${COMPOSER_FIELD}`}
        />
        {(searching || searchError || hits.length > 0 || (query.trim() && EMAIL_RE.test(query.trim()))) && (
          <div className="mt-1.5 rounded-card bg-white overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
            {searching && <p className="px-3 py-2 text-xs text-muted-gray">Searching…</p>}
            {searchError && <p className="px-3 py-2 text-xs text-red-500">{searchError}</p>}
            {hits.map((h) => {
              const primary = formatContactPrimaryLine({
                id: h.id,
                email: h.email,
                first_name: h.first_name,
                last_name: h.last_name,
                company: h.company || "",
              });
              const already = extraEmails.includes(h.email.toLowerCase());
              const showEmail = primary.toLowerCase() !== h.email.toLowerCase();
              return (
                <button
                  key={h.id || h.email}
                  type="button"
                  disabled={already}
                  onClick={() => addHit(h)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-light-gray disabled:opacity-40"
                >
                  <span className="block text-charcoal">{primary}</span>
                  {showEmail && <span className="block text-xs text-muted-gray">{h.email}</span>}
                  {h.unsubscribed && (
                    <span className="block text-[10px] uppercase text-red-500">unsubscribed</span>
                  )}
                </button>
              );
            })}
            {!searching && hits.length === 0 && EMAIL_RE.test(query.trim()) && (
              <button
                type="button"
                onClick={() => addContact(query)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-light-gray"
              >
                Add <span className="font-medium">{query.trim().toLowerCase()}</span>
                {/* Catches near-misses like cre8adivsors.com — it would bounce silently */}
                {lookalikeWarning(query.trim()) && (
                  <span className="block text-xs text-amber-600 mt-0.5">{lookalikeWarning(query.trim())}</span>
                )}
              </button>
            )}
          </div>
        )}
        {extraEmails.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extraEmails.map((email) => {
              const label = extraContactNames[email] || email;
              return (
                <span
                  key={email}
                  title={lookalikeWarning(email) ? `${email} — ${lookalikeWarning(email)}` : email}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-card border bg-white text-xs ${
                    lookalikeWarning(email) ? "border-amber-400 text-amber-700" : "border-border-light text-charcoal"
                  }`}
                >
                  {lookalikeWarning(email) && <span aria-hidden>⚠</span>}
                  {label}
                  <button type="button" onClick={() => removeEmail(email)} className="text-muted-gray hover:text-charcoal" aria-label={`Remove ${label}`}>
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-gray min-h-[1rem]">
        {!loaded
          ? "Counting recipients…"
          : combined
          ? recipientLine(combined)
          : "Select at least one list (or add a contact) to send"}
      </p>
      {segmentIds.length > 1 && onBothLists > 0 && (
        <p className="text-[11px] text-muted-gray">
          {formatCount(onBothLists)} {onBothLists === 1 ? "person is" : "people are"} on more than one of these
          lists. {onBothLists === 1 ? "They get" : "They each get"} one email.
        </p>
      )}
    </div>
  );
}
