"use client";

/**
 * Audience — multi-select live Resend segments + optional extra contact emails.
 */

import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { EMAIL_RE } from "@/lib/email/audience-tokens";
import { formatContactPrimaryLine } from "@/lib/email/contact-match";
import { AudienceCount } from "@/lib/email/types";
import { combineAudience, formatCount, recipientLine } from "@/lib/email/audience-client";

interface AudiencePickerProps {
  list: AudienceCount[];
  map: Record<string, AudienceCount>;
  loaded: boolean;
  error: boolean;
  segmentIds: string[];
  extraEmails: string[];
  onSegmentsChange: (ids: string[]) => void;
  onEmailsChange: (emails: string[]) => void;
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
  loaded,
  error,
  segmentIds,
  extraEmails,
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
    () => combineAudience(map, segmentIds, extraEmails.length),
    [map, segmentIds, extraEmails.length]
  );

  const toggle = (id: string) => {
    if (segmentIds.includes(id)) onSegmentsChange(segmentIds.filter((s) => s !== id));
    else onSegmentsChange([...segmentIds, id]);
  };

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return false;
    if (!extraEmails.includes(email)) onEmailsChange([...extraEmails, email]);
    setQuery("");
    setHits([]);
    return true;
  };

  const removeEmail = (email: string) => {
    onEmailsChange(extraEmails.filter((e) => e !== email));
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
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`px-4 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150 ${
                  on
                    ? "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                    : "bg-light-gray text-medium-gray hover:text-charcoal border border-transparent"
                }`}
              >
                {s.name}
                <span className={`ml-1.5 text-xs tabular-nums ${on ? "text-muted-gray" : "text-medium-gray/70"}`}>
                  · {formatCount(s.subscribed || s.total)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div>
        <label className="text-[11px] font-semibold text-muted-gray uppercase tracking-wide">Add contacts</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (hits[0]) addEmail(hits[0].email);
              else addEmail(query);
            }
          }}
          placeholder="Search or type an email"
          className="mt-1.5 w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal placeholder:text-border-medium focus:outline-none focus:ring-1 focus:ring-green"
        />
        {(searching || searchError || hits.length > 0 || (query.trim() && EMAIL_RE.test(query.trim()))) && (
          <div className="mt-1 border border-border-light rounded-btn bg-white overflow-hidden">
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
                  onClick={() => addEmail(h.email)}
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
                onClick={() => addEmail(query)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-light-gray"
              >
                Add <span className="font-medium">{query.trim().toLowerCase()}</span>
              </button>
            )}
          </div>
        )}
        {extraEmails.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extraEmails.map((email) => (
              <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-light-gray text-xs text-charcoal">
                {email}
                <button type="button" onClick={() => removeEmail(email)} className="text-muted-gray hover:text-charcoal" aria-label={`Remove ${email}`}>
                  ×
                </button>
              </span>
            ))}
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
      {segmentIds.length > 1 && (
        <p className="text-[11px] text-muted-gray">
          Each list is sent as its own broadcast — someone on two lists may get the email twice.
        </p>
      )}
    </div>
  );
}
